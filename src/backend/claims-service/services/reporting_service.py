"""Internal claims reports for case and regional managers, aggregated in the database
(repositories/report_repository.py) rather than in the browser."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import ClaimStatus
from models.schemas import AgeingBucket, ClosedClaim, ReportSummary
from repositories.report_repository import ReportRepository

# Open claims by time since submission: (label, youngest age in days, oldest age in days or None).
AGEING_BUCKETS = [
    ("0–7 days", 0, 7),
    ("8–30 days", 8, 30),
    ("31–60 days", 31, 60),
    ("Over 60 days", 61, None),
]
RECENTLY_CLOSED = 10

_SECONDS_PER_DAY = 86400


def _utc(at: datetime) -> datetime:
    # PostgreSQL hands timestamptz back as aware datetimes; SQLite (the unit tests) as naive UTC ones.
    return at if at.tzinfo else at.replace(tzinfo=timezone.utc)


async def summary(db: AsyncSession, as_of: datetime | None = None) -> ReportSummary:
    as_of = as_of or datetime.now(timezone.utc)
    repo = ReportRepository(db)

    counts = await repo.count_by_status()
    approved, paid = await repo.amount_totals()
    closed, avg_seconds = await repo.processing_time()
    # A claim falls in a bucket while it is younger than the bucket's oldest age plus one day.
    ageing = await repo.open_ageing(
        [(label, as_of - timedelta(days=oldest + 1) if oldest is not None else None) for label, _, oldest in AGEING_BUCKETS]
    )
    recent = await repo.recently_closed(RECENTLY_CLOSED)

    return ReportSummary(
        as_of=as_of,
        total_claims=sum(counts.values()),
        by_status={s: counts.get(s, 0) for s in ClaimStatus},
        total_approved_amount=approved,
        total_paid_amount=paid,
        closed_claims=closed,
        avg_processing_days=None if avg_seconds is None else round(avg_seconds / _SECONDS_PER_DAY, 2),
        open_ageing=[
            AgeingBucket(label=label, min_days=youngest, max_days=oldest, count=ageing.get(label, 0))
            for label, youngest, oldest in AGEING_BUCKETS
        ],
        recently_closed=[
            ClosedClaim(
                id=claim.id,
                claim_number=claim.claim_number,
                policy_number=claim.policy_number,
                status=claim.status,
                claimed_amount=claim.claimed_amount,
                approved_amount=claim.approved_amount,
                submitted_at=_utc(claim.created_at),
                closed_at=_utc(closed_at),
                processing_days=round((_utc(closed_at) - _utc(claim.created_at)).total_seconds() / _SECONDS_PER_DAY, 2),
            )
            for claim, closed_at in recent
        ],
    )
