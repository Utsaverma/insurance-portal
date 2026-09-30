from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    app_env: str = "development"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @field_validator("jwt_secret_key")
    @classmethod
    def _secret_is_strong(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError(
                "JWT_SECRET_KEY must be at least 32 characters; generate one with "
                "python3 -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return value


settings = Settings()
