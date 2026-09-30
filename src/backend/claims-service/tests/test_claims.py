import re
import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient

from dependencies.auth import get_current_user
from models.db_models import ClaimStatus
from models.schemas import UserContext


async def _post_claim(client: AsyncClient, **overrides):
    payload = {
        "policy_number": "POL-12345",
        "incident_date": "2024-06-01",
        "incident_description": "Test incident description here",
        "claimed_amount": 25000,
        **overrides,
    }
    return await client.post("/claims", json=payload)


@pytest.mark.asyncio
async def test_submit_claim_as_customer(client, customer_user):
    resp = await _post_claim(client)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "SUBMITTED"


@pytest.mark.asyncio
async def test_submit_claim_non_customer_forbidden(client, db_session, mock_redis, adjustor_user):
    from main import app

    async def override_adjustor():
        return adjustor_user

    app.dependency_overrides[get_current_user] = override_adjustor
    resp = await _post_claim(client)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_customer_sees_only_own_claims(client, sample_claim, customer_user):
    resp = await client.get("/claims")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for item in items:
        assert item["customer_id"] == str(customer_user.id)


@pytest.mark.asyncio
async def test_adjustor_sees_all_claims(client, db_session, mock_redis, sample_claim, adjustor_user):
    from main import app

    async def override_adjustor():
        return adjustor_user

    app.dependency_overrides[get_current_user] = override_adjustor
    resp = await client.get("/claims")
    assert resp.status_code == 200
    # adjustor sees all claims regardless of customer_id


@pytest.mark.asyncio
async def test_invalid_state_transition_returns_400(client, sample_claim, adjustor_user):
    from main import app

    async def override_adjustor():
        return adjustor_user

    app.dependency_overrides[get_current_user] = override_adjustor
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "APPROVED", "note": "invalid jump"},
    )
    assert resp.status_code == 400
    assert "Invalid state transition" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_valid_state_transition_updates_history(client, sample_claim, case_manager_user, db_session):
    from main import app

    async def override_cm():
        return case_manager_user

    app.dependency_overrides[get_current_user] = override_cm
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "ASSIGNED", "note": "assigning"},
    )
    assert resp.status_code == 200

    hist_resp = await client.get(f"/claims/{sample_claim.id}/history")
    assert hist_resp.status_code == 200
    assert len(hist_resp.json()) >= 1


@pytest.mark.asyncio
async def test_case_manager_override_to_any_status(client, sample_claim, case_manager_user):
    from main import app

    async def override_cm():
        return case_manager_user

    app.dependency_overrides[get_current_user] = override_cm
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "APPROVED", "note": "direct override", "approved_amount": 9000},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"
    assert Decimal(resp.json()["approved_amount"]) == Decimal("9000")


@pytest.mark.asyncio
async def test_staff_directory_is_cached_in_redis(mock_redis):
    import httpx
    from services.user_directory import get_staff_directory

    calls = []

    def auth_service(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(200, json=[{"id": "u1", "email": "carol@test.com", "full_name": "Carol Surveyor"}])

    async with httpx.AsyncClient(transport=httpx.MockTransport(auth_service)) as client:
        first = await get_staff_directory(client, mock_redis, "token", "req-1")
        second = await get_staff_directory(client, mock_redis, "token", "req-2")

    assert first == second == {"u1": "Carol Surveyor"}
    assert len(calls) == 1  # the second lookup is served from Redis


def _act_as(user):
    from main import app

    async def override():
        return user

    app.dependency_overrides[get_current_user] = override


async def _set_status(db_session, claim, status: ClaimStatus):
    claim.status = status
    await db_session.flush()


@pytest.mark.asyncio
async def test_submit_claim_starts_audit_trail(client, customer_user):
    claim_id = (await _post_claim(client)).json()["id"]
    history = (await client.get(f"/claims/{claim_id}/history")).json()
    assert len(history) == 1
    assert history[0]["from_status"] is None
    assert history[0]["to_status"] == "SUBMITTED"
    assert history[0]["changed_by"] == str(customer_user.id)


@pytest.mark.asyncio
async def test_survey_requires_assessed_amount(client, db_session, sample_claim, surveyor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_SURVEY)
    _act_as(surveyor_user)
    url = f"/claims/{sample_claim.id}/status"

    missing = await client.patch(url, json={"status": "SURVEYED", "note": "Rear bumper damage"})
    assert missing.status_code == 400

    ok = await client.patch(url, json={"status": "SURVEYED", "note": "Rear bumper damage", "assessed_amount": 8000})
    assert ok.status_code == 200
    assert Decimal(ok.json()["assessed_amount"]) == Decimal("8000")


@pytest.mark.asyncio
async def test_approval_cannot_exceed_claimed_amount(client, db_session, sample_claim, adjustor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION)
    _act_as(adjustor_user)
    url = f"/claims/{sample_claim.id}/status"

    too_much = await client.patch(url, json={"status": "APPROVED", "approved_amount": 20000})  # claimed 10,000
    assert too_much.status_code == 400
    assert "claimed amount" in too_much.json()["detail"]

    ok = await client.patch(url, json={"status": "APPROVED", "approved_amount": 9500})
    assert ok.status_code == 200
    assert Decimal(ok.json()["approved_amount"]) == Decimal("9500")


@pytest.mark.asyncio
async def test_amounts_only_accepted_with_matching_status(client, db_session, sample_claim, adjustor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION)
    _act_as(adjustor_user)
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "REJECTED", "note": "Not covered", "approved_amount": 100},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_case_manager_override_requires_reason(client, sample_claim, case_manager_user):
    _act_as(case_manager_user)
    url = f"/claims/{sample_claim.id}/status"

    no_reason = await client.patch(url, json={"status": "REJECTED"})
    assert no_reason.status_code == 400

    ok = await client.patch(url, json={"status": "REJECTED", "note": "Duplicate of an existing claim"})
    assert ok.status_code == 200
    history = (await client.get(f"/claims/{sample_claim.id}/history")).json()
    assert history[-1]["note"] == "Case manager override: Duplicate of an existing claim"


@pytest.mark.asyncio
async def test_paid_claim_is_final(client, db_session, sample_claim, case_manager_user):
    await _set_status(db_session, sample_claim, ClaimStatus.PAID)
    _act_as(case_manager_user)
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "UNDER_ADJUDICATION", "note": "Reopen"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_non_ascii_bearer_token_is_rejected_with_401():
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad✓token")
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request=None, credentials=credentials)
    assert exc.value.status_code == 401
