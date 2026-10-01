from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import RolePermission, WorkflowTransition


class WorkflowRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def transitions(self) -> list[tuple[str, str, str]]:
        rows = await self.db.execute(
            select(WorkflowTransition.from_status, WorkflowTransition.role, WorkflowTransition.to_status)
        )
        return [(str(f), r, str(t)) for f, r, t in rows.all()]

    async def permissions(self) -> list[tuple[str, str]]:
        rows = await self.db.execute(select(RolePermission.role, RolePermission.permission))
        return [(r, p) for r, p in rows.all()]
