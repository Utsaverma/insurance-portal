"""Business rules for the claim lifecycle: access control, the governed state machine, amounts and assignment.

The API layer calls these functions and never touches repositories directly. Failures are raised as
business errors (services/errors.py), which main.py maps to HTTP status codes.
"""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Claim, ClaimStatus, ClaimStatusHistory
from models.schemas import AssignRequest, ClaimCreate, StatusUpdateRequest, UserContext
from repositories.claim_repository import ClaimRepository
from services.errors import BusinessRuleViolation, Forbidden, InvalidTransition, NotFound
from services.notification_service import send_notification

# Role-gated claim lifecycle: current status → role → statuses that role may move the claim to.
TRANSITIONS: dict[ClaimStatus, dict[str, set[ClaimStatus]]] = {
    ClaimStatus.SUBMITTED: {"CASE_MANAGER": {ClaimStatus.ASSIGNED}},
    ClaimStatus.ASSIGNED: {"SURVEYOR": {ClaimStatus.UNDER_SURVEY}},
    ClaimStatus.UNDER_SURVEY: {"SURVEYOR": {ClaimStatus.SURVEYED}},
    ClaimStatus.SURVEYED: {"ADJUSTOR": {ClaimStatus.UNDER_ADJUDICATION}},
    ClaimStatus.UNDER_ADJUDICATION: {"ADJUSTOR": {ClaimStatus.APPROVED, ClaimStatus.REJECTED}},
    ClaimStatus.APPROVED: {"ADJUSTOR": {ClaimStatus.PAID}},
}

# Statuses before the survey is complete: sending a claim back here clears its assessed amount.
_BEFORE_SURVEY = {ClaimStatus.SUBMITTED, ClaimStatus.ASSIGNED, ClaimStatus.UNDER_SURVEY}
# An approved amount only stands while the claim is approved or paid.
_APPROVAL_STANDS = {ClaimStatus.APPROVED, ClaimStatus.PAID}
# Closed claims keep their last assignment; a rejected claim is reopened by a case-manager override first.
_CLOSED = {ClaimStatus.PAID, ClaimStatus.REJECTED}


def _actor(user: UserContext) -> str:
    """How the audit trail names whoever acted."""
    return user.full_name or user.email


def validate_transition(current: ClaimStatus, requested: ClaimStatus, role: str) -> None:
    if role == "CASE_MANAGER":
        return
    allowed = TRANSITIONS.get(current, {}).get(role, set())
    if requested not in allowed:
        raise InvalidTransition(f"Invalid state transition: {current} → {requested} not allowed for role {role}")


def is_override(current: ClaimStatus, requested: ClaimStatus, role: str) -> bool:
    """A case manager moving a claim anywhere other than along their own step of the workflow."""
    return role == "CASE_MANAGER" and requested not in TRANSITIONS.get(current, {}).get(role, set())


def _validate_amounts(claim: Claim, req: StatusUpdateRequest) -> None:
    if req.assessed_amount is not None and req.status != ClaimStatus.SURVEYED:
        raise BusinessRuleViolation("An assessed amount can only be set when the survey is completed (SURVEYED)")
    if req.approved_amount is not None and req.status != ClaimStatus.APPROVED:
        raise BusinessRuleViolation("An approved amount can only be set when the claim is approved (APPROVED)")
    if req.status == ClaimStatus.SURVEYED and req.assessed_amount is None:
        raise BusinessRuleViolation("An assessed amount is required to complete the survey")
    if req.status == ClaimStatus.APPROVED:
        if req.approved_amount is None:
            raise BusinessRuleViolation("An approved amount is required to approve the claim")
        if req.approved_amount > claim.claimed_amount:
            raise BusinessRuleViolation(
                f"The approved amount cannot exceed the claimed amount ({claim.claimed_amount})"
            )
    # Payment settles the approved amount, so there must be one: PAID is reachable only from APPROVED.
    if req.status == ClaimStatus.PAID and claim.approved_amount is None:
        raise BusinessRuleViolation("A claim can only be paid once it has an approved amount")


