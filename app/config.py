"""Application configuration (pydantic-settings).

Environment-driven settings. The LLM provider is built separately in
``app.main`` via ``load_llm_config_from_env``; this module holds the
operational knobs (logging, database) that will grow with persistence.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    log_level: str = "WARNING"
    database_url: str = "sqlite+aiosqlite:///./musk.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
