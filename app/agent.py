"""MuskAgent: empathic, thread-following conversation engine.

The LLM drives the reply; the deterministic knowledge base (app.kb) is
retrieved per turn (RAG) to ground the model in approved content. The only
hard machinery left is the safety floor: the input triggers (stop, human
request, call acceptance, phone handover) and the output guard (no prices,
amounts, financing conditions, syllabus detail, promotions or job promises).

Conversation memory is the raw message history (the model reads it to follow
the thread) plus two counters that keep the call proposal from becoming a
monotema: whether the last reply proposed a call, and how many times it has
been proposed overall.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime
from typing import Any, Literal, cast

from app.content import APPROVED_CONTENT, ApprovedContent, is_pending_decision
from app.llm import LLMChatMessage, LLMProvider, LLMRequest, LLMResult
from app.observability import logger
from app.redaction import redact
from app.retrieval import FORBIDDEN_TOPIC_PATTERNS, RankedPassage, retrieve, retrieve_top_k
from app.rules import (
    ANSWER_TRIGGERS,
    HANDOFF_TRIGGERS,
    STOP_TRIGGER,
    acceptance_confirmed,
    build_reply,
    extract_spanish_phone,
    guard_reply,
    moment_confirmed,
)
from app.text import normalize_es

LeadBucket = Literal["ilocalizable", "no_comprador"]
AgentAction = Literal["none", "handoff", "stop"]
HandoffReason = Literal["human_requested", "call_accepted"]
RecordKind = Literal["reply", "kb", "handoff", "stop", "doubt", "grounding"]


@dataclass(frozen=True)
class LeadContact:
    id: str
    contact: str
    bucket: LeadBucket
    loss_reason: str | None = None


@dataclass(frozen=True)
class HandoffContext:
    reason: HandoffReason
    lead_id: str
    contact: str
    bucket: LeadBucket
    last_message: str
    summary: str
    formation: str
    doubts: tuple[str, ...]
    recipient: str | None = None
    loss_reason: str | None = None
    after_handoff: tuple[str, ...] | None = None


@dataclass(frozen=True)
class TurnResult:
    intent: str
    action: AgentAction
    reply: str
    suppressed: bool
    registered_doubts: tuple[str, ...]
    registered_no_continuar: bool
    rule_violations: tuple[str, ...]
    handoff: HandoffContext | None = None


@dataclass(frozen=True)
class KbRecord:
    passage_id: str
    score: float
    coverage: float


@dataclass(frozen=True)
class ConversationRecord:
    kind: RecordKind
    detail: str
    timestamp: str
    intent: str | None = None
    kb: KbRecord | None = None


@dataclass
class Metrics:
    """Supervision counters: how the safety machinery actually behaved."""

    turns: int = 0
    guard_rejections: int = 0
    catalogue_fallbacks: int = 0
    doubts_registered: int = 0
    handoffs: int = 0
    stops: int = 0
    provider_failures: int = 0
    # LLM operational tracing (cost/latency/tokens). Never shown to the lead.
    llm_calls: int = 0
    llm_retries: int = 0
    llm_prompt_tokens: int = 0
    llm_completion_tokens: int = 0
    llm_total_tokens: int = 0
    llm_latency_ms: float = 0.0
    llm_cost_usd: float = 0.0
    llm_cost_known: bool = False


# Maximum turns of history the model reads to follow the thread.
_HISTORY_WINDOW = 20
# Maximum number of knowledge-base passages retrieved per turn.
_RAG_TOP_K = 4

# A safe, always-approved bridge for when the model produced nothing usable and
# the lead did not actually ask a question (e.g. "sí, cuéntame más"). It keeps
# the conversation moving with a warm follow-up, without pushing the call.
_GENERIC_BRIDGE = "Claro, te cuento. ¿Qué te gustaría saber?"

# The agent should sound like a real person in a chat: warm and helpful, never
# pushy. A call with the team is a gentle option when the lead shows clear intent
# to move forward, not something to repeat in every message.
_CALL_QUESTIONS = (
    "Si te apetece, ¿quieres que una persona del equipo te lo cuente en una llamada?",
    "Si te viene bien, una persona del equipo te lo puede explicar en una llamada. ¿Te gustaría?",
    "Cuando quieras dar el siguiente paso, te lo puede contar alguien del equipo por teléfono. ¿Te parece bien?",
)
_FOLLOW_UP_QUESTIONS = (
    "¿Qué te gustaría saber?",
    "¿En qué parte te puedo ayudar?",
    "¿Qué es lo que más te interesa saber ahora?",
    "¿Hay algo concreto que quieras que te cuente?",
    "¿Sobre qué te gustaría que hablemos?",
)
_CALL_QUESTION = _CALL_QUESTIONS[0]

# Strong interest that justifies offering a call (next step / details a human
# must confirm). General curiosity is not enough.
_CALL_INTENT = re.compile(
    r"\b(?:precios?|cuanto (?:cuesta|cuestan|cobra|vale)|costes?|pagos?|financi\w*|"
    r"cuotas?|becas?|descuentos?|matricula\w*|fechas?|inicio|empieza\w*|comienzo|"
    r"horarios?|apunt\w*|inscrib\w*|plazas?|reservar|"
    r"quiero (?:apuntarme|inscribirme|empezar|matricularme)|"
    r"me (?:quiero|gustaria) (?:apuntar|inscribir|matricular))\b"
)
# Turns without a call invitation before the backstop may offer one.
_CALL_CADENCE_TURNS = 5

# The list of programmes is closed and approved, so it can be given without the
# model. It is the answer used when the provider fails or its output is rejected
# and the lead asked what the school offers. Never carries figures.
_CATALOGUE_ANSWER = (
    "En Escuela Musk ofrecemos Python, Front End, Back End, Full Stack, el máster "
    "de videojuegos, Python con IA Engineering y los másteres de Inteligencia "
    "Artificial, Machine Learning y Deep Learning. Todos online y desde cero."
)

# Closed, lead-facing catalogue. Grounded on the approved passages.
_CATALOGUE = (
    "Python, Front End, Back End, Full Stack, el máster de videojuegos, Python con "
    "IA Engineering, y los másteres de Inteligencia Artificial, Machine Learning y "
    "Deep Learning"
)


def _truncate(text: str, max_length: int = 160) -> str:
    return text if len(text) <= max_length else f"{text[: max_length - 1]}…"


def _handoff_from_state(data: dict[str, Any]) -> HandoffContext:
    after_handoff = data.get("after_handoff")
    return HandoffContext(
        reason=cast(HandoffReason, data["reason"]),
        lead_id=str(data["lead_id"]),
        contact=str(data["contact"]),
        bucket=cast(LeadBucket, data["bucket"]),
        last_message=str(data["last_message"]),
        summary=str(data["summary"]),
        formation=str(data["formation"]),
        doubts=tuple(str(item) for item in data.get("doubts") or ()),
        recipient=str(data["recipient"]) if data.get("recipient") is not None else None,
        loss_reason=(
            str(data["loss_reason"]) if data.get("loss_reason") is not None else None
        ),
        after_handoff=(
            tuple(str(item) for item in after_handoff)
            if isinstance(after_handoff, list)
            else None
        ),
    )


def _record_from_state(data: dict[str, Any]) -> ConversationRecord:
    kb = data.get("kb")
    return ConversationRecord(
        kind=cast(RecordKind, data["kind"]),
        detail=str(data["detail"]),
        timestamp=str(data["timestamp"]),
        intent=str(data["intent"]) if data.get("intent") is not None else None,
        kb=(
            KbRecord(
                passage_id=str(kb["passage_id"]),
                score=float(kb["score"]),
                coverage=float(kb["coverage"]),
            )
            if isinstance(kb, dict)
            else None
        ),
    )


class MuskAgent:
    """Empathic, thread-following conversation engine over the approved content."""

    def __init__(
        self,
        content: ApprovedContent | None = None,
        provider: LLMProvider | None = None,
        lead: LeadContact | None = None,
    ) -> None:
        self._content = content if content is not None else APPROVED_CONTENT
        self._provider = provider
        self._lead = (
            lead
            if lead is not None
            else LeadContact(id="sim-lead", contact="simulated-contact", bucket="ilocalizable")
        )
        self._system_prompt = self._build_system_prompt()

        self._stopped = False
        self._handoff_fired = False
        self._last_handoff_context: HandoffContext | None = None
        self._conversation_records: list[ConversationRecord] = []
        self._doubt_messages: list[str] = []
        self._history: list[tuple[str, str]] = []  # (role, text)
        self._opening_seeded = False
        self._call_proposed_last_turn = False
        self._call_proposal_count = 0
        self._call_question_index = 0
        self._turns_since_call = 0
        self._metrics = Metrics()

    @property
    def lead(self) -> LeadContact:
        return self._lead

    def export_state(self) -> dict[str, Any]:
        """Serialize the mutable conversation state so any instance can rehydrate it."""
        handoff = self._last_handoff_context
        return {
            "lead": asdict(self._lead),
            "stopped": self._stopped,
            "handoff_fired": self._handoff_fired,
            "handoff": asdict(handoff) if handoff is not None else None,
            "records": [asdict(record) for record in self._conversation_records],
            "doubts": list(self._doubt_messages),
            "history": [{"role": role, "text": text} for role, text in self._history],
            "opening_seeded": self._opening_seeded,
            "call_proposed_last_turn": self._call_proposed_last_turn,
            "call_proposal_count": self._call_proposal_count,
            "call_question_index": self._call_question_index,
            "turns_since_call": self._turns_since_call,
            "metrics": asdict(self._metrics),
        }

    def load_state(self, state: dict[str, Any]) -> None:
        """Restore the mutable conversation state written by :meth:`export_state`."""
        lead = state.get("lead")
        if isinstance(lead, dict):
            self._lead = LeadContact(
                id=str(lead["id"]),
                contact=str(lead["contact"]),
                bucket=cast(LeadBucket, lead["bucket"]),
                loss_reason=(
                    str(lead["loss_reason"]) if lead.get("loss_reason") is not None else None
                ),
            )
        self._stopped = bool(state.get("stopped", False))
        self._handoff_fired = bool(state.get("handoff_fired", False))
        handoff = state.get("handoff")
        self._last_handoff_context = (
            _handoff_from_state(handoff) if isinstance(handoff, dict) else None
        )
        records = state.get("records")
        self._conversation_records = (
            [_record_from_state(item) for item in records if isinstance(item, dict)]
            if isinstance(records, list)
            else []
        )
        doubts = state.get("doubts")
        self._doubt_messages = [str(item) for item in doubts] if isinstance(doubts, list) else []
        history = state.get("history")
        self._history = (
            [(str(item["role"]), str(item["text"])) for item in history if isinstance(item, dict)]
            if isinstance(history, list)
            else []
        )
        self._opening_seeded = bool(state.get("opening_seeded", False))
        self._call_proposed_last_turn = bool(state.get("call_proposed_last_turn", False))
        self._call_proposal_count = int(state.get("call_proposal_count", 0))
        self._call_question_index = int(state.get("call_question_index", 0))
        self._turns_since_call = int(state.get("turns_since_call", 0))
        metrics = state.get("metrics")
        self._metrics = Metrics(**metrics) if isinstance(metrics, dict) else Metrics()

    @property
    def records(self) -> list[ConversationRecord]:
        return list(self._conversation_records)

    @property
    def is_stopped(self) -> bool:
        return self._stopped

    @property
    def handoff(self) -> HandoffContext | None:
        return self._last_handoff_context

    @property
    def doubts(self) -> list[str]:
        return list(self._doubt_messages)

    @property
    def metrics(self) -> Metrics:
        return self._metrics

    @property
    def qualification_answers(self) -> list[tuple[str, str]]:
        return []

    @property
    def pending_decisions(self) -> list[str]:
        pending: list[str] = []
        if (
            is_pending_decision(self._content.initial_message)
            or not self._content.initial_message.strip()
        ):
            pending.append("initial_message")
        if (
            is_pending_decision(self._content.company_presentation)
            or not self._content.company_presentation.strip()
        ):
            pending.append("company_presentation")
        return pending

    def reset(self) -> None:
        self._stopped = False
        self._handoff_fired = False
        self._last_handoff_context = None
        self._conversation_records.clear()
        self._doubt_messages.clear()
        self._history.clear()
        self._opening_seeded = False
        self._call_proposed_last_turn = False
        self._call_proposal_count = 0
        self._call_question_index = 0
        self._turns_since_call = 0
        self._metrics = Metrics()

    def opening(self) -> str | None:
        """The first outbound touch; None while MUSK's decision is still open."""
        message = self._content.initial_message
        if is_pending_decision(message) or not message.strip():
            return None
        if not guard_reply(message).ok:
            return None
        if not self._opening_seeded:
            self._history.append(("assistant", message))
            self._opening_seeded = True
        return message

    async def run_turn(self, message: str) -> TurnResult:
        self._metrics.turns += 1
        doubts_before = len(self._doubt_messages)
        result = await self._run_turn_inner(message)
        return replace(result, registered_doubts=tuple(self._doubt_messages[doubts_before:]))

    async def _run_turn_inner(self, message: str) -> TurnResult:
        if self._stopped:
            return self._suppressed_result()

        if self._handoff_fired:
            return self._after_handoff(message)

        folded = normalize_es(message)

        # Rule 7: stop the follow-up.
        if STOP_TRIGGER.search(folded):
            self._stopped = True
            self._metrics.stops += 1
            self._push("stop", "stop", f'lead requested stop: "{message}"')
            return TurnResult(
                intent="stop",
                action="stop",
                reply=build_reply("stop"),
                suppressed=False,
                registered_doubts=(),
                registered_no_continuar=True,
                rule_violations=(),
            )

        # Rule 9 (human request): explicit ask for a person.
        if HANDOFF_TRIGGERS["humanRequested"].search(folded):
            return self._fire_handoff("human_requested", message)

        # Rule 9 (contact handed over): the phone number is what the call needs.
        if extract_spanish_phone(message) is not None:
            return self._fire_handoff("call_accepted", message)

        # Rule 9 (confirmed call acceptance): only counts when the agent just
        # proposed a call in the previous turn.
        if self._call_proposed_last_turn and (
            acceptance_confirmed(folded)
            or moment_confirmed(folded)
            or ANSWER_TRIGGERS["affirmative"].search(folded)
        ):
            return self._fire_handoff("call_accepted", message)

        return await self._converse(message)

    def _suppressed_result(self) -> TurnResult:
        return TurnResult(
            intent="suppressed",
            action="none",
            reply="",
            suppressed=True,
            registered_doubts=(),
            registered_no_continuar=False,
            rule_violations=(),
        )

    def _after_handoff(self, message: str) -> TurnResult:
        self._push("reply", "handoff", f'after the handoff: "{message}"')
        context = self._last_handoff_context
        if context is not None:
            new_after = (*(context.after_handoff or ()), message)
            context = replace(
                context,
                last_message=message,
                after_handoff=new_after,
                summary=self._build_handoff_summary(context.reason, message),
            )
            self._last_handoff_context = context
        result = self._suppressed_result()
        result = replace(result, intent="handoff", handoff=context)
        return result

    def _fire_handoff(self, reason: HandoffReason, message: str) -> TurnResult:
        self._handoff_fired = True
        self._metrics.handoffs += 1
        reply = (
            build_reply("humanRequest")
            if reason == "human_requested"
            else build_reply("callAccepted")
        )
        context = self._build_handoff(reason, message)
        self._last_handoff_context = context
        self._push("handoff", "handoff", f"reason={reason}")
        self._push("reply", "handoff", reply)
        return TurnResult(
            intent="handoff",
            action="handoff",
            reply=reply,
            suppressed=False,
            registered_doubts=(),
            registered_no_continuar=False,
            rule_violations=(),
            handoff=context,
        )

    async def _converse(self, message: str) -> TurnResult:
        self._turns_since_call += 1
        ranked = retrieve_top_k(self._content.kb or (), message, _RAG_TOP_K)
        context = self._with_overview(ranked)
        if context:
            self._push(
                "kb",
                "conversation",
                "kb top: " + ", ".join(entry.passage.id for entry in context),
            )

        self._history.append(("lead", message))

        if self._provider is None:
            return self._deterministic_reply(message)

        try:
            result = await self._provider.complete(
                LLMRequest(
                    system=self._build_turn_prompt(context),
                    messages=self._build_history_messages(),
                )
            )
        except Exception:
            self._metrics.provider_failures += 1
            self._push("grounding", "conversation", "provider failed: used fallback")
            return self._deterministic_reply(message)

        self._record_llm_usage(result)
        raw = self._clean_reply(result.text.strip())
        if not raw:
            self._push("grounding", "conversation", "empty reply: used fallback")
            return self._deterministic_reply(message)

        # Never chain questions: one answer, one question.
        wants_call = self._looks_like_question(message) and self._should_propose_call(message)
        if self._has_chained_questions(raw):
            self._push(
                "grounding",
                "conversation",
                f'chained questions collapsed: "{_truncate(raw)}"',
            )
            closing = self._next_call_question() if wants_call else self._next_follow_up()
            raw = self._collapse_to_question(raw, closing)

        # Contextual call policy: offer a call only when there is clear intent.
        # Never push the team/call on a simple greeting or casual chat.
        if wants_call and not self._proposes_call(raw):
            self._push(
                "grounding",
                "conversation",
                f'call invitation added after a question: "{_truncate(raw)}"',
            )
            raw = self._collapse_to_question(raw, self._next_call_question())
        elif not wants_call and self._proposes_call(raw):
            self._push(
                "grounding",
                "conversation",
                f'unsolicited call invitation softened: "{_truncate(raw)}"',
            )
            raw = self._collapse_to_question(raw, self._next_follow_up())
        elif "?" not in raw:
            self._push(
                "grounding",
                "conversation",
                f'follow-up question added: "{_truncate(raw)}"',
            )
            raw = self._collapse_to_question(raw, self._next_follow_up())

        guard = guard_reply(raw)
        if not guard.ok:
            self._metrics.guard_rejections += 1
            violations = [f"{v.id}(rule {v.rule})" for v in guard.violations]
            self._push(
                "grounding",
                "conversation",
                f'reply rejected ({", ".join(violations)}): "{_truncate(raw)}"',
            )
            return self._safe_fallback(message, tuple(violations))

        self._call_proposed_last_turn = self._proposes_call(raw)
        if self._call_proposed_last_turn:
            self._call_proposal_count += 1
        self._history.append(("assistant", raw))
        self._push("reply", "conversation", raw)
        return TurnResult(
            intent="conversation",
            action="none",
            reply=raw,
            suppressed=False,
            registered_doubts=(),
            registered_no_continuar=False,
            rule_violations=(),
        )

    def _with_overview(self, ranked: list[RankedPassage]) -> list[RankedPassage]:
        if any(entry.passage.id == "kb-escuela" for entry in ranked):
            return ranked
        overview = next((p for p in (self._content.kb or ()) if p.id == "kb-escuela"), None)
        if overview is None:
            return ranked
        return [RankedPassage(overview, 0.0, 0.0), *ranked]

    def _is_greeting(self, message: str) -> bool:
        folded = normalize_es(message).strip()
        if not folded or len(folded.split()) > 4:
            return False
        return bool(
            re.fullmatch(
                r"(?:hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|que tal|hola que tal|buen dia)[!. ]*",
                folded,
            )
        )

    def _greeting_reply(self) -> str:
        return "¡Hola! ¿Qué tal? ¿En qué te puedo ayudar?"

    def _deterministic_reply(self, message: str) -> TurnResult:
        if self._is_greeting(message):
            reply = self._greeting_reply()
        else:
            match = retrieve(self._content.kb or (), message).match
            best = match.passage.answer if match is not None else None
            if best is None:
                reply = self._fallback_reply(message)
            else:
                closing = (
                    self._next_call_question()
                    if self._should_propose_call(message)
                    else self._next_follow_up()
                )
                reply = f"{best} {closing}"
        self._call_proposed_last_turn = self._proposes_call(reply)
        if self._call_proposed_last_turn:
            self._call_proposal_count += 1
        self._history.append(("assistant", reply))
        self._push("reply", "conversation", reply)
        return TurnResult(
            intent="conversation",
            action="none",
            reply=reply,
            suppressed=False,
            registered_doubts=(),
            registered_no_continuar=False,
            rule_violations=(),
        )

    def _catalogue_reply(self) -> str:
        self._metrics.catalogue_fallbacks += 1
        closing = (
            self._next_call_question()
            if self._should_propose_call("¿qué ofrecéis?")
            else self._next_follow_up()
        )
        return f"{_CATALOGUE_ANSWER} {closing}"

    def _is_price_question(self, message: str) -> bool:
        folded = normalize_es(message)
        return bool(
            re.search(
                r"\b(precio|precios|cuesta|cuestan|cuanto cuesta|cuanto vale|"
                r"coste|costar|costes|importe|importes|tarifa|tarifas|vale|valen|"
                r"caro|barato|carisimo|euros?|presupuesto|dinero)\b",
                folded,
            )
            or re.search(r"\bcuanto\b.*\b(cuesta|cuestan|vale|valen|cobra|cobran)\b", folded)
        )

    def _is_financing_question(self, message: str) -> bool:
        folded = normalize_es(message)
        if re.search(
            r"\b(beca|becas|descuento|descuentos|promocion|promociones|subvencion|"
            r"subvenciones|gratis|gratuita|gratuito)\b",
            folded,
        ):
            return False
        return bool(
            re.search(
                r"\b(financia\w*|cuota\w*|plazo\w*|mensualidad\w*|interes\w*|"
                r"aplaz\w*|finanaciar)\b",
                folded,
            )
            or re.search(r"\bpagar a plazos\b", folded)
            or re.search(r"\bpago a plazos\b", folded)
            or re.search(r"\b(como|se puede|puedo)\b.*\bpagar\b", folded)
            or re.search(r"\bformas? de pago\b", folded)
        )

    def _approved_call_reply(self, base: str) -> str:
        base = re.sub(r"\s+", " ", base).strip()
        if not base:
            return self._next_call_question()
        return f"{base} {self._next_call_question()}"

    def _record_llm_usage(self, result: LLMResult) -> None:
        """Accumulate operational LLM metrics; the lead never sees any of this."""
        self._metrics.llm_calls += 1
        self._metrics.llm_retries += max(0, result.attempts - 1)
        self._metrics.llm_latency_ms += result.latency_ms
        if result.usage is not None:
            self._metrics.llm_prompt_tokens += result.usage.prompt_tokens
            self._metrics.llm_completion_tokens += result.usage.completion_tokens
            self._metrics.llm_total_tokens += result.usage.total_tokens
        if result.cost_usd is not None:
            self._metrics.llm_cost_usd += result.cost_usd
            self._metrics.llm_cost_known = True
        logger.info(
            "llm_call",
            latency_ms=round(result.latency_ms, 1),
            attempts=result.attempts,
            prompt_tokens=result.usage.prompt_tokens if result.usage else 0,
            completion_tokens=result.usage.completion_tokens if result.usage else 0,
            cost_usd=result.cost_usd,
        )

    def _fallback_reply(self, message: str) -> str:
        if self._is_greeting(message):
            return self._greeting_reply()
        if self._is_catalogue_question(message):
            return self._catalogue_reply()
        if self._is_price_question(message) and self._content.price_reply:
            return self._approved_call_reply(self._content.price_reply)
        if self._is_financing_question(message) and self._content.financing_reply:
            return self._approved_call_reply(self._content.financing_reply)
        if self._looks_like_question(message):
            return self._register_doubt(message)
        return _GENERIC_BRIDGE

    def _is_catalogue_question(self, message: str) -> bool:
        folded = normalize_es(message)
        if any(entry[1].search(folded) for entry in FORBIDDEN_TOPIC_PATTERNS):
            return False
        return bool(
            re.search(
                r"\bque (ofreceis|ofrece|ofrecen|teneis|tienen|hay|cursos?|formacion(?:es)?|programas?)\b",
                folded,
            )
            or re.search(r"\bque es lo que (ofreceis|teneis|haceis)\b", folded)
            or re.search(
                r"\b(cuales son|cual es)\b.*\b(cursos?|formacion(?:es)?|programas?|oferta)\b",
                folded,
            )
            or re.search(
                r"\b(cursos?|formacion(?:es)?|programas?)\b.*\b(ofreceis|teneis|tienen|impartis|da|hay)\b",
                folded,
            )
            or re.search(
                r"\b(informacion|info|detalles?|dame|hablame|contadme|cuentame|"
                r"quiero saber|me interesa|me interesaria|mas sobre)\b.*"
                r"\b(cursos?|formacion(?:es)?|programas?|oferta)\b",
                folded,
            )
            or re.search(
                r"\b(cursos?|formacion(?:es)?|programas?)\b.*\b(informacion|info|detalles?)\b",
                folded,
            )
        )

    def _looks_like_question(self, message: str) -> bool:
        if "?" in message:
            return True
        folded = normalize_es(message)
        return bool(
            len(folded.split()) <= 12
            and re.search(
                r"\b(que|como|cuanto|cuanta|cuantos|cuantas|donde|cuando|cual|cuales|quien|quienes|sirve|vale|merece)\b",
                folded,
            )
        )

    def _safe_fallback(self, message: str, violations: tuple[str, ...]) -> TurnResult:
        reply = (
            self._catalogue_reply()
            if self._is_catalogue_question(message)
            else self._register_doubt(message)
        )
        self._call_proposed_last_turn = self._proposes_call(reply)
        if self._call_proposed_last_turn:
            self._call_proposal_count += 1
        self._history.append(("assistant", reply))
        self._push("reply", "conversation", reply)
        return TurnResult(
            intent="conversation",
            action="none",
            reply=reply,
            suppressed=False,
            registered_doubts=(),
            registered_no_continuar=False,
            rule_violations=violations,
        )

    def _register_doubt(self, message: str) -> str:
        if message not in self._doubt_messages:
            self._doubt_messages.append(message)
            self._metrics.doubts_registered += 1
        self._push("doubt", "conversation", f'registered: "{message}"')
        self._turns_since_call = 0
        return build_reply("doubt")

    def _clean_reply(self, raw: str) -> str:
        value = raw.strip()
        value = re.sub(r"^```[a-zA-Z]*\s*\n?", "", value)
        value = re.sub(r"\n?```$", "", value).strip()
        value = re.sub(
            r"^(respuesta|agente|asistente)\s*:\s*", "", value, flags=re.IGNORECASE
        ).strip()
        value = re.sub(r"\*\*(.+?)\*\*", r"\1", value)
        value = re.sub(r"__(.+?)__", r"\1", value)
        value = re.sub(r"`([^`]+)`", r"\1", value)
        value = re.sub(r"^#{1,6}\s+", "", value, flags=re.MULTILINE)
        value = re.sub(r"^[ \t]*[-*\u2022]\s+", "", value, flags=re.MULTILINE)
        value = re.sub(r"^[ \t]*\d+[.)]\s+", "", value, flags=re.MULTILINE)
        value = re.sub(r"\n{2,}", "\n", value)
        value = re.sub(r"\n+", " ", value)
        value = re.sub(r" {2,}", " ", value).strip()
        value = re.sub(r'^["\']|["\']$', "", value).strip()
        return value

    def _has_chained_questions(self, text: str) -> bool:
        return text.count("?") >= 2

    def _next_call_question(self) -> str:
        question = _CALL_QUESTIONS[self._call_question_index % len(_CALL_QUESTIONS)]
        self._call_question_index += 1
        self._turns_since_call = 0
        return question

    def _next_follow_up(self) -> str:
        question = _FOLLOW_UP_QUESTIONS[self._call_question_index % len(_FOLLOW_UP_QUESTIONS)]
        self._call_question_index += 1
        return question

    def _should_propose_call(self, message: str) -> bool:
        if self._is_greeting(message):
            return False
        if _CALL_INTENT.search(normalize_es(message)):
            return True
        return self._turns_since_call >= _CALL_CADENCE_TURNS

    def _collapse_to_question(self, text: str, question: str) -> str:
        idx = text.find("¿")
        if idx < 0:
            idx = text.find("?")
        answer = text[:idx] if idx >= 0 else text
        answer = re.sub(r"[,;:.\s]+$", "", answer).strip()
        return f"{answer}. {question}" if answer else question

    def _proposes_call(self, reply: str) -> bool:
        stripped = reply.rstrip()
        if not stripped.endswith("?"):
            return False
        # Consider only the closing question to avoid treating informational
        # mentions in earlier sentences (e.g. approved KB text) as a CTA.
        closing = stripped.rsplit("?", 1)[0]
        if "¿" in closing:
            closing_q = closing.rsplit("¿", 1)[-1]
        else:
            parts = re.split(r"[.!]\s+", closing)
            closing_q = parts[-1] if parts else closing
        folded_q = normalize_es(closing_q)
        call_re = (
            r"\b(?:llamad\w*|llam(?:amos|arte|arle|arlo|emos|en|e|o)\b|"
            r"telefon\w*|contact\w*|agend\w*|equipo\b|hablar con\b|paso con\b)"
        )
        if re.search(call_re, folded_q):
            return True
        # Some call CTAs add a short consent question after an explanatory
        # sentence ("... en una llamada. ¿Te gustaría?"). Treat as CTA unless the
        # closing question is one of our non-call follow-ups.
        if re.search(call_re, normalize_es(stripped)) and re.fullmatch(
            r"\s*(?:te gustaria|quieres|te parece(?: bien)?|te va bien|te viene bien)\s*",
            folded_q,
        ):
            return not any(normalize_es(stripped).endswith(normalize_es(q)) for q in _FOLLOW_UP_QUESTIONS)
        return False

    def _build_history_messages(self) -> tuple[LLMChatMessage, ...]:
        # Only the model sees the redacted copy; storage and retrieval keep the
        # original text. Redacting every message (not just the lead's) also
        # closes the path where an assistant reply echoed a phone or email and
        # would be sent back on the next turn.
        return tuple(
            LLMChatMessage(role="user" if role == "lead" else "assistant", content=redact(text))
            for role, text in self._history[-_HISTORY_WINDOW:]
        )

    # -------------------------------------------------------------------------
    # Prompt building
    # -------------------------------------------------------------------------

    def _build_system_prompt(self) -> str:
        faq = "\n".join(f"- {entry.answer}" for entry in self._content.faq)
        return "\n".join(
            [
                "Eres el asistente de WhatsApp de Escuela Musk, una escuela online de programación, videojuegos e inteligencia artificial. Escribes como una persona real: cercana, tranquila y clara, con tuteo natural en español de España. Escuchas antes de proponer nada.",
                "",
                "Tu objetivo es ayudar con calma a quien te escribe, responder a lo que necesita y, solo cuando muestre un interés claro en dar el siguiente paso, comentarle con naturalidad que alguien del equipo se lo puede explicar en una llamada. Nunca vendas, no insistas y no repitas la misma propuesta.",
                "",
                "CÓMO ESCRIBIR COMO UNA PERSONA (muy importante):",
                "0. Responde PRIMERO a lo que la persona acaba de decir o preguntar. Si te saluda, salúdala con naturalidad y pregúntale en qué le puedes ayudar. Si pide información general, cuéntaselo de forma sencilla con lo que sabes.",
                "1. Brevedad: una a tres frases cortas, en texto plano y en un solo párrafo. Nada de negritas (**), asteriscos, viñetas, listas numeradas ni encabezados. Nada de folletos ni listas largas salvo que pidan el catálogo.",
                "2. Termina con UNA sola pregunta (un solo signo de interrogación). Que sea una pregunta humana y concreta sobre lo que le puede interesar o ayudar ahora. No propongas hablar con el equipo ni una llamada por defecto.",
                "3. Solo menciona hablar con una persona del equipo o una llamada si la persona muestra interés claro en avanzar (precio, financiación, inscribirse, fechas de inicio, horarios o reservar plaza). Hazlo como una opción amable, una sola vez, sin presión. Si no hay ese interés, no lo menciones.",
                "4. Sigue el hilo: ten en cuenta lo que ya te ha contado y no repitas lo mismo. Adapta la respuesta a su mensaje, no uses un guion fijo.",
                "5. Tono empático y natural. Puedes reconocer su situación o duda con sencillez. Evita sonar robótico o comercial: nada de «buena pregunta», «excelente pregunta», «me alegra que preguntes», «estoy aquí para ayudarte» ni muletillas vacías.",
                "6. Si el mensaje es ambiguo, haz una sola pregunta sencilla para entender mejor qué necesita (acota entre opciones), en lugar de pedir «cuéntame más» sin concreción.",
                "7. Si algo no está en la información aprobada, no lo inventes: dilo con naturalidad y ofrece contar lo que sí sabes o que alguien del equipo se lo confirme si quiere dar ese paso.",
                "8. Si la pregunta no tiene que ver con la formación, respóndela en una frase SOLO con información aprobada si la hay y vuelve con amabilidad al tema; si no hay información aprobada, dilo con sencillez.",
                "9. No copies ni repitas frases de los pasajes si no encajan con lo que preguntó. Los pasajes son tu fuente, no un guion que haya que recitar.",
                "",
                "REGLAS DE SEGURIDAD (nunca las incumplas, bajo ninguna circunstancia):",
                "- NUNCA des precios, importes, cifras de dinero, cuotas, intereses ni condiciones de pago (tampoco porcentajes de interés o de financiación). Ante una pregunta de precio o pago: dile con naturalidad que ese detalle se lo explica mejor una persona del equipo, que SÍ hay opciones de financiación y que se puede completar en dos años con flexibilidad, y ofrécele la llamada solo como opción.",
                "- NUNCA prometas empleo, garantías, becas ni promociones que no estén en la información aprobada. Puedes decir con honestidad que no se garantiza un puesto de trabajo.",
                "- NUNCA envíes el temario detallado (módulo a módulo). Sí puedes hablar del contenido general, las habilidades y las salidas.",
                "- Si la persona pide parar, deja de insistir y despídete con respeto.",
                "",
                "INFORMACIÓN APROBADA DE LA ESCUELA (tu única fuente; no inventes nada fuera de ella):",
                f"Catálogo oficial (no hay otros programas): {_CATALOGUE}.",
                f"Descripción: {self._content.general_description}",
                f"Metodología: {self._content.methodology}",
                f"Sobre la escuela: {self._content.company_presentation}",
                f"Respuesta aprobada para preguntas de precio: {self._content.price_reply or ''}",
                f"Respuesta aprobada para preguntas de financiación: {self._content.financing_reply or ''}",
                "",
                "Preguntas frecuentes (respuestas aprobadas):",
                faq,
            ]
        )

    def _build_turn_prompt(self, ranked: list[RankedPassage]) -> str:
        passages = (
            "\n".join(f"- {entry.passage.answer}" for entry in ranked) if ranked else "(ninguno)"
        )
        return "\n".join(
            [
                self._system_prompt,
                "",
                "Pasajes de la base de conocimiento relevantes a lo que acaba de preguntar:",
                passages,
                "",
                "Ahora escribe TU respuesta: contesta a lo que ha dicho de forma natural y cercana, en texto plano y breve (una a tres frases), y termina con una sola pregunta sencilla sobre lo que le puede ayudar ahora. No ofrezcas hablar con el equipo ni una llamada salvo que haya un interés claro en avanzar (precio, financiación, inscribirse, fechas de inicio, horarios o reservar plaza); si lo hay, menciónalo como opción amable y sin insistir. Si falta información aprobada, dilo con naturalidad y ofrece lo que sí sabes. Si el mensaje es ambiguo, aclara con una sola pregunta concreta.",
            ]
        )

    # -------------------------------------------------------------------------
    # Handoff summary
    # -------------------------------------------------------------------------

    def _build_handoff(self, reason: HandoffReason, last_message: str) -> HandoffContext:
        handoff = HandoffContext(
            reason=reason,
            lead_id=self._lead.id,
            contact=self._lead.contact,
            bucket=self._lead.bucket,
            last_message=last_message,
            summary=self._build_handoff_summary(reason, last_message),
            formation=self._content.formation_name,
            doubts=tuple(self._doubt_messages),
        )
        if self._content.handoff_recipient and self._content.handoff_recipient.strip():
            handoff = replace(handoff, recipient=self._content.handoff_recipient.strip())
        if self._lead.loss_reason is not None:
            handoff = replace(handoff, loss_reason=self._lead.loss_reason)
        return handoff

    def _build_handoff_summary(self, reason: HandoffReason, last_message: str) -> str:
        reason_text = (
            "pidió hablar con una persona" if reason == "human_requested" else "aceptó la llamada"
        )
        parts = [f"{self._content.formation_name}: el lead {reason_text}."]
        bucket_label = "ilocalizables" if self._lead.bucket == "ilocalizable" else "no compradores"
        parts.append(f"Bolsa de origen: {bucket_label}.")
        if self._lead.loss_reason is not None and self._lead.loss_reason.strip():
            parts.append(f"Motivo por el que se perdió en la campaña: {self._lead.loss_reason}.")
        if not self._doubt_messages:
            parts.append("Dudas registradas: ninguna.")
        else:
            visible = self._doubt_messages[:5]
            remaining = len(self._doubt_messages) - len(visible)
            listed = "; ".join(f'"{doubt}"' for doubt in visible)
            if remaining > 0:
                parts.append(f"Dudas registradas: {listed}; … y {remaining} más.")
            else:
                parts.append(f"Dudas registradas: {listed}.")
        parts.append(f"Último mensaje del lead: {last_message}")
        return " ".join(parts)

    def _push(self, kind: RecordKind, intent: str | None, detail: str) -> None:
        self._conversation_records.append(
            ConversationRecord(
                kind=kind,
                intent=intent,
                detail=detail,
                timestamp=datetime.now(UTC).isoformat(),
            )
        )
