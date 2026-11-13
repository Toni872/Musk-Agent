"""Tests for the persistence layer (SQLModel + aiosqlite, temp-file DB)."""

from __future__ import annotations

from app.db import Conversation, ConversationRepository, Database, Message, normalize_database_url


async def _make_db(path) -> Database:
    database = Database(f"sqlite+aiosqlite:///{path.as_posix()}")
    await database.init()
    return database


async def test_roundtrip_conversation_and_messages(tmp_path) -> None:
    database = await _make_db(tmp_path / "test.db")
    try:
        async with database.session() as session:
            repo = ConversationRepository(session)
            await repo.save_conversation(
                Conversation(id="c1", lead_id="l1", contact="+34600000000", bucket="ilocalizable")
            )
            await repo.add_message(
                Message(
                    conversation_id="c1",
                    role="lead",
                    content="hola",
                    action="none",
                    intent="conversation",
                )
            )
            await repo.add_message(
                Message(
                    conversation_id="c1",
                    role="assistant",
                    content="hola, ¿qué tal?",
                    action="none",
                    intent="conversation",
                )
            )

        async with database.session() as session:
            repo = ConversationRepository(session)
            conversation = await repo.get_conversation("c1")
            assert conversation is not None
            assert conversation.lead_id == "l1"
            assert conversation.bucket == "ilocalizable"
            messages = await repo.list_messages("c1")
            assert [m.role for m in messages] == ["lead", "assistant"]
            assert messages[1].content == "hola, ¿qué tal?"
    finally:
        await database.dispose()


async def test_save_conversation_updates_in_place(tmp_path) -> None:
    database = await _make_db(tmp_path / "test.db")
    try:
        async with database.session() as session:
            repo = ConversationRepository(session)
            await repo.save_conversation(
                Conversation(id="c2", lead_id="l2", contact="+34", bucket="no_comprador")
            )

        async with database.session() as session:
            repo = ConversationRepository(session)
            await repo.save_conversation(
                Conversation(
                    id="c2",
                    lead_id="l2",
                    contact="+34",
                    bucket="no_comprador",
                    is_stopped=True,
                    handoff_fired=True,
                    handoff_reason="call_accepted",
                )
            )

        async with database.session() as session:
            repo = ConversationRepository(session)
            conversation = await repo.get_conversation("c2")
            assert conversation is not None
            assert conversation.is_stopped is True
            assert conversation.handoff_reason == "call_accepted"
    finally:
        await database.dispose()


def test_normalize_database_url_maps_neon_to_asyncpg() -> None:
    url, connect_args = normalize_database_url(
        "postgresql://user:secret@ep-x-pooler.eu.neon.tech/neondb?sslmode=require"
    )
    assert url.startswith("postgresql+asyncpg://user:secret@ep-x-pooler.eu.neon.tech/neondb")
    assert "sslmode" not in url
    assert "prepared_statement_cache_size=0" in url
    assert connect_args == {"ssl": True, "statement_cache_size": 0}


def test_normalize_database_url_leaves_sqlite_untouched() -> None:
    url, connect_args = normalize_database_url("sqlite+aiosqlite:///./musk.db")
    assert url == "sqlite+aiosqlite:///./musk.db"
    assert connect_args == {}
