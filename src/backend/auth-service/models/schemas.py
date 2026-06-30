import uuid
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator


class UserRole(str, Enum):
    CUSTOMER = "CUSTOMER"
    CASE_MANAGER = "CASE_MANAGER"
    SURVEYOR = "SURVEYOR"
    ADJUSTOR = "ADJUSTOR"
    AUDITOR = "AUDITOR"
    REGIONAL_MANAGER = "REGIONAL_MANAGER"


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    address: str | None = None
