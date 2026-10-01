import re
import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient

from dependencies.auth import get_current_user
from models.db_models import ClaimStatus
from models.schemas import StaffMember, UserContext
from tests.conftest import ADJUSTOR_ID, AUDITOR_ID, SURVEYOR_ID


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
        return httpx.Response(
            200, json=[{"id": "u1", "email": "carol@test.com", "full_name": "Carol Surveyor", "role": "SURVEYOR"}]
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(auth_service)) as client:
        first = await get_staff_directory(client, mock_redis, "token", "req-1")
        second = await get_staff_directory(client, mock_redis, "token", "req-2")

    assert first == second == {"u1": StaffMember(name="Carol Surveyor", role="SURVEYOR")}
    assert len(calls) == 1  # the second lookup is served from Redis


def _act_as(user):
    from main import app

    async def override():
        return user

    app.dependency_overrides[get_current_user] = override


async def _set_status(db_session, claim, status: ClaimStatus, assigned_to=None):
    claim.status = status
    claim.assigned_to = assigned_to
    await db_session.flush()


@pytest.mark.asyncio
async def test_submit_claim_starts_audit_trail(client, customer_user):
    claim_id = (await _post_claim(client)).json()["id"]
    history = (await client.get(f"/claims/{claim_id}/history")).json()
    assert len(history) == 1
    assert history[0]["from_status"] is None
    assert history[0]["to_status"] == "SUBMITTED"
    assert history[0]["changed_by"] == str(customer_user.id)
    assert history[0]["changed_by_name"] == customer_user.email  # no full name on file, so the email


@pytest.mark.asyncio
async def test_survey_requires_assessed_amount(client, db_session, sample_claim, surveyor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_SURVEY, surveyor_user.id)
    _act_as(surveyor_user)
    url = f"/claims/{sample_claim.id}/status"

    missing = await client.patch(url, json={"status": "SURVEYED", "note": "Rear bumper damage"})
    assert missing.status_code == 400

    ok = await client.patch(url, json={"status": "SURVEYED", "note": "Rear bumper damage", "assessed_amount": 8000})
    assert ok.status_code == 200
    assert Decimal(ok.json()["assessed_amount"]) == Decimal("8000")


@pytest.mark.asyncio
async def test_approval_cannot_exceed_claimed_amount(client, db_session, sample_claim, adjustor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION, adjustor_user.id)
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
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION, adjustor_user.id)
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
async def test_history_names_the_actor(client, sample_claim):
    _act_as(UserContext(id=uuid.uuid4(), email="dana@test.com", role="CASE_MANAGER", full_name="Dana Brooks"))
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "REJECTED", "note": "Duplicate of an existing claim"},
    )
    assert resp.status_code == 200
    history = (await client.get(f"/claims/{sample_claim.id}/history")).json()
    assert history[-1]["changed_by_name"] == "Dana Brooks"


@pytest.mark.asyncio
async def test_claim_is_paid_only_with_an_approved_amount(client, db_session, sample_claim, case_manager_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION)
    _act_as(case_manager_user)
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "PAID", "note": "Settle now"},
    )
    assert resp.status_code == 400
    assert "approved amount" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_reassignment_is_audited_and_closed_claims_stay_put(client, db_session, sample_claim, case_manager_user):
    _act_as(case_manager_user)
    url = f"/claims/{sample_claim.id}/assign"

    first = await client.post(url, json={"assigned_to": SURVEYOR_ID})
    assert first.json()["status"] == "ASSIGNED"
    assert first.json()["assigned_staff_name"] == "Carol Surveyor"
    assert (await client.post(url, json={"assigned_to": ADJUSTOR_ID})).status_code == 200
    history = (await client.get(f"/claims/{sample_claim.id}/history")).json()
    assert [h["note"] for h in history] == ["Assigned to Carol Surveyor", "Reassigned to Bob Adjuster"]
    assert history[-1]["from_status"] == history[-1]["to_status"] == "ASSIGNED"

    await _set_status(db_session, sample_claim, ClaimStatus.PAID)
    assert (await client.post(url, json={"assigned_to": SURVEYOR_ID})).status_code == 400


