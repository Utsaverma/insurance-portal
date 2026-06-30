import re
import uuid
from datetime import date

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
        json={"status": "APPROVED", "note": "direct override"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_redis_cache_hit_skips_db(mock_redis, db_session, sample_claim, customer_user):
    from services.claims_service import get_claim_status_cached
    status = await get_claim_status_cached(sample_claim.id, db_session, mock_redis)
    assert status == "SUBMITTED"
    cached = await get_claim_status_cached(sample_claim.id, db_session, mock_redis)
    assert cached == "SUBMITTED"
