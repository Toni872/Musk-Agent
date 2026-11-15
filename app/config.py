"""Application configuration (pydantic-settings).

Environment-driven settings. The LLM provider is built separately in
``app.main`` via ``load_llm_config_from_env``; this module holds the
operational knobs (logging, database) that will grow with persistence.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Conservative default, NOT a decision agreed with MUSK: pending `TODO(decisión)`
# in docs/operacion/retencion-y-borrado.md. It is configurable per deployment.
RETENTION_DAYS_DEFAULT = 90


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", populate_by_name=True
    )

    log_level: str = "WARNING"
    database_url: str = "sqlite+aiosqlite:///./musk.db"
    # Per-client cap on cost-bearing /chat calls per minute.
    max_calls_per_minute: int = 30
    # Public, unauthenticated demo (synthetic data only). Without Basic Auth
    # credentials the app refuses every non-public request unless this is on.
    public_demo: bool = Field(default=False, validation_alias="MUSK_PUBLIC_DEMO")
    # How long stored lead data survives before the retention sweep may delete it.
    retention_days: int = Field(
        default=RETENTION_DAYS_DEFAULT, ge=1, validation_alias="MUSK_RETENTION_DAYS"
    )
    # Fernet key for encrypting backups at rest. When absent, backups are plain.
    encryption_key: str | None = Field(default=None, validation_alias="MUSK_ENCRYPTION_KEY")


@lru_cache
def get_settings() -> Settings:
    return Settings()
