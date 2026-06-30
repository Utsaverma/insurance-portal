import uuid
from datetime import datetime, date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator

from models.db_models import ClaimStatus


class ClaimCreate(BaseModel):
    policy_number: str
    incident_date: date
    incident_description: str
    claimed_amount: Decimal

    @field_validator("claimed_amount")
    @classmethod
    def positive_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("claimed_amount must be greater than 0")
        return v


class ClaimResponse(BaseModel):
    id: uuid.UUID
    claim_number: str
    customer_id: uuid.UUID
    policy_number: str
    incident_date: date
    incident_description: str
    claimed_amount: Decimal
    status: ClaimStatus
    assigned_to: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClaimListResponse(BaseModel):
    items: list[ClaimResponse]
    total: int


class StatusUpdateRequest(BaseModel):
    status: ClaimStatus
    note: str | None = None


class DocumentResponse(BaseModel):
    id: uuid.UUID
    claim_id: uuid.UUID
    filename: str
    mime_type: str
    file_size_bytes: int
    uploaded_by: uuid.UUID
    uploaded_at: datetime
    download_url: str

    model_config = ConfigDict(from_attributes=True)


class HistoryEntry(BaseModel):
    id: uuid.UUID
    claim_id: uuid.UUID
    from_status: str | None
    to_status: str
    changed_by: uuid.UUID
    changed_at: datetime
    note: str | None

    model_config = ConfigDict(from_attributes=True)


class UserContext(BaseModel):
    id: uuid.UUID
    email: str
    role: str


class HealthResponse(BaseModel):
    status: str
    db: str
    redis: str
