import uuid
from datetime import datetime, date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped


class Base(DeclarativeBase):
    pass


class ClaimStatus(StrEnum):
    SUBMITTED = "SUBMITTED"
    ASSIGNED = "ASSIGNED"
    UNDER_SURVEY = "UNDER_SURVEY"
    SURVEYED = "SURVEYED"
    UNDER_ADJUDICATION = "UNDER_ADJUDICATION"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PAID = "PAID"


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_number: Mapped[str] = mapped_column(String(25), unique=True, nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    policy_number: Mapped[str] = mapped_column(String(50), nullable=False)
    incident_date: Mapped[date] = mapped_column(Date, nullable=False)
    incident_description: Mapped[str] = mapped_column(Text, nullable=False)
    claimed_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Set by the surveyor (SURVEYED) and the adjustor (APPROVED); see services.claims_service.
    assessed_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[ClaimStatus] = mapped_column(
        SAEnum(ClaimStatus, name="claim_status", create_type=False),
        nullable=False,
        default=ClaimStatus.SUBMITTED,
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # The policy's terms as they stood at first notice of loss (null on claims filed before snapshots existed).
    coverage_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    deductible: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())


class ClaimDocument(Base):
    __tablename__ = "claim_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())


class ClaimStatusHistory(Base):
    __tablename__ = "claim_status_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # The actor's name as it was when they acted, so the audit record never depends on a later lookup.
    changed_by_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="stub")


class WorkflowTransition(Base):
    """One allowed step of the claim workflow: `role` may move a claim from `from_status` to `to_status`.
    Read by services.workflow_policy (FR3)."""
    __tablename__ = "workflow_transitions"

    from_status: Mapped[ClaimStatus] = mapped_column(
        SAEnum(ClaimStatus, name="claim_status", create_type=False), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(50), primary_key=True)
    to_status: Mapped[ClaimStatus] = mapped_column(
        SAEnum(ClaimStatus, name="claim_status", create_type=False), primary_key=True
    )


class RolePermission(Base):
    """`role` holds `permission` (see services.workflow_policy for the permission names)."""
    __tablename__ = "role_permissions"

    role: Mapped[str] = mapped_column(String(50), primary_key=True)
    permission: Mapped[str] = mapped_column(String(50), primary_key=True)


class OutboxEvent(Base):
    """An event waiting for the dispatcher (workers/outbox_dispatcher.py). It is written in the same transaction
    as the change that raised it, so it exists exactly when that change committed."""
    __tablename__ = "outbox_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # notification.email or notification.sms
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    # pending → sent; or dead once the last allowed attempt has failed (the dead-letter state).
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Not picked up before this time: the retry backoff.
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Policy(Base):
    """The stand-in for the insurer's Policy Administration System, read through services.policy_gateway."""
    __tablename__ = "policies"

    policy_number: Mapped[str] = mapped_column(String(50), primary_key=True)
    # Who the insurer has on file as the policyholder; a portal account owns the policy when its email matches.
    holder_email: Mapped[str] = mapped_column(String(255), nullable=False)
    holder_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product: Mapped[str] = mapped_column(String(100), nullable=False)
    insured_item: Mapped[str] = mapped_column(String(255), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date] = mapped_column(Date, nullable=False)
    coverage_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deductible: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
