import uuid

from fastapi import APIRouter, Depends, Query, Request, status
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
from services import claims_service
from services.user_directory import SKIP_ROLES, get_staff_directory

router = APIRouter(prefix="/claims", tags=["claims"])


def _to_response(claim: Claim, directory: dict[str, str]) -> ClaimResponse:
    resp = ClaimResponse.model_validate(claim)
    if claim.assigned_to is not None:
        resp.assigned_staff_name = directory.get(str(claim.assigned_to))
    return resp


async def _staff_directory(request: Request, user: UserContext, token: str) -> dict[str, str]:
    if user.role in SKIP_ROLES:
        return {}
    return await get_staff_directory(
        request.app.state.http_client, request.app.state.redis, token, request.state.request_id
    )


@router.post("", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
async def submit_claim(
    body: ClaimCreate,
    user: UserContext = Depends(require_role("CUSTOMER")),
    db: AsyncSession = Depends(get_db),
):
    claim = await claims_service.submit_claim(body, user, db)
    return ClaimResponse.model_validate(claim)


@router.get("", response_model=ClaimListResponse)
async def list_claims(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=1000),
    user: UserContext = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
):
    items, total = await claims_service.list_claims(user, db, skip=skip, limit=limit)
    directory = await _staff_directory(request, user, token)
    return ClaimListResponse(items=[_to_response(c, directory) for c in items], total=total)


@router.get("/{claim_id}", response_model=ClaimResponse)
async def get_claim(
    claim_id: uuid.UUID,
    request: Request,
    user: UserContext = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
):
    claim = await claims_service.get_accessible_claim(claim_id, user, db)
    directory = await _staff_directory(request, user, token)
    return _to_response(claim, directory)


@router.patch("/{claim_id}/status", response_model=ClaimResponse)
async def update_status(
    claim_id: uuid.UUID,
    body: StatusUpdateRequest,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    claim = await claims_service.update_status(claim_id, body, user, db)
    return ClaimResponse.model_validate(claim)


@router.post("/{claim_id}/assign", response_model=ClaimResponse)
async def assign_claim(
    claim_id: uuid.UUID,
    body: AssignRequest,
    user: UserContext = Depends(require_role("CASE_MANAGER", "REGIONAL_MANAGER")),
    db: AsyncSession = Depends(get_db),
):
    claim = await claims_service.assign_claim(claim_id, body, user, db)
    return ClaimResponse.model_validate(claim)


@router.get("/{claim_id}/history", response_model=list[HistoryEntry])
async def get_history(
    claim_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    history = await claims_service.get_history(claim_id, user, db)
    return [HistoryEntry.model_validate(h) for h in history]
