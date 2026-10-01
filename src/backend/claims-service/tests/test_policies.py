import uuid
from datetime import date
from decimal import Decimal

import pytest

from dependencies.auth import get_current_user
from models.db_models import Policy


def _act_as(user):
    from main import app

    async def override():
        return user

    app.dependency_overrides[get_current_user] = override


async def _policy(db, number: str, holder_email: str, start: date, end: date, limit="50000", deductible="500"):
    db.add(Policy(
        policy_number=number, holder_email=holder_email, holder_name="Someone", product="Personal Auto",
        insured_item="2020 Hatchback", effective_from=start, effective_to=end,
        coverage_limit=Decimal(limit), deductible=Decimal(deductible),
    ))
    await db.flush()


async def _submit(client, policy_number: str, incident_date="2026-09-01", amount=8000):
    return await client.post("/claims", json={
        "policy_number": policy_number, "incident_date": incident_date,
        "incident_description": "Rear bumper cracked in a car park", "claimed_amount": amount,
    })


@pytest.mark.asyncio
async def test_a_claim_against_someone_elses_or_an_unknown_policy_is_refused(client, db_session):
    await _policy(db_session, "POL-BOB", "bob@elsewhere.com", date(2026, 1, 1), date(2026, 12, 31))
    for number in ("POL-BOB", "POL-NOPE"):
        resp = await _submit(client, number)
        assert resp.status_code == 400
        # The same answer either way, so nobody can probe for other people's policies.
        assert resp.json()["detail"] == f"No policy {number} is held in your name"


@pytest.mark.asyncio
async def test_a_claim_outside_the_policy_period_is_refused(client, db_session, customer_user):
    await _policy(db_session, "POL-OLD", customer_user.email.upper(), date(2025, 1, 1), date(2025, 12, 31))
    resp = await _submit(client, "POL-OLD", incident_date="2026-02-01")
    assert resp.status_code == 400
    assert "was not in force on Feb 01, 2026" in resp.json()["detail"]
    # The holder's email matches case-insensitively, and a loss inside the period is accepted.
    assert (await _submit(client, "POL-OLD", incident_date="2025-12-31")).status_code == 201


@pytest.mark.asyncio
async def test_approval_is_capped_at_the_coverage_limit_less_the_deductible(
    client, db_session, customer_user, adjustor_user
):
    await _policy(db_session, "POL-SMALL", customer_user.email, date(2026, 1, 1), date(2026, 12, 31), "5000", "500")
    created = (await _submit(client, "POL-SMALL", amount=8000)).json()
    # The terms are copied onto the claim at first notice of loss.
    assert (created["coverage_limit"], created["deductible"], created["approval_limit"]) == ("5000.00", "500.00", "4500.00")

    # Changing the policy afterwards does not change the claim's cover.
    policy = await db_session.get(Policy, "POL-SMALL")
    policy.coverage_limit = Decimal("100000")
    from models.db_models import Claim, ClaimStatus
    claim = await db_session.get(Claim, uuid.UUID(created["id"]))
    claim.status = ClaimStatus.UNDER_ADJUDICATION
    claim.assigned_to = adjustor_user.id
    await db_session.flush()

    _act_as(adjustor_user)
    url = f"/claims/{created['id']}/status"
    over = await client.patch(url, json={"status": "APPROVED", "approved_amount": "4500.01"})
    assert over.status_code == 400
    assert "coverage limit less its deductible (4500.00)" in over.json()["detail"]
    assert (await client.patch(url, json={"status": "APPROVED", "approved_amount": 4500})).status_code == 200


@pytest.mark.asyncio
async def test_customers_list_the_policies_held_in_their_name(client, db_session, customer_user, case_manager_user):
    await _policy(db_session, "POL-OLD", customer_user.email, date(2025, 1, 1), date(2025, 12, 31))
    await _policy(db_session, "POL-BOB", "bob@elsewhere.com", date(2026, 1, 1), date(2099, 12, 31))

    policies = (await client.get("/policies")).json()
    assert [(p["policy_number"], p["in_force"]) for p in policies] == [("POL-12345", True), ("POL-OLD", False)]
    assert "holder_email" not in policies[0]

    _act_as(case_manager_user)
    assert (await client.get("/policies")).status_code == 403
