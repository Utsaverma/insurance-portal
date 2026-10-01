"""Business rules for the claim lifecycle: access control, the governed state machine, amounts and assignment.

The API layer calls these functions and never touches repositories directly. Failures are raised as
business errors (services/errors.py), which main.py maps to HTTP status codes.
"""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Claim, ClaimStatus, ClaimStatusHistory
from models.schemas import AllowedActions, AssignRequest, ClaimCreate, StaffMember, StatusUpdateRequest, UserContext
from repositories.claim_repository import ClaimRepository
from services.errors import BusinessRuleViolation, Forbidden, InvalidTransition, NotFound
from services.notification_service import send_notification
from services.workflow_policy import ASSIGN, OVERRIDE, REASSIGN, UPLOAD, WORK, WorkflowPolicy

# Who may take which step, and who holds which permission, is the workflow policy (services.workflow_policy),
# configurable in the database. The rules below are structural: what the statuses and amounts mean.

# Statuses before the survey is complete: sending a claim back here clears its assessed amount.
_BEFORE_SURVEY = {ClaimStatus.SUBMITTED, ClaimStatus.ASSIGNED, ClaimStatus.UNDER_SURVEY}
# An approved amount only stands while the claim is approved or paid.
_APPROVAL_STANDS = {ClaimStatus.APPROVED, ClaimStatus.PAID}
# Closed claims keep their last assignment; a rejected claim is reopened by a case-manager override first.
_CLOSED = {ClaimStatus.PAID, ClaimStatus.REJECTED}


def _actor(user: UserContext) -> str:
    """How the audit trail names whoever acted."""
    return user.full_name or user.email


def validate_transition(current: ClaimStatus, requested: ClaimStatus, role: str, policy: WorkflowPolicy) -> None:
    if policy.allows(role, OVERRIDE):
        return
    if requested not in policy.steps(current, role):
        raise InvalidTransition(f"Invalid state transition: {current} → {requested} not allowed for role {role}")


def is_override(current: ClaimStatus, requested: ClaimStatus, role: str, policy: WorkflowPolicy) -> bool:
    """A role holding the override permission moving a claim anywhere other than along its own steps."""
    return policy.allows(role, OVERRIDE) and requested not in policy.steps(current, role)


def is_pickup(claim: Claim, requested: ClaimStatus, user: UserContext, policy: WorkflowPolicy) -> bool:
    """Taking a surveyed claim from the adjudication queue: completing the survey leaves the claim
    unassigned, and whoever takes its next step becomes its assignee."""
    return (
        policy.allows(user.role, WORK)
        and claim.status == ClaimStatus.SURVEYED
        and claim.assigned_to is None
        and requested in policy.steps(claim.status, user.role)
    )


def ensure_assignee(user: UserContext, claim: Claim, requested: ClaimStatus, policy: WorkflowPolicy) -> None:
    """Workers (surveyors and adjustors) act only on claims assigned to them; the one exception is the pickup."""
    if not policy.allows(user.role, WORK) or claim.assigned_to == user.id or is_pickup(claim, requested, user, policy):
        return
    raise Forbidden("This claim is not assigned to you")


def can_upload(user: UserContext, claim: Claim, policy: WorkflowPolicy) -> bool:
    # A paid claim is final, its documents included. A rejected one still takes evidence for a reopening.
    if claim.status == ClaimStatus.PAID or not policy.allows(user.role, UPLOAD):
        return False
    if user.role == "CUSTOMER":
        return claim.customer_id == user.id
    return not policy.allows(user.role, WORK) or claim.assigned_to == user.id


def can_assign(user: UserContext, claim: Claim, policy: WorkflowPolicy) -> bool:
    if claim.status in _CLOSED:
        return False
    return policy.allows(user.role, ASSIGN if claim.status == ClaimStatus.SUBMITTED else REASSIGN)


