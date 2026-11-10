"""Tests for the deterministic retrieval over the approved knowledge base.

Ported from tests/retrieval.test.ts. The two cases that read the paraphrase
development/held-out datasets from src/eval.dataset.ts are deferred to the eval
port (Phase 7); everything else is covered here.
"""

import re

import pytest

from app.content import APPROVED_CONTENT
from app.kb import KB_PASSAGES, KbPassage
from app.retrieval import MIN_BM25_SCORE, MIN_TERM_COVERAGE, retrieve, retrieve_top_k
from app.rules import guard_reply
from app.text import normalize_es

DIGIT = re.compile(r"\d")

# Concepts that must never appear in a lead-facing knowledge-base answer.
FORBIDDEN_TOPICS: list[tuple[str, re.Pattern[str]]] = [
    (
        "price",
        re.compile(
            r"\b(precio|precios|cuesta|cuestan|coste|costos|euros?|tarifas?|importes?|caro|barato|dinero|gratis|gratuita)\b|€",
            re.IGNORECASE,
        ),
    ),
    (
        "financing",
        re.compile(
            r"\b(financia\w*|cuotas?|mensualidades?|becas?|subvenci\w*|descuentos?|promocion\w*|condiciones? de pago|forma de pago|intereses?|sin intereses)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "start-dates",
        re.compile(
            r"\b(fecha|convocatoria\w*|calendario|dedicaci\w*|duraci\w*|horas|meses|trimestres)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "refunds",
        re.compile(r"\b(devoluci\w*|reembols\w*|devuelve\w*|devuelvo)\b", re.IGNORECASE),
    ),
    (
        "entry-requirements",
        re.compile(
            r"\b(requisitos|requisitos tecnicos|portatil|ordenador|equipo necesario)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "physical-location",
        re.compile(r"\b(sede|oficina|direcci\w*|ubicaci\w*)\b", re.IGNORECASE),
    ),
    (
        "internship-conditions",
        re.compile(r"\b(remuneraci\w*|cuanto pagan|condiciones economicas)\b", re.IGNORECASE),
    ),
    (
        "employment-promise",
        re.compile(
            r"\b(garantiza\w*\s+(un\s+)?(empleo|trabajo|puesto|plaza)|empleo garantizado|trabajo garantizado)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "detailed-syllabus",
        re.compile(r"\b(modulo|modulos|unidad|unidades|tema\s+\d|leccion\s+\d)\b", re.IGNORECASE),
    ),
]


def _passage(passage_id: str) -> KbPassage:
    for entry in KB_PASSAGES:
        if entry.id == passage_id:
            return entry
    raise AssertionError(f"passage not found: {passage_id}")


# ---------------------------------------------------------------------------
# The passages themselves
# ---------------------------------------------------------------------------


def test_unique_id_and_provenance_per_passage() -> None:
    ids = [entry.id for entry in KB_PASSAGES]
    assert len(set(ids)) == len(ids)
    for entry in KB_PASSAGES:
        assert entry.title.strip()
        assert entry.answer.strip()
        assert len(entry.terms) > 0
        if entry.id == "kb-obj-no-tiempo":
            assert "Nicolás" in entry.source
            assert "correo de Miguel" in entry.source
        else:
            assert "escuela-musk-base-conocimiento.md" in entry.source


def test_seven_indexed_example_queries_per_passage() -> None:
    for entry in KB_PASSAGES:
        assert len(entry.example_queries) == 7, f"{entry.id} example query count"
        unique = {normalize_es(q) for q in entry.example_queries}
        assert len(unique) == 7, f"{entry.id} unique prompts"


def test_candidate_retrieval_uses_only_the_approved_answer() -> None:
    query = _passage("kb-metodo-practica").example_queries[0]
    outcome = retrieve(KB_PASSAGES, query, "candidate")
    assert outcome.match is not None
    assert outcome.match.passage.id == "kb-metodo-practica"
    assert outcome.match.passage.answer == _passage("kb-metodo-practica").answer


def test_every_answer_passes_the_output_guard() -> None:
    for entry in KB_PASSAGES:
        result = guard_reply(entry.answer)
        assert result.ok, f"{entry.id}: {[v.id for v in result.violations]}"


def test_no_answer_contains_a_digit() -> None:
    for entry in KB_PASSAGES:
        assert not DIGIT.search(entry.answer), f"{entry.id} contains a digit: {entry.answer}"


def test_no_answer_mentions_a_forbidden_topic() -> None:
    for entry in KB_PASSAGES:
        for topic_id, pattern in FORBIDDEN_TOPICS:
            assert not pattern.search(entry.answer), (
                f"{entry.id} mentions a forbidden topic ({topic_id}): {entry.answer}"
            )


def test_every_answer_is_short_enough_for_whatsapp() -> None:
    for entry in KB_PASSAGES:
        assert len(entry.answer) <= 260, f"{entry.id} is {len(entry.answer)} chars: {entry.answer}"


def test_every_answer_is_more_than_a_stub() -> None:
    for entry in KB_PASSAGES:
        assert len(entry.answer) >= 60, f"{entry.id} is {len(entry.answer)} chars: {entry.answer}"


def test_every_answer_ends_without_a_question_mark() -> None:
    for entry in KB_PASSAGES:
        assert not entry.answer.rstrip().endswith("?"), f"{entry.id} ends with '?': {entry.answer}"


def test_unified_profile_carries_the_whole_knowledge_base() -> None:
    assert APPROVED_CONTENT.kb == KB_PASSAGES


def test_faq_answers_obey_the_same_length_cap() -> None:
    for entry in APPROVED_CONTENT.faq:
        assert len(entry.answer) <= 260, f"{entry.id} is {len(entry.answer)} chars"


# ---------------------------------------------------------------------------
# The retrieval layer
# ---------------------------------------------------------------------------


def test_resolves_certification_to_the_arp_passage() -> None:
    outcome = retrieve(KB_PASSAGES, "¿me dan certificado de la UE?")
    assert outcome.match is not None
    assert outcome.match.passage.id == "kb-certificacion-arp"


def test_resolves_publishing_a_game_to_the_freelance_passage() -> None:
    outcome = retrieve(KB_PASSAGES, "quiero publicar un juego en Steam")
    assert outcome.match is not None
    assert outcome.match.passage.id == "kb-freelance"


def test_question_outside_the_kb_returns_no_match() -> None:
    outcome = retrieve(KB_PASSAGES, "quiero aprender cocina")
    assert outcome.match is None
    assert outcome.refusal == "below-threshold"


PROGRAMME_CONTENT_PASSAGES = [
    ("python", "kb-python-"),
    ("front end", "kb-frontend-"),
    ("back end", "kb-backend-"),
    ("full stack", "kb-fullstack-"),
    ("videojuegos", "kb-videojuegos-"),
]

CONTENT_QUESTION_TEMPLATES = [
    lambda p: f"¿de qué trata el de {p}?",
    lambda p: f"¿de qué trata {p}?",
    lambda p: f"háblame de {p}",
    lambda p: f"¿en qué consiste {p}?",
    lambda p: f"¿qué se aprende en {p}?",
    lambda p: f"¿qué me enseñáis en {p}?",
]

_ANY_CONTENT_QUESTIONS = [
    (slug, template(programme))
    for programme, slug in PROGRAMME_CONTENT_PASSAGES
    for template in CONTENT_QUESTION_TEMPLATES
]


@pytest.mark.parametrize(("slug", "question"), _ANY_CONTENT_QUESTIONS)
def test_answers_any_content_question_from_the_same_programme(slug: str, question: str) -> None:
    outcome = retrieve(KB_PASSAGES, question)
    assert outcome.refusal is None, f"{question} must not escalate"
    assert outcome.match is not None, f"{question} must be answered"
    assert outcome.match.passage.id.startswith(slug), (
        f"{question} answered with {outcome.match.passage.id}"
    )


STRONG_CONTENT_TEMPLATES = [
    lambda p: f"¿de qué trata el de {p}?",
    lambda p: f"¿de qué trata {p}?",
    lambda p: f"¿qué es el curso de {p}?",
    lambda p: f"¿de qué va el curso de {p}?",
]

_STRONG_CONTENT_QUESTIONS = [
    (slug, template(programme))
    for programme, slug in PROGRAMME_CONTENT_PASSAGES
    for template in STRONG_CONTENT_TEMPLATES
]


@pytest.mark.parametrize(("slug", "question"), _STRONG_CONTENT_QUESTIONS)
def test_resolves_content_question_to_the_content_passage(slug: str, question: str) -> None:
    outcome = retrieve(KB_PASSAGES, question)
    assert outcome.match is not None
    assert outcome.match.passage.id == f"{slug}contenido"


@pytest.mark.parametrize(
    "question",
    [
        "¿qué salidas tiene full stack?",
        "¿de qué puedo trabajar con python?",
        "¿en qué puedo trabajar si hago videojuegos?",
    ],
)
def test_routes_outcomes_questions_to_the_outcomes_passage(question: str) -> None:
    outcome = retrieve(KB_PASSAGES, question)
    assert outcome.match is not None
    assert outcome.match.passage.id.endswith("-salidas")


@pytest.mark.parametrize(
    "question",
    [
        "¿cuánto cuesta?",
        "¿me devolvéis el dinero si me arrepiento?",
        "¿hay becas o descuentos?",
        "¿tenéis una oficina física?",
        "¿hay calendario de convocatorias?",
        "¿cuánto dura el curso?",
        "¿cuántas horas lectivas son?",
        "¿cuándo empieza la próxima convocatoria?",
        "¿qué intereses y cuotas tiene el pago?",
        "¿qué condiciones de pago tengo para completar la formación?",
        "¿qué requisitos técnicos necesito?",
    ],
)
def test_a_forbidden_topic_never_clears_the_thresholds(question: str) -> None:
    outcome = retrieve(KB_PASSAGES, question)
    assert outcome.match is None, f"{question} must not be answered"
    assert outcome.refusal == "forbidden-topic"


def test_approved_completion_window_resolves_to_the_time_objection_passage() -> None:
    outcome = retrieve(KB_PASSAGES, "¿Cuánto tiempo tengo para completar la formación?")
    assert outcome.match is not None
    assert outcome.match.passage.id == "kb-obj-no-tiempo"
    assert outcome.refusal is None
    assert "dos años" in outcome.match.passage.answer
    assert not DIGIT.search(outcome.match.passage.answer)
    assert guard_reply(outcome.match.passage.answer).ok is True


def test_a_match_clears_both_thresholds_and_reports_them() -> None:
    outcome = retrieve(KB_PASSAGES, "¿me dan certificado de la UE?")
    assert outcome.thresholds.min_score == MIN_BM25_SCORE
    assert outcome.thresholds.min_coverage == MIN_TERM_COVERAGE
    assert outcome.match is not None
    assert outcome.match.score >= MIN_BM25_SCORE
    assert outcome.match.coverage >= MIN_TERM_COVERAGE


def test_is_deterministic() -> None:
    first = retrieve(KB_PASSAGES, "¿qué me recomendáis, Python o Full Stack?")
    second = retrieve(KB_PASSAGES, "¿qué me recomendáis, Python o Full Stack?")
    assert first.match is not None and second.match is not None
    assert first.match.passage.id == second.match.passage.id
    assert first.match.score == second.match.score


def test_knowledge_base_refuses_a_compensation_question() -> None:
    outcome = retrieve(KB_PASSAGES, "¿Cuánto cobran en las prácticas?")
    assert outcome.match is None
    assert outcome.refusal == "forbidden-topic"


# ---------------------------------------------------------------------------
# The RAG retrieval (retrieve_top_k)
# ---------------------------------------------------------------------------


def test_retrieve_top_k_returns_closest_ranked_for_a_known_question() -> None:
    ranked = retrieve_top_k(KB_PASSAGES, "¿qué se aprende en python?")
    assert len(ranked) > 0
    assert ranked[0].passage.id == "kb-python-contenido"


def test_retrieve_top_k_returns_nothing_for_no_content_words() -> None:
    assert retrieve_top_k(KB_PASSAGES, "hola") == []


def test_retrieve_top_k_respects_the_requested_k() -> None:
    ranked = retrieve_top_k(KB_PASSAGES, "¿qué formaciones tenéis?", 3)
    assert len(ranked) <= 3