@pytest.mark.asyncio
async def test_claim_is_assigned_only_to_a_known_surveyor_or_adjustor(client, sample_claim, case_manager_user, customer_user):
    _act_as(case_manager_user)
    url = f"/claims/{sample_claim.id}/assign"

    unknown = await client.post(url, json={"assigned_to": str(uuid.uuid4())})
    assert unknown.status_code == 400
    assert "not a known staff member" in unknown.json()["detail"]

    wrong_role = await client.post(url, json={"assigned_to": AUDITOR_ID})
    assert wrong_role.status_code == 400
    assert "surveyor or an adjustor" in wrong_role.json()["detail"]

    claim = (await client.get(f"/claims/{sample_claim.id}")).json()
    assert claim["status"] == "SUBMITTED" and claim["assigned_to"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"policy_number": "   "},
        {"incident_description": "too short"},
        {"incident_date": "2999-01-01"},
        {"claimed_amount": 0},
        {"claimed_amount": "10.999"},  # more than 2 decimals: refused, not rounded
        {"claimed_amount": "99999999999.99"},  # does not fit NUMERIC(12,2)
        {"claimed_amount": "NaN"},
    ],
)
async def test_submit_claim_rejects_invalid_input(client, overrides):
    resp = await _post_claim(client, **overrides)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_submit_claim_trims_text_fields(client):
    resp = await _post_claim(client, policy_number="  POL-777  ")
    assert resp.status_code == 201
    assert resp.json()["policy_number"] == "POL-777"


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", ["0.004", "99999999999.99", "-5"])
async def test_status_amounts_must_fit_the_money_column(client, db_session, sample_claim, surveyor_user, amount):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_SURVEY, surveyor_user.id)
    _act_as(surveyor_user)
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "SURVEYED", "note": "Rear bumper damage", "assessed_amount": amount},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_override_to_the_current_status_is_refused(client, db_session, sample_claim, case_manager_user):
    sample_claim.approved_amount = Decimal("9000")
    await _set_status(db_session, sample_claim, ClaimStatus.APPROVED)
    _act_as(case_manager_user)
    resp = await client.patch(
        f"/claims/{sample_claim.id}/status",
        json={"status": "APPROVED", "note": "Change the amount", "approved_amount": 1},
    )
    assert resp.status_code == 400
    assert "already APPROVED" in resp.json()["detail"]
    assert Decimal((await client.get(f"/claims/{sample_claim.id}")).json()["approved_amount"]) == Decimal("9000")


@pytest.mark.asyncio
async def test_rejection_requires_a_reason(client, db_session, sample_claim, adjustor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION, adjustor_user.id)
    _act_as(adjustor_user)
    url = f"/claims/{sample_claim.id}/status"

    no_reason = await client.patch(url, json={"status": "REJECTED", "note": "  "})
    assert no_reason.status_code == 400
    assert "reason is required" in no_reason.json()["detail"]

    assert (await client.patch(url, json={"status": "REJECTED", "note": "Excluded peril"})).status_code == 200


@pytest.mark.asyncio
async def test_missing_bearer_token_is_rejected_with_401(client):
    from main import app

    app.dependency_overrides.pop(get_current_user)
    resp = await client.get("/claims", headers={"Authorization": ""})
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_non_ascii_bearer_token_is_rejected_with_401():
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad✓token")
    with pytest.raises(HTTPException) as exc:
        await get_current_user(request=None, credentials=credentials)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_unassigned_surveyor_gets_403(client, db_session, sample_claim, surveyor_user):
    # Assigned to another surveyor (Carol), so this one may read the claim but not work it.
    await _set_status(db_session, sample_claim, ClaimStatus.ASSIGNED, uuid.UUID(SURVEYOR_ID))
    _act_as(surveyor_user)
    url = f"/claims/{sample_claim.id}/status"

    resp = await client.patch(url, json={"status": "UNDER_SURVEY"})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "This claim is not assigned to you"
    assert (await client.get(f"/claims/{sample_claim.id}")).status_code == 200

    sample_claim.assigned_to = surveyor_user.id
    await db_session.flush()
    assert (await client.patch(url, json={"status": "UNDER_SURVEY"})).status_code == 200


@pytest.mark.asyncio
async def test_survey_hands_the_claim_to_the_adjudication_queue(
    client, db_session, sample_claim, surveyor_user, adjustor_user
):
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_SURVEY, surveyor_user.id)
    url = f"/claims/{sample_claim.id}/status"

    _act_as(surveyor_user)
    surveyed = await client.patch(url, json={"status": "SURVEYED", "note": "Bumper", "assessed_amount": 8000})
    assert surveyed.json()["assigned_to"] is None

    # Any adjustor may pick a surveyed claim up, and becomes its assignee.
    _act_as(adjustor_user)
    picked = await client.patch(url, json={"status": "UNDER_ADJUDICATION"})
    assert picked.status_code == 200
    assert picked.json()["assigned_to"] == str(adjustor_user.id)

    # From then on it is theirs alone.
    _act_as(UserContext(id=uuid.uuid4(), email="other-adjustor@test.com", role="ADJUSTOR"))
    other = await client.patch(url, json={"status": "APPROVED", "approved_amount": 8000})
    assert other.status_code == 403

    _act_as(adjustor_user)
    assert (await client.patch(url, json={"status": "APPROVED", "approved_amount": 8000})).status_code == 200
    assert (await client.patch(url, json={"status": "PAID"})).status_code == 200


