"""Deterministic retrieval over the approved knowledge base (app.kb).

This layer is the answerable-content gate: it decides whether a lead question
can be answered from the knowledge base, and with WHAT passage. It is pure,
offline and reproducible: no network, no embeddings, no vector database, no
LLM, no third-party dependencies.

Two independent gates, in this order:

1. FORBIDDEN_TOPIC_PATTERNS — topics that must ALWAYS escalate to a human
   (price, financing, hours, start dates, refunds, scholarships, physical
   location, entry requirements and internship conditions). The only narrow
   duration exception is a question explicitly about time to complete the
   formation, approved by Nicolás as two years with flexibility.

2. The score thresholds — a passage is a match only when it clears BOTH the
   BM25 score AND the term coverage. Below them the behaviour is exactly
   today's behaviour: rule 5 (register the doubt, propose a human).

The thresholds live HERE, in code, as named constants (never in a prompt), so
they can be audited, reviewed and re-calibrated.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from re import Pattern
from typing import Literal

from app.kb import KbPassage
from app.text import normalize_es

# ---------------------------------------------------------------------------
# Tunables (auditable, named, never in a prompt)
# ---------------------------------------------------------------------------

BM25_K1 = 1.5
BM25_B = 0.75

# Minimum BM25 score a passage must reach to be an answer. Calibrated on
# 2026-10-20 against the labelled knowledge-base dataset (src/eval.dataset.ts,
# groups F and G). The threshold is set at 3.5: the answerable group stays
# clearly above (minimum 4.54) and out-of-scope questions clearly below.
MIN_BM25_SCORE = 3.5

# Minimum fraction of the query's content terms that must appear in the
# passage. Same calibration: answerable 0.60-1.00, escalate 0.00-0.75.
MIN_TERM_COVERAGE = 0.5

RetrievalMode = Literal["baseline", "candidate"]

# The candidate remains benchmark-only until it passes the development and
# held-out acceptance gates. Change this only after the final hold-out report.
PRODUCTION_RETRIEVAL_MODE: RetrievalMode = "baseline"

# Spanish stopwords: closed class words that carry no topical signal. Explicit
# and named on purpose — an implicit stopword list would make the scoring
# unreproducible. The word list mirrors the TS set verbatim; literal duplicates
# there collapse here (a set dedupes), so the resulting set is identical.
STOPWORDS: frozenset[str] = frozenset(
    {
        "a",
        "al",
        "algo",
        "algun",
        "alguna",
        "algunas",
        "alguno",
        "algunos",
        "alla",
        "allí",
        "ante",
        "antes",
        "aqui",
        "asi",
        "aun",
        "aunque",
        "bajo",
        "bien",
        "cada",
        "casi",
        "como",
        "con",
        "contra",
        "cual",
        "cuales",
        "cualquier",
        "cuando",
        "cuanto",
        "cuanta",
        "cuantos",
        "cuantas",
        "de",
        "del",
        "demas",
        "dentro",
        "desde",
        "despues",
        "dice",
        "dicho",
        "donde",
        "dos",
        "el",
        "ella",
        "ellas",
        "ello",
        "ellos",
        "en",
        "entonces",
        "entre",
        "era",
        "eran",
        "eres",
        "es",
        "esa",
        "esas",
        "ese",
        "eso",
        "esos",
        "esta",
        "estaba",
        "estan",
        "estar",
        "estas",
        "este",
        "esto",
        "estos",
        "estoy",
        "fue",
        "fueron",
        "ha",
        "habia",
        "han",
        "hasta",
        "hay",
        "haya",
        "he",
        "haces",
        "hacia",
        "igual",
        "incluso",
        "la",
        "las",
        "le",
        "les",
        "lo",
        "los",
        "mas",
        "me",
        "mediante",
        "menos",
        "mi",
        "mis",
        "mientras",
        "mucho",
        "muy",
        "nada",
        "ni",
        "no",
        "nos",
        "nuestra",
        "nuestro",
        "o",
        "os",
        "otra",
        "otras",
        "otro",
        "otros",
        "para",
        "pero",
        "poco",
        "por",
        "porque",
        "puede",
        "pueden",
        "puedes",
        "puedo",
        "que",
        "quien",
        "quienes",
        "se",
        "segun",
        "ser",
        "si",
        "sido",
        "sin",
        "sobre",
        "solo",
        "soy",
        "su",
        "sus",
        "tal",
        "tampoco",
        "tengo",
        "tienes",
        "tiene",
        "todo",
        "todos",
        "tras",
        "tu",
        "tus",
        "un",
        "una",
        "uno",
        "unos",
        "unas",
        "usted",
        "va",
        "vamos",
        "van",
        "ver",
        "vez",
        "y",
        "ya",
        "yo",
        # Verb and courtesy forms that show up in every lead question and carry
        # no topical signal of their own.
        "anda",
        "dame",
        "dime",
        "diras",
        "diria",
        "dar",
        "daria",
        "dan",
        "digo",
        "dijiste",
        "hace",
        "haci",
        "hacen",
        "pasa",
        "pasas",
        "pues",
        "quedo",
        "quiere",
        "quieren",
        "quieres",
        "quiero",
        "sabe",
        "saben",
        "saber",
        "sepas",
        "sigo",
        "somos",
        "suelen",
        "tenga",
        "tienen",
        "vengo",
        "cuéntame",
        "contame",
        "cuentame",
        "porfa",
        "favor",
        "gracias",
        "vale",
        "ok",
        "okey",
        "claro",
        "perfecto",
        "hola",
        "buenas",
        "buenos",
        "oye",
        "adios",
        "chao",
        "luego",
        "ahora",
        "siempre",
        "nunca",
        "tambien",
        "mismo",
        "misma",
        "aquellos",
        "aquel",
        "aquella",
        "alli",
        "ahi",
        "tales",
        "dicha",
    }
)

# Topics that must ALWAYS escalate to a human, whatever the score. The patterns
# are tested against the FOLDED text (lowercase, accents stripped), so they are
# written without accented characters.
FORBIDDEN_TOPIC_PATTERNS: tuple[tuple[str, Pattern[str]], ...] = (
    (
        "price",
        re.compile(
            r"\b(cuesta|cuestan|coste|costos|precio|precios|importe|importes|euros?|tarifas?|valor de|pagar|pago|caro|barato|carisimo|gratis|gratuita|gratuito|presupuesto|mas barato|dinero)\b"
        ),
    ),
    (
        "compensation",
        re.compile(
            r"\b(cobr\w*|pagan|pagas|pagar|pago|remunera\w*|retribu\w*|sueldo|nominas?|salario\w*)\b"
        ),
    ),
    (
        "financing",
        re.compile(
            r"\b(financia\w*|finanaciar(?:se)?|cuotas?|mensualidades?|a plazos|pago a plazos|pago|pagar|condiciones? de pago|forma de pago|intereses?|aplaz\w*|becas?|subvencion\w*|descuentos?|promocion\w*|sin intereses|interes cero|plan de pago)\b"
        ),
    ),
    (
        "course-duration",
        re.compile(
            r"\b(cuanto dura|cuanto duran|cuanto tiempo|duracion|cuantos meses|cuantas semanas|meses|semanas)\b"
        ),
    ),
    ("course-hours", re.compile(r"\b(?:cuantas horas|cuantos horas|horas lectivas|horas)\b")),
    (
        "start-dates-and-schedule",
        re.compile(
            r"\b(cuando empieza|cuando comienza|cuando hay|fecha de inicio|fecha de comienzo|convocatorias?|calendario|dedicacion|empezar el|empieza el|empieza la|empezar la|arranque)\b"
        ),
    ),
    (
        "refunds",
        re.compile(
            r"\b(devolucion|devolver|devuelvo|devuelven|devuelves|reembolso|me devuelven)\b"
        ),
    ),
    (
        "physical-location",
        re.compile(
            r"\b(sede|oficina|direccion|ubicacion|local fisico|donde esta la academia|donde queda la academia|donde se encuentra)\b"
        ),
    ),
    (
        "detailed-syllabus",
        re.compile(
            r"\b(temario|temarios|modulos|unidades|plan de estudios|programa de estudios|syllabus|que se estudia|que se da|contenido detallado|programa detallado)\b"
        ),
    ),
    (
        "entry-requirements",
        re.compile(
            r"\b(requisitos de acceso|requisitos tecnicos|que equipo necesito|que ordenador|que necesito para entrar|equipo necesario|portatil)\b"
        ),
    ),
    (
        "internship-conditions",
        re.compile(
            r"\b(cuanto duran las practicas|cuanto pagan|cuanto cobra|remuneracion|remunerado|cuanto me pagan|donde hago las practicas|empresa donde hago|condiciones del convenio|condiciones de las practicas|condiciones del acuerdo)\b"
        ),
    ),
)


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------


def _stem(token: str) -> str:
    value = token
    if len(value) > 4 and value.endswith(("ces", "ses", "xes", "zes")):
        value = value[:-2]
    if len(value) > 3 and value.endswith("s"):
        value = value[:-1]
    return value


def _same_term(a: str, b: str) -> bool:
    if a == b:
        return True
    shortest = min(len(a), len(b))
    if shortest < 6:
        return False
    if abs(len(a) - len(b)) > 3:
        return False
    common = 0
    while common < shortest and a[common] == b[common]:
        common += 1
    return common >= 6


_NON_ALNUM = re.compile(r"[\W_]+", re.UNICODE)


def content_tokens(text: str) -> list[str]:
    """Folded, accent-free, stopword-filtered, stemmed tokens of a text."""
    folded = _NON_ALNUM.sub(" ", normalize_es(text)).strip()
    tokens: list[str] = []
    for raw in folded.split():
        token = _stem(raw)
        if len(token) == 0:
            continue
        if token in STOPWORDS:
            continue
        tokens.append(token)
    return tokens


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RetrievalResult:
    passage: KbPassage
    score: float  # bm25
    coverage: float  # 0..1
    matched_terms: tuple[str, ...]


@dataclass(frozen=True)
class RankedPassage:
    passage: KbPassage
    score: float
    coverage: float


@dataclass(frozen=True)
class RetrievalThresholds:
    min_score: float
    min_coverage: float


@dataclass(frozen=True)
class RetrievalOutcome:
    match: RetrievalResult | None  # None when nothing clears the thresholds
    best: RetrievalResult | None  # closest passage even when it does NOT clear
    thresholds: RetrievalThresholds
    # Why the retrieval refused to answer: null when a passage cleared, else
    # 'forbidden-topic' or 'below-threshold'.
    refusal: Literal["forbidden-topic", "below-threshold"] | None


@dataclass(frozen=True)
class _ScoredPassage:
    passage: KbPassage
    tokens: tuple[str, ...]
    length: int


def _prepare(passages: tuple[KbPassage, ...], mode: RetrievalMode) -> list[_ScoredPassage]:
    scored: list[_ScoredPassage] = []
    for passage in passages:
        if mode == "candidate":
            retrieval_text = (
                f"{passage.title} {passage.answer} {' '.join(passage.terms)} "
                f"{' '.join(passage.example_queries)}"
            )
        else:
            retrieval_text = f"{passage.title} {passage.answer} {' '.join(passage.terms)}"
        tokens = content_tokens(retrieval_text)
        scored.append(_ScoredPassage(passage, tuple(tokens), len(tokens)))
    return scored


def _bm25(
    documents: list[_ScoredPassage],
    query_terms: list[str],
) -> tuple[list[float], list[list[str]], list[float]]:
    total = len(documents)
    scores = [0.0] * total
    matched: list[list[str]] = [[] for _ in documents]
    coverage = [0.0] * total
    if total == 0 or len(query_terms) == 0:
        return scores, matched, coverage

    average_length = sum(document.length for document in documents) / total or 1

    for term in query_terms:
        document_frequency = 0
        for document in documents:
            if any(_same_term(token, term) for token in document.tokens):
                document_frequency += 1
        if document_frequency == 0:
            continue
        idf = math.log(1 + (total - document_frequency + 0.5) / (document_frequency + 0.5))

        for index, document in enumerate(documents):
            frequency = sum(1 for token in document.tokens if _same_term(token, term))
            if frequency == 0:
                continue
            normalizer = BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / average_length)
            scores[index] += idf * ((frequency * (BM25_K1 + 1)) / (frequency + normalizer))
            matched[index].append(term)

    for index in range(total):
        coverage[index] = len(matched[index]) / len(query_terms)

    return scores, matched, coverage


def retrieve_top_k(
    passages: tuple[KbPassage, ...],
    query: str,
    k: int = 4,
    mode: RetrievalMode = PRODUCTION_RETRIEVAL_MODE,
) -> list[RankedPassage]:
    """Ranked retrieval for the RAG layer: top-k by BM25, no gate."""
    documents = _prepare(passages, mode)
    query_terms = list(dict.fromkeys(content_tokens(query)))
    if len(documents) == 0 or len(query_terms) == 0:
        return []
    scores, _matched, coverage = _bm25(documents, query_terms)
    ranked = [
        RankedPassage(documents[i].passage, scores[i], coverage[i]) for i in range(len(documents))
    ]
    ranked = [entry for entry in ranked if entry.score > 0]
    ranked.sort(key=lambda entry: (-entry.score, -entry.coverage))
    return ranked[:k]


def retrieve(
    passages: tuple[KbPassage, ...],
    query: str,
    mode: RetrievalMode = PRODUCTION_RETRIEVAL_MODE,
) -> RetrievalOutcome:
    """The retrieval. Pure and deterministic."""
    thresholds = RetrievalThresholds(MIN_BM25_SCORE, MIN_TERM_COVERAGE)
    documents = _prepare(passages, mode)
    query_terms = list(dict.fromkeys(content_tokens(query)))

    # Gate 1: the topics that must always escalate. Checked on the folded text
    # (not on the stemmed tokens) so it does not depend on the stopword list.
    folded = normalize_es(query)
    asks_approved_completion_window = bool(
        re.search(r"\b(completar|terminar|finalizar|acabar)\b", folded)
        and re.search(
            r"\b(cuanto|cuantos|cuantas|tiempo|plazo|duracion|ano|anos|meses|semanas)\b", folded
        )
    )
    forbidden: tuple[str, Pattern[str]] | None = None
    for entry in FORBIDDEN_TOPIC_PATTERNS:
        if entry[1].search(folded) and not (
            entry[0] == "course-duration" and asks_approved_completion_window
        ):
            forbidden = entry
            break

    if len(documents) == 0 or len(query_terms) == 0:
        return RetrievalOutcome(
            match=None,
            best=None,
            thresholds=thresholds,
            refusal="forbidden-topic" if forbidden is not None else "below-threshold",
        )

    scores, matched, coverage = _bm25(documents, query_terms)

    best_index = -1
    best_score = -1.0
    for index in range(len(documents)):
        score = scores[index]
        passage_coverage = coverage[index]
        best_coverage = coverage[best_index] if best_index >= 0 else -1.0
        better = score > best_score or (score == best_score and passage_coverage > best_coverage)
        if better:
            best_score = score
            best_index = index

    def build(index: int) -> RetrievalResult | None:
        if index < 0 or index >= len(documents):
            return None
        document = documents[index]
        return RetrievalResult(
            passage=document.passage,
            score=scores[index],
            coverage=coverage[index],
            matched_terms=tuple(matched[index]),
        )

    if forbidden is not None:
        return RetrievalOutcome(
            match=None,
            best=build(best_index) if best_index >= 0 else None,
            thresholds=thresholds,
            refusal="forbidden-topic",
        )

    best = build(best_index) if best_index >= 0 else None
    clears = (
        best is not None
        and best.score >= thresholds.min_score
        and best.coverage >= thresholds.min_coverage
    )
    return RetrievalOutcome(
        match=best if clears else None,
        best=best,
        thresholds=thresholds,
        refusal=None if clears else "below-threshold",
    )
