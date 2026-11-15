"""Retention and erasure of stored lead data (spec S1-S4)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlmodel import select

from app.db import AgentSession, Conversation, Database, Message
from app.retention import delete_lead, main, purge_expired

NOW = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def _days_ago(days: int) -> datetime:
    return NOW - timedelta(days=days)


async def _make_db(path) -> Database:
    database = Database(f"sqlite+aiosqlite:///{path.as_posix()}")
    await database.init()
    return database


async def _seed(
    database: Database,
    *,
    conversation_id: str,
    lead_id: str,
    created: datetime,
    messages: int,
    last_message: datetime | None = None,
    session_updated: datetime | None = None,
    session_state: str | None = None,
) -> None:
    async with database.session() as session:
        session.add(
            Conversation(
                id=conversation_id,
                lead_id=lead_id,
                contact="+34600000000",
                bucket="no_comprador",
                created_at=created,
            )
        )
        for index in range(messages):
            session.add(
                Message(
                    conversation_id=conversation_id,
                    role="lead",
                    content=f"mensaje {index}",
                    action="none",
                    intent="conversation",
                    created_at=last_message or created,
                )
            )
        if session_state is not None:
            session.add(
                AgentSession(
                    session_id=conversation_id,
                    state=session_state,
                    updated_at=session_updated or created,
                )
            )
        await session.commit()


def _state(lead_id: str) -> str:
    return json.dumps({"lead": {"id": lead_id, "contact": "+34600000000", "bucket": "no_comprador"}})


async def test_purge_removes_only_expired_conversations(tmp_path) -> None:
    database = await _make_db(tmp_path / "purge.db")
    try:
        await _seed(
            database,
            conversation_id="old",
            lead_id="lead-old",
            created=_days_ago(120),
            messages=2,
            session_state=_state("lead-old"),
        )
        await _seed(
            database,
            conversation_id="fresh",
            lead_id="lead-fresh",
            created=_days_ago(1),
            messages=1,
            session_state=_state("lead-fresh"),
        )

        report = await purge_expired(database, retention_days=90, now=NOW)

        assert (report.conversations, report.messages, report.sessions) == (1, 2, 1)
        remaining = await _ids(database)
        assert remaining["conversations"] == ["fresh"]
        assert remaining["sessions"] == ["fresh"]
        assert len(remaining["messages"]) == 1
    finally:
        await database.dispose()


async def test_purge_uses_the_last_message_time_not_creation(tmp_path) -> None:
    """A conversation started long ago but active yesterday is still in retention."""
    database = await _make_db(tmp_path / "activity.db")
    try:
        await _seed(
            database,
            conversation_id="long-but-active",
            lead_id="lead-active",
            created=_days_ago(200),
            messages=1,
            last_message=_days_ago(1),
            session_updated=_days_ago(1),
            session_state=_state("lead-active"),
        )

        report = await purge_expired(database, retention_days=90, now=NOW)

        assert report.total == 0
        assert (await _ids(database))["conversations"] == ["long-but-active"]
    finally:
        await database.dispose()


async def test_purge_removes_session_state_without_a_conversation(tmp_path) -> None:
    """Opening a session stores the lead; retention must cover that row too."""
    database = await _make_db(tmp_path / "orphan.db")
    try:
        async with database.session() as session:
            session.add(
                AgentSession(
                    session_id="never-chatted",
                    state=_state("lead-open"),
                    updated_at=_days_ago(100),
                )
            )
            await session.commit()

        report = await purge_expired(database, retention_days=90, now=NOW)

        assert report.sessions == 1
        assert (await _ids(database))["sessions"] == []
    finally:
        await database.dispose()


async def test_dry_run_reports_without_deleting(tmp_path) -> None:
    database = await _make_db(tmp_path / "dry.db")
    try:
        await _seed(
            database,
            conversation_id="old",
            lead_id="lead-old",
            created=_days_ago(120),
            messages=2,
            session_state=_state("lead-old"),
        )

        report = await purge_expired(database, retention_days=90, now=NOW, dry_run=True)

        assert report.dry_run is True
        assert (report.conversations, report.messages, report.sessions) == (1, 2, 1)
        remaining = await _ids(database)
        assert remaining["conversations"] == ["old"]
        assert len(remaining["messages"]) == 2
    finally:
        await database.dispose()


async def test_delete_lead_erases_every_trace_of_that_person(tmp_path) -> None:
    database = await _make_db(tmp_path / "lead.db")
    try:
        await _seed(
            database,
            conversation_id="lead-a-1",
            lead_id="lead-a",
            created=_days_ago(3),
            messages=2,
            session_state=_state("lead-a"),
        )
        await _seed(
            database,
            conversation_id="lead-a-2",
            lead_id="lead-a",
            created=_days_ago(2),
            messages=1,
            session_state=_state("lead-a"),
        )
        await _seed(
            database,
            conversation_id="lead-b-1",
            lead_id="lead-b",
            created=_days_ago(2),
            messages=1,
            session_state=_state("lead-b"),
        )

        report = await delete_lead(database, "lead-a")

        assert (report.conversations, report.messages, report.sessions) == (2, 3, 2)
        remaining = await _ids(database)
        assert remaining["conversations"] == ["lead-b-1"]
        assert remaining["sessions"] == ["lead-b-1"]
        assert len(remaining["messages"]) == 1
    finally:
        await database.dispose()


async def test_delete_lead_reaches_a_session_state_that_never_chatted(tmp_path) -> None:
    """Erasure must find the lead inside the serialized state, not just the header row."""
    database = await _make_db(tmp_path / "lead-state.db")
    try:
        async with database.session() as session:
            session.add(
                AgentSession(
                    session_id="state-only",
                    state=_state("lead-a"),
                    updated_at=_days_ago(1),
                )
            )
            await session.commit()

        report = await delete_lead(database, "lead-a")

        assert report.sessions == 1
        assert (await _ids(database))["sessions"] == []
    finally:
        await database.dispose()


async def test_cli_defaults_to_dry_run_and_deletes_nothing(tmp_path) -> None:
    """Without --yes the erasure command only reports what it would remove."""
    database = await _make_db(tmp_path / "cli.db")
    try:
        await _seed(
            database,
            conversation_id="lead-a-1",
            lead_id="lead-a",
            created=_days_ago(3),
            messages=1,
            session_state=_state("lead-a"),
        )

        exit_code = await main(["--lead", "lead-a"], database=database)

        assert exit_code == 0
        assert (await _ids(database))["conversations"] == ["lead-a-1"]
    finally:
        await database.dispose()


async def _ids(database: Database) -> dict[str, list]:
    async with database.session() as session:
        conversations = list((await session.exec(select(Conversation.id))).all())
        sessions = list((await session.exec(select(AgentSession.session_id))).all())
        messages = list((await session.exec(select(Message.id))).all())
    return {"conversations": sorted(conversations), "sessions": sorted(sessions), "messages": messages}
