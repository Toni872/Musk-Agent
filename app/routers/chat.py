"""Chat and session supervision endpoints."""

from __future__ import annotations

from dataclasses import asdict
from typing import cast

from fastapi import APIRouter, HTTPException, Request, Response

from app.agent import HandoffContext, LeadContact, MuskAgent, TurnResult
from app.db import Conversation, ConversationRepository, Database, Message
from app.models import (
    ChatRequest,
    HandoffOut,
    LeadIn,
    QualificationOut,
    RecordOut,
    ReportPayload,
    SessionCreate,
    SessionStateOut,
    TurnOut,
)
from app.observability import logger
from app.pdf import build_conversation_pdf, build_handoff_pdf
from app.ratelimit import RateLimiter
from app.session import SessionStore

router = APIRouter(tags=["chat"])

_BANNER = (
    "Content: perfil único de Escuela Musk (contenido curado; firma final de redacción pendiente)."
)
_BANNER_DETERMINISTIC = _BANNER + " — modo determinista (sin modelo LLM)"


def _store(request: Request) -> SessionStore:
    return cast(SessionStore, request.app.state.session_store)


def _to_lead(payload: LeadIn | None) -> LeadContact | None:
    if payload is None:
        return None
    return LeadContact(
        id=payload.id,
        contact=payload.contact,
        bucket=payload.bucket,
        loss_reason=payload.loss_reason,
    )


def _to_handoff_out(handoff: HandoffContext) -> HandoffOut:
    return HandoffOut(
        reason=handoff.reason,
        lead_id=handoff.lead_id,
        contact=handoff.contact,
        bucket=handoff.bucket,
        recipient=handoff.recipient,
        last_message=handoff.last_message,
        summary=handoff.summary,
        formation=handoff.formation,
        doubts=list(handoff.doubts),
        loss_reason=handoff.loss_reason,
        after_handoff=list(handoff.after_handoff) if handoff.after_handoff else None,
    )


def _to_turn_out(result: TurnResult) -> TurnOut:
    handoff = _to_handoff_out(result.handoff) if result.handoff is not None else None
    return TurnOut(
        intent=result.intent,
        action=result.action,
        reply=result.reply,
        suppressed=result.suppressed,
        registered_doubts=list(result.registered_doubts),
        registered_no_continuar=result.registered_no_continuar,
        rule_violations=list(result.rule_violations),
        handoff=handoff,
    )


async def _persist(
    request: Request, payload: ChatRequest, agent: MuskAgent, result: TurnResult
) -> None:
    database = cast(Database | None, request.app.state.database)
    if database is None:
        return

    lead = payload.lead
    conversation = Conversation(
        id=payload.session_id,
        lead_id=lead.id if lead else "sim-lead",
        contact=lead.contact if lead else "simulated-contact",
        bucket=lead.bucket if lead else "ilocalizable",
        loss_reason=lead.loss_reason if lead else None,
        is_stopped=agent.is_stopped,
        handoff_fired=agent.handoff is not None,
        handoff_reason=agent.handoff.reason if agent.handoff else None,
        handoff_summary=agent.handoff.summary if agent.handoff else None,
    )

    async with database.session() as session:
        repo = ConversationRepository(session)
        await repo.save_conversation(conversation)
        await repo.add_message(
            Message(
                conversation_id=payload.session_id,
                role="lead",
                content=payload.message,
                action=result.action,
                intent=result.intent,
            )
        )
        if result.reply:
            await repo.add_message(
                Message(
                    conversation_id=payload.session_id,
                    role="assistant",
                    content=result.reply,
                    action=result.action,
                    intent=result.intent,
                    rule_violations=",".join(result.rule_violations),
                    registered_doubt=bool(result.registered_doubts),
                )
            )


@router.post("/chat", response_model=TurnOut)
async def create_turn(payload: ChatRequest, request: Request) -> TurnOut:
    limiter = cast(RateLimiter, request.app.state.rate_limiter)
    client_ip = request.client.host if request.client is not None else "unknown"
    if not limiter.allow(client_ip):
        raise HTTPException(status_code=429, detail="rate limit exceeded")

    store = _store(request)
    agent = await store.get_or_create(payload.session_id, _to_lead(payload.lead))
    result = await agent.run_turn(payload.message)
    await store.save(payload.session_id, agent)
    logger.info(
        "turn",
        session_id=payload.session_id,
        intent=result.intent,
        action=result.action,
        suppressed=result.suppressed,
        rule_violations=len(result.rule_violations),
        registered_doubts=len(result.registered_doubts),
    )
    await _persist(request, payload, agent, result)
    return _to_turn_out(result)


@router.get("/sessions/{session_id}")
async def session_status(session_id: str, request: Request) -> dict[str, object]:
    agent = await _store(request).get(session_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="session not found")
    handoff = _to_handoff_out(agent.handoff) if agent.handoff is not None else None
    return {
        "session_id": session_id,
        "is_stopped": agent.is_stopped,
        "doubts": agent.doubts,
        "handoff": handoff,
        "records_count": len(agent.records),
        "metrics": asdict(agent.metrics),
    }


@router.get("/sessions/{session_id}/pdf")
async def session_pdf(session_id: str, request: Request) -> Response:
    agent = await _store(request).get(session_id)
    if agent is None or agent.handoff is None:
        raise HTTPException(status_code=404, detail="handoff not available")
    return Response(
        content=build_handoff_pdf(agent.handoff),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="aviso-{session_id}.pdf"'},
    )


def _session_state(store: SessionStore, session_id: str, agent: MuskAgent) -> SessionStateOut:
    handoff = _to_handoff_out(agent.handoff) if agent.handoff is not None else None
    banner = _BANNER if store.uses_llm else _BANNER_DETERMINISTIC
    return SessionStateOut(
        session_id=session_id,
        banner=banner,
        opening=agent.opening(),
        stopped=agent.is_stopped,
        turn_count=agent.metrics.turns,
        records=[
            RecordOut(
                kind=record.kind,
                detail=record.detail,
                timestamp=record.timestamp,
                intent=record.intent,
            )
            for record in agent.records
        ],
        doubts=agent.doubts,
        pending_decisions=agent.pending_decisions,
        qualification_answers=[
            QualificationOut(question_id=question_id, answer=answer)
            for question_id, answer in agent.qualification_answers
        ],
        handoff=handoff,
        metrics=asdict(agent.metrics),
    )


@router.post("/sessions", response_model=SessionStateOut)
async def create_session(payload: SessionCreate, request: Request) -> SessionStateOut:
    """Open (or reuse) a session and return its initial state for the UI."""
    store = _store(request)
    agent = await store.get_or_create(payload.session_id, _to_lead(payload.lead))
    return _session_state(store, payload.session_id, agent)


@router.get("/sessions/{session_id}/state", response_model=SessionStateOut)
async def session_state(session_id: str, request: Request) -> SessionStateOut:
    """Full conversation state the simulator UI renders (opening, records, doubts)."""
    store = _store(request)
    agent = await store.get_or_create(session_id)
    return _session_state(store, session_id, agent)


@router.post("/report.pdf")
async def report_pdf(payload: ReportPayload) -> Response:
    """Render the full operator report (conversation + records) as a PDF."""
    return Response(
        content=build_conversation_pdf(payload),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="informe-musk.pdf"'},
    )
