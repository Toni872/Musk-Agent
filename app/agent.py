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
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Literal

from app.content import APPROVED_CONTENT, ApprovedContent, is_pending_decision
from app.llm import LLMChatMessage, LLMProvider, LLMRequest, LLMResult
from app.observability import logger
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
# the lead did not actually ask a question (e.g. "sí, cuéntame más").
_GENERIC_BRIDGE = (
    "Te lo cuento con gusto. ¿Prefieres que siga contándote por aquí o que te lo "
    "explique una persona en una llamada para que te quede todo claro?"
)

# Miguel's directive (30/10/2026): after EVERY lead question the agent answers
# and then recommends a call. These phrasings rotate so the deterministic
# backstop does not repeat the same sentence verbatim turn after turn.
_CALL_QUESTIONS = (
    "¿Quieres que te lo explique una persona en una llamada?",
    "¿Te gustaría que te llamemos y te lo cuenten con calma en una llamada?",
    "¿Te va bien una llamada para que te lo expliquen todo?",
    "¿Te paso con el equipo para que te lo expliquen en una llamada?",
)
_CALL_QUESTION = _CALL_QUESTIONS[0]

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
        self._metrics = Metrics()

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

        # Miguel's directive: never chain questions.
        if self._has_chained_questions(raw):
            self._push(
                "grounding",
                "conversation",
                f'chained questions collapsed: "{_truncate(raw)}"',
            )
            raw = self._collapse_to_call_question(raw)

        # Miguel's directive: after EVERY lead question the reply recommends the
        # call; this is the deterministic backstop.
        if self._looks_like_question(message) and not self._proposes_call(raw):
            self._push(
                "grounding",
                "conversation",
                f'call invitation added after a question: "{_truncate(raw)}"',
            )
            raw = self._collapse_to_call_question(raw)

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

    def _deterministic_reply(self, message: str) -> TurnResult:
        match = retrieve(self._content.kb or (), message).match
        best = match.passage.answer if match is not None else None
        reply = f"{best} {self._next_call_question()}" if best else self._fallback_reply(message)
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
        return f"{_CATALOGUE_ANSWER} {self._next_call_question()}"

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
        if self._is_catalogue_question(message):
            return self._catalogue_reply()
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
        return question

    def _collapse_to_call_question(self, text: str) -> str:
        idx = text.find("¿")
        if idx < 0:
            idx = text.find("?")
        answer = text[:idx] if idx >= 0 else text
        answer = re.sub(r"[,;:.\s]+$", "", answer).strip()
        question = self._next_call_question()
        return f"{answer}. {question}" if answer else question

    def _proposes_call(self, reply: str) -> bool:
        if not reply.rstrip().endswith("?"):
            return False
        folded = normalize_es(reply)
        return bool(
            re.search(
                r"\b(?:llamad\w*|llam(?:amos|arte|arle|arlo|emos|en|e|o)\b|telefon\w*|contact\w*|agend\w*|equipo\b|hablar con\b|paso con\b)",
                folded,
            )
        )

    def _build_history_messages(self) -> tuple[LLMChatMessage, ...]:
        return tuple(
            LLMChatMessage(role="user" if role == "lead" else "assistant", content=text)
            for role, text in self._history[-_HISTORY_WINDOW:]
        )

    # -------------------------------------------------------------------------
    # Prompt building
    # -------------------------------------------------------------------------

    def _build_system_prompt(self) -> str:
        faq = "\n".join(f"- {entry.answer}" for entry in self._content.faq)
        return "\n".join(
            [
                "Eres el asistente de WhatsApp de Escuela Musk, una escuela online de programación, videojuegos e inteligencia artificial. Hablas en español de España, con tuteo, de forma cercana, cálida y profesional, como una persona que escucha de verdad.",
                "",
                "Tu objetivo es ayudar a la persona a decidir con calma y, sobre todo, llevarla a una llamada con el equipo: ahí es donde le explican el detalle (precio, financiación, calendario) que tú no puedes dar. Conversa y aclara sus dudas, pero en cada mensaje hazle entender que lo mejor para ella es hablar con una persona por teléfono. Nunca vendas ni presiones.",
                "",
                "CÓMO CONVERSAR (reglas de comportamiento, muy importantes):",
                "0. Responde PRIMERO a lo que la persona acaba de preguntar, de forma directa y en una o dos frases. Si pregunta qué formación o qué cursos ofrecemos, nómbralos todos en una sola frase con el catálogo de abajo; NO describas cada programa salvo que te pida uno concreto. La empatía va después, en una frase, no en lugar de la respuesta.",
                "1. Sigue el hilo. Usa lo que la persona ya te ha contado: su situación, su tiempo, sus miedos, lo que busca. No repitas preguntas ya respondidas. No saltes de tema sin enlazar con lo anterior.",
                "2. Empatiza, pero no en vez de responder. Valida lo que ha dicho con sus propias palabras y luego contesta a lo que preguntó.",
                "3. Mensajes cortos, como de WhatsApp, en texto plano. Máximo dos o tres frases en un solo párrafo. Nada de negritas (**), asteriscos, viñetas, listas numeradas ni encabezados. Nada de folletos.",
                "4. Después de CADA pregunta de la persona, responde primero con la información aprobada y enseguida recomiéndale una llamada para que le den más y mejor información. Termina SIEMPRE con UNA sola pregunta (un solo signo de interrogación, nunca dos) orientada a esa llamada: «¿te paso con el equipo?», «¿agendamos una llamada?», «¿te va bien que te contacten?». No encadenes dos preguntas y no repitas la misma formulación.",
                "5. Lleva la conversación hacia la llamada en cada respuesta. Si la pregunta es trivial o no tiene que ver con el curso (la dirección, el horario de oficina, las redes), contéstala en una frase SOLO con información aprobada y reconduce al origen: recuérdale el curso que le interesa y ofrécele la llamada para contarle un poco más. Si ese dato no está aprobado, dilo con naturalidad y ofrece confirmarlo por teléfono; nunca inventes una dirección ni datos de contacto.",
                "6. No mientas. Si algo no está en la información aprobada que tienes abajo, no lo inventes: dilo con naturalidad y ofrece confirmarlo con el equipo.",
                "7. No copies ni repitas frases de los pasajes si no responden a lo que preguntó. Los pasajes son tu fuente, no un guion que haya que recitar.",
                "",
                "REGLAS DE SEGURIDAD (nunca las incumplas, bajo ninguna circunstancia):",
                "- NUNCA des precios, importes, cifras de dinero, porcentajes, cuotas, intereses ni condiciones de pago. Ante una pregunta de precio o pago: dile que prefieres que se lo explique una persona, que SÍ hay opciones de financiación y dos años flexibles para completarla, y propón la llamada.",
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
                "Ahora escribe TU respuesta: contesta primero a lo que preguntó, en texto plano y breve (dos o tres frases), y termina con una sola pregunta orientada a agendar una llamada con el equipo. Hazlo con cualquier pregunta, también con las triviales: contéstala en una frase y reconduce al curso que le interesa y a la llamada.",
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
