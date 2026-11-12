"""FastAPI application factory.

The agent runs server-side: the LLM provider (when configured) is built once
and shared, each conversation is a session-scoped ``MuskAgent`` held by the
in-memory ``SessionStore``, and every turn is persisted through the ``Database``
when one is configured.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.auth import BasicAuthMiddleware, load_basic_auth_from_env
from app.config import get_settings
from app.content import APPROVED_CONTENT
from app.db import Database
from app.llm import LLMProvider, OpenAICompatibleLLM, load_llm_config_from_env
from app.observability import configure_logging
from app.ratelimit import RateLimiter
from app.routers import chat, health
from app.session import SessionStore

# Load .env into os.environ so the LLM provider config is visible when the app
# boots under `uv run uvicorn` (uv does not source .env itself).
load_dotenv()


def build_provider() -> LLMProvider | None:
    config = load_llm_config_from_env()
    return OpenAICompatibleLLM(config) if config is not None else None


def create_app(
    provider: LLMProvider | None,
    database: Database | None = None,
    *,
    basic_auth: tuple[str, str] | None = None,
) -> FastAPI:
    configure_logging(get_settings().log_level)
    store = SessionStore(provider=provider, content=APPROVED_CONTENT)
    limiter = RateLimiter(max_calls=get_settings().max_calls_per_minute)

    @asynccontextmanager
    async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
        if database is not None:
            await database.init()
        yield
        if database is not None:
            await database.dispose()

    application = FastAPI(title="MUSK Agent", version="0.1.0", lifespan=lifespan)
    if basic_auth is not None:
        username, password = basic_auth
        application.add_middleware(BasicAuthMiddleware, username=username, password=password)
    application.state.session_store = store
    application.state.database = database
    application.state.rate_limiter = limiter
    application.include_router(chat.router)
    application.include_router(health.router)

    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        application.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return application


app = create_app(
    build_provider(),
    Database(get_settings().database_url),
    basic_auth=load_basic_auth_from_env(),
)
