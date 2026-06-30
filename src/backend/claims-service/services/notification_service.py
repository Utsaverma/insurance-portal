import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Notification

log = structlog.get_logger(__name__)


async def send_notification(
    claim_id: uuid.UUID,
    recipient_id: uuid.UUID,
    channel: str,
    message: str,
    db: AsyncSession,
) -> None:
    log.info("notification.stub", claim_id=str(claim_id), recipient_id=str(recipient_id), channel=channel, message=message)
    notification = Notification(
        claim_id=claim_id,
        recipient_id=recipient_id,
        channel=channel,
        message=message,
        status="stub",
    )
    db.add(notification)
    await db.flush()
