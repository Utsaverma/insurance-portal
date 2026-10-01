import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from dependencies.auth import get_current_user
from models.db_models import Claim, ClaimStatus, ClaimStatusHistory
from services import reporting_service

AS_OF = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


def _act_as(user):
    from main import app

    async def override():
        return user

    app.dependency_overrides[get_current_user] = override


async def _claim(db, status: ClaimStatus, age_days: int, approved=None, closings=(), updated_days_ago=None):
    """A claim submitted `age_days` before AS_OF; `closings` are (status, days after submission) history rows."""
    created = AS_OF - timedelta(days=age_days)
    claim = Claim(
        claim_number=f"CLM-RPT-{uuid.uuid4().hex[:8].upper()}",
        customer_id=uuid.uuid4(),
        policy_number="POL-RPT",
        incident_date=date(2026, 1, 1),
        incident_description="Report fixture claim with a long enough description",
        claimed_amount=Decimal("1000"),
        approved_amount=approved,
        status=status,
        created_at=created,
        updated_at=AS_OF - timedelta(days=updated_days_ago) if updated_days_ago is not None else created,
    )
    db.add(claim)
    await db.flush()
    for to_status, after_days in closings:
        db.add(ClaimStatusHistory(
            claim_id=claim.id, to_status=to_status, changed_by=uuid.uuid4(),
            changed_at=created + timedelta(days=after_days),
        ))
    await db.flush()
    return claim


@pytest.fixture
async def report_claims(db_session):
    return {
        "new": await _claim(db_session, ClaimStatus.SUBMITTED, 2),
        "surveying": await _claim(db_session, ClaimStatus.UNDER_SURVEY, 20),
        "approved": await _claim(db_session, ClaimStatus.APPROVED, 45, approved=Decimal("900")),
        # Rejected, reopened and paid; a later write moved updated_at, which must not count as the close.
        "paid": await _claim(
            db_session, ClaimStatus.PAID, 100, approved=Decimal("500"),
            closings=[("REJECTED", 3), ("PAID", 10)], updated_days_ago=1,
        ),
        "rejected": await _claim(db_session, ClaimStatus.REJECTED, 70, closings=[("REJECTED", 4)]),
        "stale": await _claim(db_session, ClaimStatus.SUBMITTED, 90),
    }


@pytest.mark.asyncio
async def test_summary_is_aggregated_from_the_claims_and_their_audit_trail(db_session, report_claims):
    report = await reporting_service.summary(db_session, as_of=AS_OF)

    assert report.total_claims == 6
    assert report.by_status == {
        **{s: 0 for s in ClaimStatus},
        ClaimStatus.SUBMITTED: 2, ClaimStatus.UNDER_SURVEY: 1, ClaimStatus.APPROVED: 1,
        ClaimStatus.PAID: 1, ClaimStatus.REJECTED: 1,
    }
    assert report.total_approved_amount == Decimal("1400")  # the paid claim was approved first
    assert report.total_paid_amount == Decimal("500")

    # Closed at the latest PAID/REJECTED history row: 10 and 4 days after submission.
    assert report.closed_claims == 2
    assert report.avg_processing_days == pytest.approx(7.0)

    assert [(b.label, b.count) for b in report.open_ageing] == [
        ("0–7 days", 1), ("8–30 days", 1), ("31–60 days", 1), ("Over 60 days", 1),
    ]

    assert [(c.claim_number, c.processing_days) for c in report.recently_closed] == [
        (report_claims["rejected"].claim_number, pytest.approx(4.0)),
        (report_claims["paid"].claim_number, pytest.approx(10.0)),
    ]


@pytest.mark.asyncio
async def test_summary_of_an_empty_book(db_session):
    report = await reporting_service.summary(db_session, as_of=AS_OF)
    assert report.total_claims == 0
    assert report.total_approved_amount == report.total_paid_amount == Decimal("0")
    assert report.avg_processing_days is None
    assert all(b.count == 0 for b in report.open_ageing)
    assert report.recently_closed == []


@pytest.mark.asyncio
async def test_reports_endpoint_is_for_case_and_regional_managers(
    client, report_claims, case_manager_user, surveyor_user, customer_user
):
    _act_as(case_manager_user)
    resp = await client.get("/reports/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_claims"] == 6
    assert body["total_paid_amount"] == "500.00"
    assert len(body["open_ageing"]) == 4

    for user in (surveyor_user, customer_user):
        _act_as(user)
        assert (await client.get("/reports/summary")).status_code == 403