def allowed_actions(claim: Claim, user: UserContext, policy: WorkflowPolicy) -> AllowedActions:
    """The actions update_status, assign_claim and the upload route would accept from this user now."""
    steps = policy.steps(claim.status, user.role)
    transitions = [
        s for s in ClaimStatus
        if s in steps
        # SUBMITTED → ASSIGNED is taken by assigning the claim, which gives it an owner.
        and not (claim.status == ClaimStatus.SUBMITTED and s == ClaimStatus.ASSIGNED)
        and (not policy.allows(user.role, WORK) or claim.assigned_to == user.id or is_pickup(claim, s, user, policy))
        and not (s == ClaimStatus.PAID and claim.approved_amount is None)
    ]
    overrides = []
    if policy.allows(user.role, OVERRIDE) and claim.status != ClaimStatus.PAID:
        overrides = [
            s for s in ClaimStatus
            if s != claim.status
            and is_override(claim.status, s, user.role, policy)
            and not (claim.status == ClaimStatus.SUBMITTED and s == ClaimStatus.ASSIGNED)
            and not (s == ClaimStatus.PAID and claim.approved_amount is None)
        ]
    return AllowedActions(
        transitions=transitions,
        overrides=overrides,
        assign=can_assign(user, claim, policy),
        upload=can_upload(user, claim, policy),
    )


def _assignee_after(
    claim: Claim, req: StatusUpdateRequest, user: UserContext, policy: WorkflowPolicy
) -> uuid.UUID | None:
    # The survey is the surveyor's last step: the claim waits, unassigned, for an adjustor to pick it up.
    if req.status == ClaimStatus.SURVEYED:
        return None
    if is_pickup(claim, req.status, user, policy):
        return user.id
    return claim.assigned_to


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
    policy: WorkflowPolicy,
) -> Claim:
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    if claim.status == ClaimStatus.PAID:
        raise InvalidTransition("A paid claim is final and its status cannot change")
    if req.status == claim.status:
        # Not a transition at all; without this a case-manager "override" could rewrite an approved amount.
        raise InvalidTransition(f"Invalid state transition: the claim is already {claim.status}")
    validate_transition(claim.status, req.status, user.role, policy)
    ensure_assignee(user, claim, req.status, policy)

    override = is_override(claim.status, req.status, user.role, policy)
    reason = (req.note or "").strip()
    if override and not reason:
        raise BusinessRuleViolation("A reason is required when a case manager overrides the workflow")
    if req.status == ClaimStatus.REJECTED and not reason:
        # The customer reads this on their claim's timeline.
        raise BusinessRuleViolation("A reason is required to reject a claim")
    _validate_amounts(claim, req)

    assessed, approved = _amounts_after(claim, req)
    note = f"Case manager override: {reason}" if override else req.note
    updated = await repo.update_status(
        claim,
        req.status,
        user.id,
        note,
        assessed,
        approved,
        changed_by_name=_actor(user),
        assigned_to=_assignee_after(claim, req, user, policy),
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
    policy: WorkflowPolicy,
    assignee: StaffMember | None = None,
) -> Claim:
    """Assign the claim to `assignee`, the staff-directory entry for `req.assigned_to` (None if unknown)."""
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    if claim.status in _CLOSED:
        raise InvalidTransition("Closed claims (paid or rejected) cannot be reassigned")
    if assignee is None:
        raise BusinessRuleViolation("The assignee is not a known staff member")
    if not policy.allows(assignee.role, WORK):
        raise BusinessRuleViolation("A claim can only be assigned to a surveyor or an adjustor")
    new_status = None
    if claim.status == ClaimStatus.SUBMITTED:
        if not policy.allows(user.role, ASSIGN):
            raise Forbidden("Only case managers can assign a submitted claim")
        new_status = ClaimStatus.ASSIGNED
    elif not policy.allows(user.role, REASSIGN):
        raise Forbidden("Your role cannot reassign claims")
    verb = "Assigned" if new_status is not None or claim.assigned_to is None else "Reassigned"
    note = f"{verb} to {assignee.name}"
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
