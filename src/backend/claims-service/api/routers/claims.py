import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_bearer_token, get_current_user, require_role
from dependencies.db import get_db
from models.db_models import Claim
from models.schemas import (
    AssignRequest,
    ClaimCreate,
    ClaimListResponse,
    ClaimResponse,
    HistoryEntry,
    StatusUpdateRequest,
    UserContext,
)
from repositories.claim_repository import ClaimRepository
from services import claims_service
from services.user_directory import SKIP_ROLES, fetch_staff_directory

router = APIRouter(prefix="/claims", tags=["claims"])


def _to_response(claim: Claim, directory: dict[str, str]) -> ClaimResponse:
    resp = ClaimResponse.model_validate(claim)
    if claim.assigned_to is not None:
        resp.assigned_staff_name = directory.get(str(claim.assigned_to))
    return resp


async def _get_staff_directory(request: Request, user: UserContext, token: str) -> dict[str, str]:
    if user.role in SKIP_ROLES:
        return {}
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    client = request.app.state.http_client
    return await fetch_staff_directory(client, token, request_id)


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
    request: Request,
    skip: int = 0,
    limit: int = 20,
    user: UserContext = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
):
    repo = ClaimRepository(db)
    customer_filter = user.id if user.role == "CUSTOMER" else None
    items, total = await repo.list_claims(customer_id=customer_filter, skip=skip, limit=limit)
    directory = await _get_staff_directory(request, user, token)
    return ClaimListResponse(items=[_to_response(c, directory) for c in items], total=total)


@router.get("/{claim_id}", response_model=ClaimResponse)
async def get_claim(
    claim_id: uuid.UUID,
    request: Request,
    user: UserContext = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
):
    repo = ClaimRepository(db)
    claim = await repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    directory = await _get_staff_directory(request, user, token)
    return _to_response(claim, directory)


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


@router.post("/{claim_id}/assign", response_model=ClaimResponse)
async def assign_claim(
    claim_id: uuid.UUID,
    body: AssignRequest,
    request: Request,
    user: UserContext = Depends(require_role("CASE_MANAGER", "REGIONAL_MANAGER")),
    db: AsyncSession = Depends(get_db),
):
    redis_client = request.app.state.redis
    updated = await claims_service.assign_claim(claim_id, body, user, db, redis_client)
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
