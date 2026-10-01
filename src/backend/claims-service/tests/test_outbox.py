from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from dependencies.auth import get_current_user
from models.db_models import ClaimStatus, Notification, OutboxEvent
from tests.conftest import SURVEYOR_ID
from workers.outbox_dispatcher import Contact, dispatch_batch


def _act_as(user):
    from main import app

    async def override():
        return user

    app.dependency_overrides[get_current_user] = override


async def _events(db, **filters) -> list[OutboxEvent]:
    q = select(OutboxEvent).order_by(OutboxEvent.event_type)
    for column, value in filters.items():
        q = q.where(getattr(OutboxEvent, column) == value)
    return list((await db.execute(q)).scalars().all())


class RecordingSender:
    def __init__(self, fail_with: Exception | None = None):
        self.sent: list[tuple[str, str, str]] = []
        self.fail_with = fail_with

    async def send(self, contact, subject, body, message_id):
        if self.fail_with:
            raise self.fail_with
        self.sent.append((contact.email, subject, body))


async def alice(db, user_id):
    return Contact(name="Alice Customer", email="alice@test.com")


@pytest.mark.asyncio
async def test_a_status_change_writes_its_notifications_to_the_outbox(client, db_session, sample_claim, adjustor_user):
    sample_claim.status = ClaimStatus.UNDER_ADJUDICATION
    sample_claim.assigned_to = adjustor_user.id
    await db_session.flush()
    _act_as(adjustor_user)

    resp = await client.patch(f"/claims/{sample_claim.id}/status", json={"status": "APPROVED", "approved_amount": 9500})
    assert resp.status_code == 200

    events = await _events(db_session, aggregate_id=sample_claim.id)
    assert [e.event_type for e in events] == ["notification.email", "notification.sms"]
    assert all(e.status == "pending" and e.payload["recipient_id"] == str(sample_claim.customer_id) for e in events)
    assert events[0].payload["message"] == f"Your claim {sample_claim.claim_number} is now approved. Approved amount: $9,500.00."
    in_app = (await db_session.execute(select(Notification).where(Notification.claim_id == sample_claim.id))).scalars().all()
    assert [(n.channel, n.status) for n in in_app] == [("in-app", "stored")]


@pytest.mark.asyncio
async def test_an_assignment_emails_the_assignee(client, db_session, sample_claim, case_manager_user):
    _act_as(case_manager_user)
    assert (await client.post(f"/claims/{sample_claim.id}/assign", json={"assigned_to": SURVEYOR_ID})).status_code == 200

    staff = [e for e in await _events(db_session, aggregate_id=sample_claim.id) if e.payload["audience"] == "staff"]
    assert [(e.event_type, e.payload["recipient_id"]) for e in staff] == [("notification.email", SURVEYOR_ID)]
    assert staff[0].payload["subject"] == f"Claim {sample_claim.claim_number} is assigned to you"


@pytest.mark.asyncio
async def test_the_dispatcher_delivers_each_event_once_and_records_it(client, db_session):
    claim_id = (await client.post("/claims", json={
        "policy_number": "POL-1", "incident_date": "2026-09-01",
        "incident_description": "Rear bumper cracked in a car park", "claimed_amount": 1200,
    })).json()["id"]
    email, sms = RecordingSender(), RecordingSender()

    assert await dispatch_batch(db_session, {"email": email, "sms": sms}, lookup=alice) == 2
    assert [(to, subject) for to, subject, _ in email.sent] == [("alice@test.com", email.sent[0][1])]
    assert email.sent[0][1].startswith("We received your claim CLM-")
    assert f"http://localhost:3000/claims/{claim_id}" in email.sent[0][2]
    assert len(sms.sent) == 1
    assert {e.status for e in await _events(db_session)} == {"sent"}
    sent = (await db_session.execute(select(Notification).where(Notification.status == "sent"))).scalars().all()
    assert sorted(n.channel for n in sent) == ["email", "sms"]

    # Nothing left to do: a second pass sends nothing again.
    assert await dispatch_batch(db_session, {"email": email, "sms": sms}, lookup=alice) == 0
    assert len(email.sent) == 1


@pytest.mark.asyncio
async def test_a_failed_delivery_backs_off_then_is_dead_lettered(client, db_session, monkeypatch):
    import config

    await client.post("/claims", json={
        "policy_number": "POL-1", "incident_date": "2026-09-01",
        "incident_description": "Rear bumper cracked in a car park", "claimed_amount": 1200,
    })
    down = RecordingSender(fail_with=ConnectionRefusedError("SMTP server unreachable"))
    now = datetime.now(timezone.utc)

    await dispatch_batch(db_session, {"email": down, "sms": RecordingSender()}, lookup=alice, now=now)
    (email,) = await _events(db_session, event_type="notification.email")
    assert (email.status, email.attempts) == ("pending", 1)
    assert "SMTP server unreachable" in email.last_error
    assert email.available_at.replace(tzinfo=timezone.utc) == now + timedelta(seconds=2)

    # Not due again until the backoff has passed.
    assert await dispatch_batch(db_session, {"email": down, "sms": RecordingSender()}, lookup=alice) == 0

    # The last allowed attempt fails: dead-lettered, never picked up again.
    email.attempts = config.settings.outbox_max_attempts - 1
    email.available_at = now - timedelta(seconds=1)
    await db_session.flush()
    await dispatch_batch(db_session, {"email": down, "sms": RecordingSender()}, lookup=alice, now=now)
    assert email.status == "dead"
    assert await dispatch_batch(db_session, {"email": RecordingSender(), "sms": RecordingSender()}, lookup=alice) == 0


@pytest.mark.asyncio
async def test_an_unknown_recipient_is_retried_not_lost(client, db_session):
    await client.post("/claims", json={
        "policy_number": "POL-1", "incident_date": "2026-09-01",
        "incident_description": "Rear bumper cracked in a car park", "claimed_amount": 1200,
    })

    async def nobody(db, user_id):
        return None

    await dispatch_batch(db_session, {"email": RecordingSender(), "sms": RecordingSender()}, lookup=nobody)
    assert {(e.status, e.attempts) for e in await _events(db_session)} == {("pending", 1)}
