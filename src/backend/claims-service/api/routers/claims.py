import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user, require_role
from dependencies.db import get_db
from models.schemas import (
    ClaimCreate,
    ClaimListResponse,
    ClaimResponse,
    HistoryEntry,
    StatusUpdateRequest,
    UserContext,
)
from repositories.claim_repository import ClaimRepository
from services import claims_service

router = APIRouter(prefix="/claims", tags=["claims"])


@router.post("", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
async def submit_claim(
    body: ClaimCreate,
    user: UserContext = Depends(require_role("CUSTOMER")),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    repo = ClaimRepository(db)
    claim = await repo.create(body, user.id)
    return ClaimResponse.model_validate(claim)


@router.get("", response_model=ClaimListResponse)
async def list_claims(
    skip: int = 0,
    limit: int = 20,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ClaimRepository(db)
    customer_filter = user.id if user.role == "CUSTOMER" else None
    items, total = await repo.list_claims(customer_id=customer_filter, skip=skip, limit=limit)
    return ClaimListResponse(items=[ClaimResponse.model_validate(c) for c in items], total=total)


@router.get("/{claim_id}", response_model=ClaimResponse)
async def get_claim(
    claim_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return ClaimResponse.model_validate(claim)


@router.patch("/{claim_id}/status", response_model=ClaimResponse)
async def update_status(
    claim_id: uuid.UUID,
    body: StatusUpdateRequest,
    request: Request,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    redis_client = request.app.state.redis
    updated = await claims_service.update_status(claim_id, body, user, db, redis_client)
    return ClaimResponse.model_validate(updated)


@router.get("/{claim_id}/history", response_model=list[HistoryEntry])
async def get_history(
    claim_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    history = await repo.get_history(claim_id)
    return [HistoryEntry.model_validate(h) for h in history]
