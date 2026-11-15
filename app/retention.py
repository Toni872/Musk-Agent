"""Retention and erasure of stored lead data.

Two operations cover the data-protection duties of the pilot:

- ``purge_expired``: delete everything whose last activity is older than the
  retention window. It is the routine sweep (data minimization).
- ``delete_lead``: delete every row that belongs to one person. It is the
  erasure of a subject request (RGPD art. 17) or of a lead who asked to stop and
  wants their data gone.

Both are available from the command line and require ``--yes`` for a real
deletion; without it they only report. They are deliberately not exposed over
HTTP: an unauthenticated deletion endpoint would be a worse risk than the one it
solves, and the operator runs these commands on the server.

The stored data lives in three tables (``conversation``, ``message`` and
``agent_session``); ``agent_session.state`` is JSON that also contains the lead,
so erasure has to read it instead of trusting the header row alone.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlmodel import delete, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.db import AgentSession, Conversation, Database, Message


@dataclass(frozen=True)
class PurgeReport:
    """How many rows an operation deleted (or would delete)."""

    conversations: int
    messages: int
    sessions: int
    dry_run: bool

    @property
    def total(self) -> int:
        return self.conversations + self.messages + self.sessions


def _utc(value: datetime) -> datetime:
    """Return ``value`` as an aware UTC datetime.

    SQLite hands datetimes back without tzinfo, so comparing them to an aware
    cutoff raises. Normalizing here keeps the comparison correct on both SQLite
    and Postgres.
    """
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _state_lead_id(state: str) -> str | None:
    """Read the lead id out of a serialized session state, if present."""
    try:
        data = json.loads(state)
    except (TypeError, ValueError):
        return None
    lead = data.get("lead") if isinstance(data, dict) else None
    if not isinstance(lead, dict):
        return None
    value = lead.get("id")
    return str(value) if value is not None else None


async def _count_messages(session: AsyncSession, conversation_ids: Sequence[str]) -> int:
    if not conversation_ids:
        return 0
    statement = (
        select(func.count())
        .select_from(Message)
        .where(Message.conversation_id.in_(list(conversation_ids)))  # type: ignore[attr-defined]
    )
    return int((await session.exec(statement)).one())


async def _delete_rows(session: AsyncSession, conversation_ids: Sequence[str]) -> None:
    """Delete messages, conversations and session states for the given ids."""
    ids = list(conversation_ids)
    await session.exec(delete(Message).where(Message.conversation_id.in_(ids)))  # type: ignore[attr-defined]
    await session.exec(delete(Conversation).where(Conversation.id.in_(ids)))  # type: ignore[attr-defined]
    await session.exec(delete(AgentSession).where(AgentSession.session_id.in_(ids)))  # type: ignore[attr-defined]
    await session.commit()


async def purge_expired(
    database: Database,
    *,
    retention_days: int,
    now: datetime | None = None,
    dry_run: bool = False,
) -> PurgeReport:
    """Delete data whose last activity is older than ``retention_days``."""
    if retention_days < 1:
        raise ValueError("retention_days must be at least 1")
    cutoff = (now or datetime.now(UTC)) - timedelta(days=retention_days)

    async with database.session() as session:
        last_activity = dict(
            (
                await session.exec(
                    select(Message.conversation_id, func.max(Message.created_at)).group_by(
                        Message.conversation_id
                    )
                )
            ).all()
        )
        conversations = (await session.exec(select(Conversation.id, Conversation.created_at))).all()
        expired = [
            conversation_id
            for conversation_id, created_at in conversations
            if _utc(last_activity.get(conversation_id) or created_at) < cutoff
        ]

        sessions = (await session.exec(select(AgentSession.session_id, AgentSession.updated_at))).all()
        expired_set = set(expired)
        stale_sessions = [
            session_id
            for session_id, updated_at in sessions
            if _utc(updated_at) < cutoff or session_id in expired_set
        ]

        message_count = await _count_messages(session, expired)
        report = PurgeReport(
            conversations=len(expired),
            messages=message_count,
            sessions=len(stale_sessions),
            dry_run=dry_run,
        )
        if dry_run or report.total == 0:
            return report
        await _delete_rows(session, sorted(expired_set | set(stale_sessions)))
    return report


async def delete_lead(database: Database, lead_id: str, *, dry_run: bool = False) -> PurgeReport:
    """Delete every stored row that belongs to ``lead_id``."""
    async with database.session() as session:
        conversation_ids = set(
            (await session.exec(select(Conversation.id).where(Conversation.lead_id == lead_id))).all()
        )
        sessions = (await session.exec(select(AgentSession.session_id, AgentSession.state))).all()
        state_ids = {session_id for session_id, state in sessions if _state_lead_id(state) == lead_id}

        targets = sorted(conversation_ids | state_ids)
        report = PurgeReport(
            conversations=len(conversation_ids),
            messages=await _count_messages(session, targets),
            sessions=len(state_ids),
            dry_run=dry_run,
        )
        if dry_run or report.total == 0:
            return report
        await _delete_rows(session, targets)
    return report


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.retention",
        description=(
            "Conservacion y borrado de datos de leads. Sin --yes solo informa "
            "(simulacion); un borrado real exige --yes."
        ),
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Dias de conservacion (por defecto MUSK_RETENTION_DAYS o 90).",
    )
    parser.add_argument(
        "--lead",
        default=None,
        help="Borra todos los datos de ese lead (derecho de supresion).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fuerza la simulacion aunque se pase --yes.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Ejecuta el borrado de verdad. Sin esta opcion no se borra nada.",
    )
    return parser


def _print_report(report: PurgeReport, *, scope: str) -> None:
    mode = "SIMULACION (no se ha borrado nada)" if report.dry_run else "BORRADO REAL"
    print(f"Modo: {mode}")
    print(f"Alcance: {scope}")
    print(f"Conversaciones: {report.conversations}")
    print(f"Mensajes: {report.messages}")
    print(f"Estados de sesion: {report.sessions}")
    if report.dry_run:
        print("Para ejecutarlo de verdad, repite el comando anadiendo --yes.")


async def main(
    argv: Sequence[str] | None = None, database: Database | None = None
) -> int:
    """Command-line entry point. Returns the process exit code."""
    args = _build_parser().parse_args(argv)
    settings = get_settings()
    retention_days = args.days if args.days is not None else settings.retention_days
    if retention_days < 1:
        print("Error: --days debe ser un entero mayor o igual que 1.")
        return 2

    owns_database = database is None
    db = database if database is not None else Database(settings.database_url)
    if owns_database:
        await db.init()
    try:
        dry_run = args.dry_run or not args.yes
        if args.lead is not None:
            report = await delete_lead(db, args.lead, dry_run=dry_run)
            scope = f"lead {args.lead}"
        else:
            report = await purge_expired(db, retention_days=retention_days, dry_run=dry_run)
            scope = f"datos con mas de {retention_days} dias sin actividad"
    finally:
        if owns_database:
            await db.dispose()

    _print_report(report, scope=scope)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