def _amounts_after(claim: Claim, req: StatusUpdateRequest) -> tuple[Decimal | None, Decimal | None]:
    assessed = req.assessed_amount if req.assessed_amount is not None else claim.assessed_amount
    if req.status in _BEFORE_SURVEY:
        assessed = None
    approved = req.approved_amount if req.approved_amount is not None else claim.approved_amount
    if req.status not in _APPROVAL_STANDS:
        approved = None
    return assessed, approved


def ensure_can_access(user: UserContext, claim: Claim) -> None:
    """Customers may only see their own claims; internal roles see every claim."""
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise Forbidden("Access denied")


async def get_accessible_claim(claim_id: uuid.UUID, user: UserContext, db: AsyncSession) -> Claim:
    claim = await ClaimRepository(db).get_by_id(claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    ensure_can_access(user, claim)
    return claim


async def submit_claim(body: ClaimCreate, user: UserContext, db: AsyncSession) -> Claim:
    repo = ClaimRepository(db)
    claim = await repo.create(body, user.id)
    # First notice of loss starts the audit trail.
    await repo.add_history(claim.id, None, ClaimStatus.SUBMITTED, user.id, "Claim submitted", _actor(user))
    await send_notification(
        claim_id=claim.id,
        recipient_id=user.id,
        channel="internal",
        message=f"Claim {claim.claim_number} received",
        db=db,
    )
    return claim


async def list_claims(user: UserContext, db: AsyncSession, skip: int, limit: int) -> tuple[list[Claim], int]:
    customer_filter = user.id if user.role == "CUSTOMER" else None
    return await ClaimRepository(db).list_claims(customer_id=customer_filter, skip=skip, limit=limit)


async def get_history(claim_id: uuid.UUID, user: UserContext, db: AsyncSession) -> list[ClaimStatusHistory]:
    await get_accessible_claim(claim_id, user, db)
    return await ClaimRepository(db).get_history(claim_id)


async def update_status(
    claim_id: uuid.UUID,
    req: StatusUpdateRequest,
    user: UserContext,
    db: AsyncSession,
) -> Claim:
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    if claim.status == ClaimStatus.PAID:
        raise InvalidTransition("A paid claim is final and its status cannot change")
    validate_transition(claim.status, req.status, user.role)

    override = is_override(claim.status, req.status, user.role)
    reason = (req.note or "").strip()
    if override and not reason:
        raise BusinessRuleViolation("A reason is required when a case manager overrides the workflow")
    _validate_amounts(claim, req)

    assessed, approved = _amounts_after(claim, req)
    note = f"Case manager override: {reason}" if override else req.note
    updated = await repo.update_status(
        claim, req.status, user.id, note, assessed, approved, changed_by_name=_actor(user)
    )
    await send_notification(
        claim_id=claim_id,
        recipient_id=updated.customer_id,
        channel="internal",
        message=f"Claim {updated.claim_number} status changed to {req.status}",
        db=db,
    )
    return updated


async def assign_claim(
    claim_id: uuid.UUID,
    req: AssignRequest,
    user: UserContext,
    db: AsyncSession,
    assignee_name: str | None = None,
) -> Claim:
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    if claim.status in _CLOSED:
        raise InvalidTransition("Closed claims (paid or rejected) cannot be reassigned")
    new_status = None
    if claim.status == ClaimStatus.SUBMITTED:
        if user.role != "CASE_MANAGER":
            raise Forbidden("Only case managers can assign a submitted claim")
        new_status = ClaimStatus.ASSIGNED
    verb = "Assigned" if new_status is not None else "Reassigned"
    note = f"{verb} to {assignee_name}" if assignee_name else f"{verb} to a claims handler"
    updated = await repo.assign(claim, req.assigned_to, user.id, new_status, note, changed_by_name=_actor(user))
    if new_status is not None:
        await send_notification(
            claim_id=claim_id,
            recipient_id=updated.customer_id,
            channel="internal",
            message=f"Claim {updated.claim_number} status changed to {new_status}",
            db=db,
        )
    return updated
