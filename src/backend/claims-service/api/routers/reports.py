from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import require_role
from dependencies.db import get_db
from models.schemas import ReportSummary, UserContext
from services import reporting_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportSummary)
async def summary(
    user: UserContext = Depends(require_role(*reporting_service.REPORT_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    return await reporting_service.summary(db)
