from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.db import get_db
from dependencies.policy import require_permission
from models.schemas import ReportSummary, UserContext
from services import reporting_service
from services.workflow_policy import VIEW_REPORTS

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportSummary)
async def summary(
    user: UserContext = Depends(require_permission(VIEW_REPORTS)),
    db: AsyncSession = Depends(get_db),
):
    return await reporting_service.summary(db)
