from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import OutboxEvent


class OutboxRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def lock_due(self, limit: int) -> list[OutboxEvent]:
        """Up to `limit` pending events whose time has come, oldest first, locked until the transaction ends.
        SKIP LOCKED: events another dispatcher holds are passed over, not waited for, so dispatchers can run
        side by side without both sending the same event."""
        q = (
            select(OutboxEvent)
            .where(OutboxEvent.status == "pending", OutboxEvent.available_at <= func.now())
            .order_by(OutboxEvent.created_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list((await self.db.execute(q)).scalars().all())
