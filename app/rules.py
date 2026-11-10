"""Safety surface of the MUSK conversational agent.

Encoded as data plus the output guard. This module keeps ONLY what the
LLM-driven engine needs: the non-negotiable input triggers (stop, human
request, call acceptance, phone handover) and the output guard (no prices,
amounts, financing conditions, syllabus detail, promotions or job promises).

Source of truth: repository AGENTS.md (rules 1-11, confirmed by Nicolas).
Reply templates are lead-facing strings: Spanish (es-ES), tuteo.
Trigger patterns are tested against folded text (lowercase, accents stripped),
so they must be written without accented characters.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from re import Pattern

from app.text import normalize_es

# ---------------------------------------------------------------------------
# The eleven hard rules, as data (rules 1-11 from AGENTS.md)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RuleDefinition:
    id: int
    label: str
    summary: str


RULES: tuple[RuleDefinition, ...] = (
    RuleDefinition(
        1,
        "no-prices",
        "Never communicate prices or amounts; reply with the approved response and invite to the call.",
    ),
    RuleDefinition(
        2,
        "no-detailed-syllabus",
        "Never communicate a detailed syllabus; general content, skills and outcomes are allowed.",
    ),
    RuleDefinition(
        3,
        "financing-generic",
        "May state that financing options exist and the formation can be completed flexibly over two years; never give prices, amounts, interest, instalment terms or other unapproved payment conditions.",
    ),
    RuleDefinition(
        4,
        "approved-content-only",
        "Reply only with MUSK-approved information; never invent conditions, promotions, guarantees or job promises.",
    ),
    RuleDefinition(
        5, "register-doubt", "No approved answer: register the doubt and propose human contact."
    ),
    RuleDefinition(
        6,
        "no-unapproved-offer",
        "No offer for no-compradores without a message previously approved by Nicolas; asking about price never authorizes amounts.",
    ),
    RuleDefinition(
        7,
        "respect-stop",
        'If the lead asks to stop, stop the follow-up and register "no continuar".',
    ),
    RuleDefinition(
        8,
        "no-artificial-pressure",
        "No artificial pressure; never promise attention beyond what MUSK can actually serve.",
    ),
    RuleDefinition(
        9,
        "confirmed-handoff-triggers",
        "Confirmed handoff triggers: the lead asks for a person, or accepts/agrees to a call; other escalations are proposals.",
    ),
    RuleDefinition(
        10,
        "guides-are-not-sendable",
        "A guide used as a knowledge source does not authorize sending it whole; exclude any syllabus section.",
    ),
    RuleDefinition(
        11,
        "no-autonomous-learning",
        "No autonomous learning of business policies; new answers are reviewed before entering approved content.",
    ),
)


def _rx(pattern: str) -> Pattern[str]:
    return re.compile(pattern)


# ---------------------------------------------------------------------------
# Input triggers (rule 7 stop handling, rule 9 handoff triggers)
# ---------------------------------------------------------------------------

# Rule 7: lead asks to stop -> stop follow-up and register "no continuar".
STOP_TRIGGER = _rx(
    r"\b(?:no me escrib(?:as|ais|is)(?: mas)?|no me (?:mand(?:es|ais|eis)|envi(?:es|eis|ais)) mas|no me llam(?:es|eis|ais)(?: mas)?|no me volv(?:as|ais|is) a (?:escribir|contactar|molestar)|no vuelvas a (?:escribir|contactar)me|(?:deja|para) de escribir(?:me|te|le|nos)?|deja de contactarme|no me contact(?:es|eis|ais)(?: mas)?|no quiero seguir|no deseo seguir|no quiero que me (?:escrib(?:as|ais|is)|contact(?:es|eis|ais)|llam(?:es|eis|ais|en)|molest(?:es|eis|ais))|no quiero(?: recibir)? mas mensajes|no me interesa seguir|no continuar|baja de la lista|para el seguimiento|(?:quita|borra|elimina)me de (?:la|tu) lista|(?:quiero )?darme de baja|date de baja|no me molest(?:es|eis|ais) mas|dejame en paz)\b"
)

HANDOFF_TRIGGERS: dict[str, Pattern[str]] = {
    # Rule 9 (confirmed): the lead explicitly asks to talk to a person.
    "humanRequested": _rx(
        r"\b(hablar|contactar|hablas|escribir|decir) con (una |un )?(persona|humano|gente|alguien)\b|\bpersona (real|de verdad)\b|\bhumano de verdad\b|\batencion al cliente\b|\bun asesor\b|\bun comercial\b|\bme atienda (una |un )?(persona|humano)\b"
    ),
    # Rule 9 (confirmed): the lead accepts or agrees to a call.
    "callAccepted": _rx(
        r"\b(acepto|aceptamos|de acuerdo|perfecto|genial|vale)\b[^.?!]{0,60}\bllamad|\b(si|sí)[,.]? ?(me )?(va|viene) bien\b|\bme (va|viene) bien\b|\bcuando (querais|puedais|puedas|os venga bien|te venga bien)\b|\bque me llam(?:e|es|en|eis|ais)\b|\b(?:podeis|puedes|podriais|podrias|puede) llamar(?:me|nos)?\b|\bacuerd\w* (la|una) llamada\b|\bpara (la|una) llamada\b|\bllamad?me\b"
    ),
}

# Answer triggers: how a lead answers a yes/no question about the call.
ANSWER_TRIGGERS: dict[str, Pattern[str]] = {
    "affirmative": _rx(
        r"\b(?:si|sip|claro|vale|ok|okey|perfecto|genial|de acuerdo|por supuesto|desde luego|afirmativo|cuenta con ello)\b$"
    ),
    "negative": _rx(
        r"\b(?:no|nop|paso|nada|mejor no|ahora no|prefiero que no|prefiero no|de momento no|por ahora no|no gracias)\b$"
    ),
    # An explicit moment answers the call proposal with WHEN (an acceptance).
    "availability": _rx(
        r"\b(?:hoy por las? (?:manana|tarde|noche)|manana por las? (?:manana|tarde)|esta (?:manana|tarde|noche)|por las? (?:manana|tarde|noche)s?|por la semana que viene|esta semana|la semana que viene|la proxima semana|pasado manana|manana|mediodia|primera hora|(?:despues|antes) de (?:comer|cenar)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|sobre las (?:\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|a las (?:\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|cuando (?:querais|puedais|puedas|te venga bien|os venga bien))\b"
    ),
}

# Negation guards: a NEGATED acceptance is a refusal, never a confirmed
# handoff (rule 9). No lookbehind on purpose.
NEGATED_ACCEPTANCE = _rx(r"(?:^|\s)(?:no|nunca|tampoco|jamas|nada)(?:\s+\w+){0,2}\s+$")
TRAILING_NEGATOR = _rx(r"(?:^|\s)(?:no|nunca|tampoco|jamas|nada)$")


def acceptance_confirmed(folded: str) -> bool:
    """True when the folded text accepts a call and is not negated."""
    match = HANDOFF_TRIGGERS["callAccepted"].search(folded)
    if match is None:
        return False
    if NEGATED_ACCEPTANCE.search(folded[: match.start()]):
        return False
    return not TRAILING_NEGATOR.search(folded[match.end() :])


# A goodbye must never arrange a call (rule 9).
FAREWELL_FRAMES = _rx(
    r"\b(?:hasta manana|hasta el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|hasta luego|hasta pronto|nos vemos|ya te digo|ya te cuento|adios|chao)\b"
)


def moment_confirmed(folded: str) -> bool:
    """True when the folded text names a moment for the call, not a farewell."""
    if FAREWELL_FRAMES.search(folded):
        return False
    match = ANSWER_TRIGGERS["availability"].search(folded)
    if match is None:
        return False
    if NEGATED_ACCEPTANCE.search(folded[: match.start()]):
        return False
    return not TRAILING_NEGATOR.search(folded[match.end() :])


# Words that show the lead is HANDING OVER a contact (rule 9).
PHONE_CUE = _rx(r"\b(?:mi numero|mi telefono|mi movil|llamame|llamadme|puedes? llamar)\b")

_PHONE_CANDIDATE = _rx(r"(?:^|\D)([679](?:[ .-]?\d){8})(?!\d)")
_WHOLE_PHONE = _rx(r"^(?:\+34|0034)?[679]\d{8}$")
_SEPARATORS = _rx(r"[ .-]")


def extract_spanish_phone(message: str) -> str | None:
    """Extract a Spanish mobile number when the lead hands it over, else None."""
    folded = normalize_es(message)
    candidate = _PHONE_CANDIDATE.search(folded)
    if candidate is not None and PHONE_CUE.search(folded):
        return _SEPARATORS.sub("", candidate.group(1))
    whole = _SEPARATORS.sub("", folded)
    if _WHOLE_PHONE.fullmatch(whole):
        return re.sub(r"^(?:\+34|0034)", "", whole)
    return None


# ---------------------------------------------------------------------------
# Output guard (rules 1-4, 6): validates any reply before it reaches the lead
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GuardViolation:
    id: str
    rule: int


@dataclass(frozen=True)
class GuardResult:
    ok: bool
    violations: tuple[GuardViolation, ...]


@dataclass(frozen=True)
class _ForbiddenPattern:
    id: str
    pattern: Pattern[str]
    rule: int


FORBIDDEN_OUTPUT_PATTERNS: tuple[_ForbiddenPattern, ...] = (
    _ForbiddenPattern("currency-symbol", _rx(r"€"), 1),
    _ForbiddenPattern("currency-word", _rx(r"\beuros?\b"), 1),
    _ForbiddenPattern("amount-with-currency", _rx(r"\b\d+(?:[.,]\d+)?\s*(?:€|eur)\b"), 1),
    _ForbiddenPattern("percentage-condition", _rx(r"\b\d+(?:[.,]\d+)?\s*%"), 3),
    _ForbiddenPattern(
        "financing-condition",
        _rx(r"\b(sin intereses|interes cero|cuotas fijas|aplazado sin coste)\b"),
        3,
    ),
    _ForbiddenPattern(
        "detailed-syllabus-item", _rx(r"\b(?:modulo|unidad|tema|semana|leccion)\s+\d+\b"), 2
    ),
    _ForbiddenPattern(
        "unapproved-promotion",
        _rx(r"\b(promocion\w*|descuento\w*|2x1|oferta especial|precio cerrado)\b"),
        4,
    ),
    # Nothing is guaranteed to a lead: not a job, not an internship, not a result.
    _ForbiddenPattern("employment-promise", _rx(r"\bgarantiz\w*\b"), 4),
)


def _fold_for_guard(reply: str) -> str:
    decomposed = unicodedata.normalize("NFD", reply)
    without_diacritics = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return without_diacritics.lower()


# A denial is not a promise: "no garantizamos un puesto" is honest and must
# reach the lead, while "te garantizamos trabajo" must never ship. A bare
# `garantiz\w*` pattern cannot tell them apart, and a lookbehind is avoided, so
# the negation is checked in code over the words right before the match.
GUARANTEE_NEGATION = _rx(
    r"(?:\bno|\bsin|\bnunca|\bni|\btampoco|\bningun[oa]?)\s+(?:te\s+|os\s+|se\s+te\s+|se\s+os\s+|un\s+|una\s+|el\s+|la\s+)?$"
)

_GUARANTEE_PATTERN = _rx(r"garantiz\w*")


def _has_affirmative_guarantee(folded: str) -> bool:
    for match in _GUARANTEE_PATTERN.finditer(folded):
        before = folded[max(0, match.start() - 30) : match.start()]
        if not GUARANTEE_NEGATION.search(before):
            return True
    return False


def guard_reply(reply: str) -> GuardResult:
    """Validate a reply before it reaches the lead; returns violations."""
    folded = _fold_for_guard(reply)
    violations: list[GuardViolation] = []
    for entry in FORBIDDEN_OUTPUT_PATTERNS:
        if entry.id == "employment-promise":
            if _has_affirmative_guarantee(folded):
                violations.append(GuardViolation(entry.id, entry.rule))
            continue
        if entry.pattern.search(folded):
            violations.append(GuardViolation(entry.id, entry.rule))
    return GuardResult(ok=len(violations) == 0, violations=tuple(violations))


# ---------------------------------------------------------------------------
# Approved reply templates (lead-facing, Spanish es-ES, tuteo). Kept minimal:
# only the deterministic closings the engine sends outside the LLM.
# ---------------------------------------------------------------------------

REPLY_TEMPLATES: dict[str, str] = {
    # Rule 7: stop acknowledgement, registered as "no continuar".
    "stop": 'Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar".',
    # Rule 9 (confirmed trigger: lead asks for a person).
    "humanRequest": "Claro, prefieres hablar con una persona. Dejo anotado y te pongo con el equipo. ¿Me confirmas tu teléfono o el mejor momento para que te contacten?",
    # Rule 9 (confirmed trigger: lead accepts/agrees to a call).
    "callAccepted": "Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle.",
    # Safety fallback when the model produced nothing usable: register the doubt
    # and propose a human (rule 5), never invent an answer.
    "doubt": "Lo dejo anotado para que una persona del equipo te lo confirme. ¿Te viene bien que te contacten para aclararlo?",
}


def build_reply(reply_id: str) -> str:
    return REPLY_TEMPLATES[reply_id]
