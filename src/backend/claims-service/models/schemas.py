import uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.db_models import ClaimStatus

# Money as the database stores it, NUMERIC(12,2): positive, at most 10 whole digits and 2 decimals.
# Anything else is refused as a 422 here rather than rounded or overflowing in the database.
Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class ClaimCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    policy_number: str = Field(min_length=1, max_length=50)
    incident_date: date
    incident_description: str = Field(min_length=20, max_length=5000)
    claimed_amount: Money

    @field_validator("incident_date")
    @classmethod
    def not_in_the_future(cls, v: date) -> date:
        # One day of slack: "today" for a customer east of UTC is already tomorrow on the server.
        if v > datetime.now(timezone.utc).date() + timedelta(days=1):
            raise ValueError("incident_date cannot be in the future")
        return v


class AllowedActions(BaseModel):
    """What the caller may do to this claim right now, worked out by the server from the workflow and the
    access rules, so the portals never re-implement the state machine."""
    # Workflow steps: PATCH /claims/{id}/status with one of these statuses.
    transitions: list[ClaimStatus] = []
    # Case-manager overrides: the same PATCH, with a mandatory reason.
    overrides: list[ClaimStatus] = []
    # POST /claims/{id}/assign
    assign: bool = False
    # POST /claims/{id}/documents
    upload: bool = False


class ClaimResponse(BaseModel):
    id: uuid.UUID
    claim_number: str
    customer_id: uuid.UUID
    policy_number: str
    incident_date: date
    incident_description: str
    claimed_amount: Decimal
    assessed_amount: Decimal | None = None
    approved_amount: Decimal | None = None
    status: ClaimStatus
    assigned_to: uuid.UUID | None
    assigned_staff_name: str | None = None
    allowed_actions: AllowedActions = AllowedActions()
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClaimListResponse(BaseModel):
    items: list[ClaimResponse]
    total: int


class StatusUpdateRequest(BaseModel):
    status: ClaimStatus
    note: str | None = Field(default=None, max_length=2000)
    # Required when moving to SURVEYED (assessed) or APPROVED (approved); rejected for any other status.
    assessed_amount: Money | None = None
    approved_amount: Money | None = None


class AssignRequest(BaseModel):
    assigned_to: uuid.UUID


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
    changed_by_name: str | None = None
    changed_at: datetime
    note: str | None

    model_config = ConfigDict(from_attributes=True)


class UserContext(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    full_name: str | None = None


class StaffMember(BaseModel):
    """A user as the staff directory knows them: display name and role."""
    name: str
    role: str



class AgeingBucket(BaseModel):
    label: str
    min_days: int
    max_days: int | None
    count: int


class ClosedClaim(BaseModel):
    id: uuid.UUID
    claim_number: str
    policy_number: str
    status: ClaimStatus
    claimed_amount: Decimal
    approved_amount: Decimal | None
    submitted_at: datetime
    # The claim's latest move to PAID or REJECTED in the audit trail.
    closed_at: datetime
    processing_days: float


class ReportSummary(BaseModel):
    as_of: datetime
    total_claims: int
    by_status: dict[ClaimStatus, int]
    total_approved_amount: Decimal
    total_paid_amount: Decimal
    closed_claims: int
    avg_processing_days: float | None
    # Open claims by time since submission.
    open_ageing: list[AgeingBucket]
    recently_closed: list[ClosedClaim]
