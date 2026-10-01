"""Delivers the notification outbox (ST5). Run with: python -m workers.outbox_dispatcher

Each pass locks up to OUTBOX_BATCH_SIZE due events (FOR UPDATE SKIP LOCKED, so several dispatchers can run side
by side), delivers each one and commits. Delivery is at least once: if a message goes out but the commit does
not, the event is sent again on a later pass. Every email carries the event id as its Message-ID, so a mail
system can drop the duplicate. A failed delivery is retried with exponential backoff. After
OUTBOX_MAX_ATTEMPTS failures the event is dead-lettered (status 'dead') and stays in outbox_events for
someone to inspect.
"""
import asyncio
import signal
import smtplib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Awaitable, Callable, Protocol

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from dependencies.db import AsyncSessionLocal, engine
from logging_config import configure_logging
from models.db_models import Notification, OutboxEvent
from repositories.outbox_repository import OutboxRepository

log = structlog.get_logger(__name__)


@dataclass
class Contact:
    name: str
    email: str


class Sender(Protocol):
    async def send(self, contact: Contact, subject: str, body: str, message_id: str) -> None: ...


class EmailSender:
    """SMTP; locally the Mailpit container (web UI on :8025)."""

    async def send(self, contact: Contact, subject: str, body: str, message_id: str) -> None:
        await asyncio.to_thread(self._send, contact, subject, body, message_id)

    def _send(self, contact: Contact, subject: str, body: str, message_id: str) -> None:
        msg = EmailMessage()
        msg["From"] = settings.mail_from
        msg["To"] = f"{contact.name} <{contact.email}>"
        msg["Subject"] = subject
        msg["Message-ID"] = f"<{message_id}@eclaims.local>"
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.send_message(msg)


class SmsLogSender:
    """The POC has no SMS gateway, and no phone numbers on file: an SMS is written to the log."""

    async def send(self, contact: Contact, subject: str, body: str, message_id: str) -> None:
        log.info("sms.sent", to=contact.name, message=body, message_id=message_id)


async def users_table_contact(db: AsyncSession, user_id: str) -> Contact | None:
    # POC shortcut: the services share one database, so the recipient's address is read from auth-service's
    # users table. With a database per service (ARC-10) this becomes a call to auth-service.
    row = (await db.execute(text("SELECT full_name, email FROM users WHERE id = :id"), {"id": uuid.UUID(user_id)})).first()
    return Contact(name=row.full_name or row.email, email=row.email) if row else None


Lookup = Callable[[AsyncSession, str], Awaitable[Contact | None]]


def _body(contact: Contact, payload: dict) -> str:
    portal = settings.customer_portal_url if payload["audience"] == "customer" else settings.internal_portal_url
    return (
        f"Hello {contact.name},\n\n"
        f"{payload['message']}\n\n"
        f"View the claim: {portal}/claims/{payload['claim_id']}\n\n"
        "eClaims\n"
    )


async def _deliver(db: AsyncSession, event: OutboxEvent, senders: dict[str, Sender], lookup: Lookup) -> None:
    channel = event.event_type.removeprefix("notification.")
    sender = senders.get(channel)
    if sender is None:
        raise ValueError(f"no sender for {event.event_type}")
    payload = event.payload
    contact = await lookup(db, payload["recipient_id"])
    if contact is None:
        raise LookupError(f"recipient {payload['recipient_id']} not found")
    await sender.send(contact, payload["subject"], _body(contact, payload), str(event.id))
    db.add(Notification(
        claim_id=uuid.UUID(payload["claim_id"]),
        recipient_id=uuid.UUID(payload["recipient_id"]),
        channel=channel,
        message=payload["message"],
        status="sent",
    ))


def _backoff(attempts: int) -> timedelta:
    """2 s, 4 s, 8 s, ... after the 1st, 2nd, 3rd failure; never more than 5 minutes."""
    return timedelta(seconds=min(settings.outbox_backoff_seconds * 2 ** (attempts - 1), 300))


async def dispatch_batch(
    db: AsyncSession,
    senders: dict[str, Sender],
    lookup: Lookup = users_table_contact,
    now: datetime | None = None,
) -> int:
    """Deliver the due events, inside the caller's transaction. Returns how many were handled."""
    now = now or datetime.now(timezone.utc)
    events = await OutboxRepository(db).lock_due(settings.outbox_batch_size)
    for event in events:
        try:
            # A savepoint per event: a database error delivering one event leaves the others' work intact.
            async with db.begin_nested():
                await _deliver(db, event, senders, lookup)
        except Exception as exc:
            event.attempts += 1
            event.last_error = f"{type(exc).__name__}: {exc}"[:1000]
            if event.attempts >= settings.outbox_max_attempts:
                event.status = "dead"
                log.error("outbox.dead_lettered", event_id=str(event.id), attempts=event.attempts, error=event.last_error)
            else:
                event.available_at = now + _backoff(event.attempts)
                log.warning("outbox.retry_scheduled", event_id=str(event.id), attempts=event.attempts, error=event.last_error)
        else:
            event.status = "sent"
            event.sent_at = now
            log.info("outbox.delivered", event_id=str(event.id), event_type=event.event_type)
    await db.flush()
    return len(events)


async def run() -> None:
    configure_logging()
    senders: dict[str, Sender] = {"email": EmailSender(), "sms": SmsLogSender()}
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    log.info("outbox.dispatcher_started", smtp=f"{settings.smtp_host}:{settings.smtp_port}")
    while not stop.is_set():
        try:
            async with AsyncSessionLocal() as db, db.begin():
                handled = await dispatch_batch(db, senders)
        except Exception:
            # The database is unreachable, for instance: nothing was committed, so the events wait for the next pass.
            log.exception("outbox.pass_failed")
            handled = 0
        if not handled:
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.outbox_poll_seconds)
            except asyncio.TimeoutError:
                pass
    await engine.dispose()
    log.info("outbox.dispatcher_stopped")


if __name__ == "__main__":
    asyncio.run(run())
