"""Claim notifications, sent through a transactional outbox (ST5).

notify() runs inside the request's transaction. It stores the in-app notification and writes one outbox event
per external channel; both commit or roll back with the claim change that caused them. So no notification goes
out for a change that never happened, and none is lost for a change that did, even while the dispatcher
(workers/outbox_dispatcher.py) or the mail server is down.
"""
import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Claim, Notification, OutboxEvent

log = structlog.get_logger(__name__)

# Customers hear about their claim by email and SMS; staff by email.
CHANNELS = {"customer": ("email", "sms"), "staff": ("email",)}


async def notify(
    db: AsyncSession,
    *,
    claim: Claim,
    recipient_id: uuid.UUID,
    subject: str,
    message: str,
    audience: str = "customer",
) -> None:
    db.add(Notification(claim_id=claim.id, recipient_id=recipient_id, channel="in-app", message=message, status="stored"))
    for channel in CHANNELS[audience]:
        db.add(OutboxEvent(
            event_type=f"notification.{channel}",
            aggregate_id=claim.id,
            payload={
                "recipient_id": str(recipient_id),
                "claim_id": str(claim.id),
                "claim_number": claim.claim_number,
                "subject": subject,
                "message": message,
                "audience": audience,
            },
        ))
    await db.flush()
    log.info("notification.queued", claim_id=str(claim.id), recipient_id=str(recipient_id), audience=audience)
