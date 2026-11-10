"""Persistence layer: SQLModel + async SQLite (Postgres-ready).

The MVP goal is to MEASURE whether WhatsApp reactivates leads, so every turn is
recorded: the conversation header (lead, bucket, handoff state) and the raw
messages. The store is SQLite for local runs and swaps to Postgres by changing
``DATABASE_URL`` (SQLModel models are driver-agnostic).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import Field, SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession


class Conversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    lead_id: str
    contact: str
    bucket: str
    loss_reason: str | None = None
    is_stopped: bool = False
    handoff_fired: bool = False
    handoff_reason: str | None = None
    handoff_summary: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Message(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: str = Field(foreign_key="conversation.id", index=True)
    role: str
    content: str
    action: str
    intent: str
    rule_violations: str = ""
    registered_doubt: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Database:
    def __init__(self, url: str) -> None:
        self._engine = create_async_engine(url, echo=False)

    async def init(self) -> None:
        async with self._engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

    async def dispose(self) -> None:
        await self._engine.dispose()

    def session(self) -> AsyncSession:
        return AsyncSession(self._engine)


class ConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save_conversation(self, conversation: Conversation) -> None:
        await self._session.merge(conversation)
        await self._session.commit()

    async def add_message(self, message: Message) -> None:
        self._session.add(message)
        await self._session.commit()

    async def get_conversation(self, conversation_id: str) -> Conversation | None:
        return await self._session.get(Conversation, conversation_id)

    async def list_messages(self, conversation_id: str) -> list[Message]:
        statement = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at, Message.id)  # type: ignore[arg-type]
        )
        result = await self._session.exec(statement)
        return list(result.all())