@pytest.mark.asyncio
async def test_a_surveyed_claim_given_to_one_adjustor_is_not_open_to_others(
    client, db_session, sample_claim, adjustor_user
):
    await _set_status(db_session, sample_claim, ClaimStatus.SURVEYED, uuid.UUID(ADJUSTOR_ID))
    _act_as(adjustor_user)
    resp = await client.patch(f"/claims/{sample_claim.id}/status", json={"status": "UNDER_ADJUDICATION"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_assigning_a_claim_in_the_adjudication_queue_is_not_a_reassignment(
    client, db_session, sample_claim, case_manager_user
):
    await _set_status(db_session, sample_claim, ClaimStatus.SURVEYED)
    _act_as(case_manager_user)
    resp = await client.post(f"/claims/{sample_claim.id}/assign", json={"assigned_to": ADJUSTOR_ID})
    assert resp.status_code == 200
    history = (await client.get(f"/claims/{sample_claim.id}/history")).json()
    assert history[-1]["note"] == "Assigned to Bob Adjuster"


def _actions(resp) -> dict:
    return resp.json()["allowed_actions"]


@pytest.mark.asyncio
async def test_allowed_actions_follow_the_workflow_and_the_assignment(
    client, db_session, sample_claim, surveyor_user, adjustor_user, case_manager_user, customer_user
):
    url = f"/claims/{sample_claim.id}"

    # SUBMITTED: the customer may add evidence; the case manager assigns or overrides.
    _act_as(customer_user)
    assert _actions(await client.get(url)) == {"transitions": [], "overrides": [], "assign": False, "upload": True}
    _act_as(case_manager_user)
    cm = _actions(await client.get(url))
    assert cm["transitions"] == [] and cm["assign"] is True and cm["upload"] is False
    # Every other status but ASSIGNED (taken by assigning) and PAID (there is no approved amount yet).
    assert cm["overrides"] == ["UNDER_SURVEY", "SURVEYED", "UNDER_ADJUDICATION", "APPROVED", "REJECTED"]

    # ASSIGNED to this surveyor: only they may start the survey or upload.
    await _set_status(db_session, sample_claim, ClaimStatus.ASSIGNED, surveyor_user.id)
    _act_as(surveyor_user)
    assert _actions(await client.get(url)) == {
        "transitions": ["UNDER_SURVEY"], "overrides": [], "assign": False, "upload": True,
    }
    _act_as(UserContext(id=uuid.uuid4(), email="other-surveyor@test.com", role="SURVEYOR"))
    assert _actions(await client.get(url))["transitions"] == []

    # SURVEYED and unassigned: any adjustor may pick it up, but has nothing to upload to yet.
    await _set_status(db_session, sample_claim, ClaimStatus.SURVEYED)
    _act_as(adjustor_user)
    assert _actions(await client.get(url)) == {
        "transitions": ["UNDER_ADJUDICATION"], "overrides": [], "assign": False, "upload": False,
    }

    # UNDER_ADJUDICATION with this adjustor: approve or reject.
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_ADJUDICATION, adjustor_user.id)
    assert _actions(await client.get(url))["transitions"] == ["APPROVED", "REJECTED"]

    # APPROVED: payment is offered, and a case manager may now override to PAID too.
    sample_claim.approved_amount = Decimal("9000")
    await _set_status(db_session, sample_claim, ClaimStatus.APPROVED, adjustor_user.id)
    assert _actions(await client.get(url))["transitions"] == ["PAID"]
    _act_as(case_manager_user)
    assert "PAID" in _actions(await client.get(url))["overrides"]

    # PAID is final for everyone, and closed claims cannot be reassigned.
    await _set_status(db_session, sample_claim, ClaimStatus.PAID, adjustor_user.id)
    assert _actions(await client.get(url)) == {"transitions": [], "overrides": [], "assign": False, "upload": False}


@pytest.mark.asyncio
async def test_regional_manager_reassigns_only_after_the_first_assignment(client, db_session, sample_claim):
    _act_as(UserContext(id=uuid.uuid4(), email="frank@test.com", role="REGIONAL_MANAGER"))
    url = f"/claims/{sample_claim.id}"
    assert _actions(await client.get(url))["assign"] is False
    await _set_status(db_session, sample_claim, ClaimStatus.UNDER_SURVEY, uuid.UUID(SURVEYOR_ID))
    assert _actions(await client.get(url))["assign"] is True
    await _set_status(db_session, sample_claim, ClaimStatus.REJECTED, uuid.UUID(SURVEYOR_ID))
    assert _actions(await client.get(url))["assign"] is False


@pytest.mark.asyncio
async def test_status_change_response_carries_the_next_actions(client, db_session, sample_claim, surveyor_user):
    await _set_status(db_session, sample_claim, ClaimStatus.ASSIGNED, surveyor_user.id)
    _act_as(surveyor_user)
    resp = await client.patch(f"/claims/{sample_claim.id}/status", json={"status": "UNDER_SURVEY"})
    assert _actions(resp)["transitions"] == ["SURVEYED"]


@pytest.mark.asyncio
async def test_listed_claims_carry_allowed_actions(client, sample_claim, customer_user):
    items = (await client.get("/claims")).json()["items"]
    assert items and all(item["allowed_actions"]["upload"] for item in items)
