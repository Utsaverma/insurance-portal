import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_bearer_token, get_current_user
from dependencies.db import get_db
from dependencies.workflow import get_workflow, require_permission
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
from services.user_directory import SKIP_ROLES, Directory, get_staff_directory
from services.workflow_policy import ASSIGN, REASSIGN, SUBMIT, WorkflowPolicy

router = APIRouter(prefix="/claims", tags=["claims"])


def _to_response(
    claim: Claim, user: UserContext, workflow: WorkflowPolicy, directory: Directory | None = None
) -> ClaimResponse:
    resp = ClaimResponse.model_validate(claim)
    resp.allowed_actions = claims_service.allowed_actions(claim, user, workflow)
    assignee = directory.get(str(claim.assigned_to)) if directory and claim.assigned_to is not None else None
    if assignee is not None:
        resp.assigned_staff_name = assignee.name
    return resp


async def _staff_directory(request: Request, user: UserContext, token: str, refresh: bool = False) -> Directory:
    if user.role in SKIP_ROLES:
        return {}
    return await get_staff_directory(
        request.app.state.http_client, request.app.state.redis, token, request.state.request_id, refresh=refresh
    )


@router.post("", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
async def submit_claim(
    body: ClaimCreate,
    user: UserContext = Depends(require_permission(SUBMIT)),
    db: AsyncSession = Depends(get_db),
    workflow: WorkflowPolicy = Depends(get_workflow),
):
    claim = await claims_service.submit_claim(body, user, db)
    return _to_response(claim, user, workflow)


@router.get("", response_model=ClaimListResponse)
async def list_claims(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=1000),
    user: UserContext = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
    workflow: WorkflowPolicy = Depends(get_workflow),
):
    items, total = await claims_service.list_claims(user, db, skip=skip, limit=limit)
    directory = await _staff_directory(request, user, token)
    return ClaimListResponse(items=[_to_response(c, user, workflow, directory) for c in items], total=total)


@router.get("/{claim_id}", response_model=ClaimResponse)
async def get_claim(
    claim_id: uuid.UUID,
    request: Request,
    user: UserContext = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
    workflow: WorkflowPolicy = Depends(get_workflow),
):
    claim = await claims_service.get_accessible_claim(claim_id, user, db)
    directory = await _staff_directory(request, user, token)
    return _to_response(claim, user, workflow, directory)


@router.patch("/{claim_id}/status", response_model=ClaimResponse)
async def update_status(
    claim_id: uuid.UUID,
    body: StatusUpdateRequest,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    workflow: WorkflowPolicy = Depends(get_workflow),
):
    claim = await claims_service.update_status(claim_id, body, user, db, workflow)
    return _to_response(claim, user, workflow)


@router.post("/{claim_id}/assign", response_model=ClaimResponse)
async def assign_claim(
    claim_id: uuid.UUID,
    body: AssignRequest,
    request: Request,
    user: UserContext = Depends(require_permission(ASSIGN, REASSIGN)),
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
    workflow: WorkflowPolicy = Depends(get_workflow),
):
    # The directory says who the assignee is: the service checks their role, and the audit trail
    # records them by name, not by internal id.
    directory = await _staff_directory(request, user, token)
    if str(body.assigned_to) not in directory:
        # The cached directory may predate this user, so look once more before refusing.
        directory = await _staff_directory(request, user, token, refresh=True)
    claim = await claims_service.assign_claim(
        claim_id, body, user, db, workflow, assignee=directory.get(str(body.assigned_to))
    )
    return _to_response(claim, user, workflow, directory)


@router.get("/{claim_id}/history", response_model=list[HistoryEntry])
async def get_history(
    claim_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    history = await claims_service.get_history(claim_id, user, db)
    return [HistoryEntry.model_validate(h) for h in history]
