"""Business rules for the claim lifecycle: access control, the governed state machine and assignment.

The API layer calls these functions and never touches repositories directly. Failures are raised as
business errors (services/errors.py), which main.py maps to HTTP status codes.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Claim, ClaimStatus, ClaimStatusHistory
from models.schemas import AssignRequest, ClaimCreate, StatusUpdateRequest, UserContext
from repositories.claim_repository import ClaimRepository
from services.errors import Forbidden, InvalidTransition, NotFound
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


def validate_transition(current: ClaimStatus, requested: ClaimStatus, role: str) -> None:
    if role == "CASE_MANAGER":
        return
    allowed = TRANSITIONS.get(current, {}).get(role, set())
    if requested not in allowed:
        raise InvalidTransition(f"Invalid state transition: {current} → {requested} not allowed for role {role}")


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
    return await ClaimRepository(db).create(body, user.id)


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
    validate_transition(claim.status, req.status, user.role)
    updated = await repo.update_status(claim, req.status, user.id, req.note)
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
) -> Claim:
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    new_status = None
    if claim.status == ClaimStatus.SUBMITTED:
        if user.role != "CASE_MANAGER":
            raise Forbidden("Only case managers can assign a submitted claim")
        new_status = ClaimStatus.ASSIGNED
    updated = await repo.assign(claim, req.assigned_to, user.id, new_status)
    if new_status is not None:
        await send_notification(
            claim_id=claim_id,
            recipient_id=updated.customer_id,
            channel="internal",
            message=f"Claim {updated.claim_number} status changed to {new_status}",
            db=db,
        )
    return updated
