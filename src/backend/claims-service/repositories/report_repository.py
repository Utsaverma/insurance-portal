"""Read-only aggregate queries behind the internal reports.

Every figure is computed in the database, so a report costs the same whether there are a hundred claims or
a million, and nothing but the totals and a handful of rows leaves the service.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, case, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Claim, ClaimStatus, ClaimStatusHistory

CLOSED = (ClaimStatus.PAID, ClaimStatus.REJECTED)
OPEN = tuple(s for s in ClaimStatus if s not in CLOSED)


class ReportRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _closed_at(self):
        """When each claim was closed: its latest move to PAID or REJECTED in the audit trail. (updated_at is
        not it: a reassignment or any later write moves it.)"""
        return (
            select(ClaimStatusHistory.claim_id, func.max(ClaimStatusHistory.changed_at).label("closed_at"))
            .where(ClaimStatusHistory.to_status.in_([s.value for s in CLOSED]))
            .group_by(ClaimStatusHistory.claim_id)
            .subquery()
        )

    def _seconds_between(self, start, end):
        # SQLite, which the unit tests run on, has no interval type.
        if self.db.get_bind().dialect.name == "sqlite":
            return (func.julianday(end) - func.julianday(start)) * 86400.0
        return func.extract("epoch", end - start)

    async def count_by_status(self) -> dict[ClaimStatus, int]:
        rows = await self.db.execute(select(Claim.status, func.count()).group_by(Claim.status))
        return {ClaimStatus(status): n for status, n in rows.all()}

    async def amount_totals(self) -> tuple[Decimal, Decimal]:
        """Approved amounts (paid claims were approved first, so they count) and paid amounts."""
        approved = func.sum(case((Claim.status.in_([ClaimStatus.APPROVED, ClaimStatus.PAID]), Claim.approved_amount)))
        paid = func.sum(case((Claim.status == ClaimStatus.PAID, Claim.approved_amount)))
        row = (await self.db.execute(select(func.coalesce(approved, 0), func.coalesce(paid, 0)))).one()
        return Decimal(row[0]), Decimal(row[1])

    async def processing_time(self) -> tuple[int, float | None]:
        """How many claims are closed, and their average submission-to-close time in seconds."""
        closed = self._closed_at()
        closed_at = func.coalesce(closed.c.closed_at, Claim.updated_at)
        q = (
            select(func.count(), func.avg(self._seconds_between(Claim.created_at, closed_at)))
            .select_from(Claim)
            .outerjoin(closed, closed.c.claim_id == Claim.id)
            .where(Claim.status.in_(CLOSED))
        )
        count, avg_seconds = (await self.db.execute(q)).one()
        return count, None if avg_seconds is None else float(avg_seconds)

    async def open_ageing(self, buckets: list[tuple[str, datetime | None]]) -> dict[str, int]:
        """Open claims per age bucket. `buckets` runs youngest first as (label, submitted after) pairs; the last
        one, with None, takes everything older."""
        bucket = case(
            *[
                (Claim.created_at > literal(since, DateTime(timezone=True)), label)
                for label, since in buckets
                if since is not None
            ],
            else_=buckets[-1][0],
        )
        # Grouped in an outer query: PostgreSQL cannot match a CASE with bound parameters in GROUP BY.
        labelled = select(bucket.label("bucket")).where(Claim.status.in_(OPEN)).subquery()
        rows = await self.db.execute(select(labelled.c.bucket, func.count()).group_by(labelled.c.bucket))
        return dict(rows.all())

    async def recently_closed(self, limit: int) -> list[tuple[Claim, datetime]]:
        closed = self._closed_at()
        closed_at = func.coalesce(closed.c.closed_at, Claim.updated_at).label("closed_at")
        q = (
            select(Claim, closed_at)
            .outerjoin(closed, closed.c.claim_id == Claim.id)
            .where(Claim.status.in_(CLOSED))
            .order_by(closed_at.desc())
            .limit(limit)
        )
        return [(claim, at) for claim, at in (await self.db.execute(q)).all()]
