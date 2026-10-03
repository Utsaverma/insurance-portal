from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://localhost/claims_db"
    redis_url: str = "redis://localhost:6379/0"
    auth_service_url: str = "http://auth-service:8000"
    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 10
    log_level: str = "INFO"
    environment: str = "development"
    redis_cache_ttl: int = 60
    # FR3: "db" reads the workflow and role permissions from their tables (falling back to the copy in code
    # while they are empty or missing); "code" ignores the tables.
    workflow_source: Literal["db", "code"] = "db"
    workflow_cache_ttl: int = 30
    # Outbox dispatcher (workers/outbox_dispatcher.py) and the mail it sends.
    smtp_host: str = "mail"
    smtp_port: int = 1025
    mail_from: str = "eClaims <no-reply@eclaims.local>"
    customer_portal_url: str = "http://localhost:3000"
    internal_portal_url: str = "http://localhost:3001"
    outbox_poll_seconds: float = 1.0
    outbox_batch_size: int = 20
    outbox_max_attempts: int = 5
    outbox_backoff_seconds: float = 2.0
    allowed_extensions: list[str] = [".pdf", ".jpg", ".jpeg", ".png"]
    allowed_mimes: list[str] = ["application/pdf", "image/jpeg", "image/png"]

    @computed_field
    @property
    def max_file_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
