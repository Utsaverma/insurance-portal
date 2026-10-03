from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.db import get_db
from dependencies.workflow import require_permission
from models.schemas import PolicyResponse, UserContext
from services.policy_gateway import TablePolicyGateway
from services.workflow_policy import SUBMIT

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=list[PolicyResponse])
async def my_policies(
    user: UserContext = Depends(require_permission(SUBMIT)),
    db: AsyncSession = Depends(get_db),
):
    """The policies held in the caller's name, latest-ending first: what they can claim against."""
    today = datetime.now(timezone.utc).date()
    policies = await TablePolicyGateway(db).held_by(user.email)
    return [PolicyResponse(**asdict(p), in_force=p.in_force_on(today)) for p in policies]
