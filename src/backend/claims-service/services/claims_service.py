import uuid
from typing import Optional

import redis.asyncio as aioredis

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.db_models import ClaimStatus
from models.schemas import AssignRequest, StatusUpdateRequest, UserContext
from repositories.claim_repository import ClaimRepository
from services.notification_service import send_notification

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition: {current} → {requested} not allowed for role {role}",
        )


async def update_status(
    claim_id: uuid.UUID,
    req: StatusUpdateRequest,
    user: UserContext,
    db: AsyncSession,
    redis_client: aioredis.Redis,
) -> object:
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    validate_transition(claim.status, req.status, user.role)
    updated = await repo.update_status(claim, req.status, user.id, req.note)
    await redis_client.delete(f"claim:{claim_id}:status")
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
    redis_client: aioredis.Redis,
) -> object:
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    new_status = None
    if claim.status == ClaimStatus.SUBMITTED:
        if user.role != "CASE_MANAGER":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only case managers can assign a submitted claim",
            )
        new_status = ClaimStatus.ASSIGNED
    updated = await repo.assign(claim, req.assigned_to, user.id, new_status)
    if new_status is not None:
        await redis_client.delete(f"claim:{claim_id}:status")
        await send_notification(
            claim_id=claim_id,
            recipient_id=updated.customer_id,
            channel="internal",
            message=f"Claim {updated.claim_number} status changed to {new_status}",
            db=db,
        )
    return updated


async def get_claim_status_cached(
    claim_id: uuid.UUID,
    db: AsyncSession,
    redis_client: aioredis.Redis,
) -> Optional[str]:
    key = f"claim:{claim_id}:status"
    cached = await redis_client.get(key)
    if cached:
        return cached.decode()
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if not claim:
        return None
    await redis_client.setex(key, settings.redis_cache_ttl, claim.status)
    return claim.status
