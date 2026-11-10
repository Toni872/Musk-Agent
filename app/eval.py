"""Retrieval evaluation harness for the MUSK RAG layer.

Faithful Python port of ``src/eval.ts``.

A measurement instrument, not a retriever: no embeddings, no vector database, no
LLM call. It replays the labelled knowledge-base dataset against the
deterministic retrieval (``app.retrieval``) and scores recall and false
positives. What matters here is whether the RAG retrieves the right passage and
stays silent on forbidden topics.

Importing this module has NO side effects: the CLI only runs when this file is
the process entry point.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.content import APPROVED_CONTENT, ApprovedContent
from app.eval_dataset import (
    EVAL_KB_CASES,
    KB_PARAPHRASE_DEV_CASES,
    KB_PARAPHRASE_TEST_CASES,
    KbEvalCase,
    KbParaphraseCase,
    KbParaphraseCategory,
)
from app.kb import KB_PASSAGES
from app.retrieval import (
    MIN_BM25_SCORE,
    MIN_TERM_COVERAGE,
    PRODUCTION_RETRIEVAL_MODE,
    RetrievalMode,
    RetrievalOutcome,
    retrieve,
)
from app.rules import guard_reply

# ---------------------------------------------------------------------------
# Knowledge-base evaluation (groups F and G): recall on the answerable group
# and ZERO false positives on the escalate group.
# ---------------------------------------------------------------------------

KbRetrievalOutcome = Literal["hit", "wrong-answer", "miss", "false-positive", "correct-null"]


@dataclass(frozen=True)
class KbCaseResult:
    id: str
    question: str
    expected_passage_id: str | None
    actual_passage_id: str | None
    outcome: KbRetrievalOutcome
    guard_ok: bool
    score: float
    coverage: float
    refusal: str | None
    explanation: str


@dataclass(frozen=True)
class KbEvalMetrics:
    total: int
    answerable: int
    unanswerable: int
    hits: int
    misses: int
    wrong_answers: int
    false_positives: int
    correct_nulls: int
    recall: float
    false_positive_rate: float
    guard_violations: int


@dataclass(frozen=True)
class KbEvalReport:
    mode: RetrievalMode
    results: tuple[KbCaseResult, ...]
    metrics: KbEvalMetrics


# Measured floors of the knowledge-base layer (baseline 2026-10-20):
# recall 1.00 (22/22) and 0 false positives on the escalate group.
KB_RECALL_TARGET = 0.9
KB_FALSE_POSITIVE_TARGET = 0


def resolve_kb_outcome(
    expected: str | None, actual: str | None
) -> KbRetrievalOutcome:
    """Classify a single knowledge-base case against the retrieval result."""
    if expected is not None:
        if actual is None:
            return "miss"
        return "hit" if actual == expected else "wrong-answer"
    return "correct-null" if actual is None else "false-positive"


def _outcome_rank(outcome: RetrievalOutcome) -> tuple[float, float]:
    """Score and coverage of the match, else of the best passage, else zeros."""
    if outcome.match is not None:
        return outcome.match.score, outcome.match.coverage
    if outcome.best is not None:
        return outcome.best.score, outcome.best.coverage
    return 0.0, 0.0


def run_kb_eval(
    content: ApprovedContent,
    cases: Sequence[KbEvalCase],
    mode: RetrievalMode = PRODUCTION_RETRIEVAL_MODE,
) -> KbEvalReport:
    """Replay the labelled knowledge-base cases and score the retrieval gate."""
    results: list[KbCaseResult] = []

    for eval_case in cases:
        outcome = retrieve(content.kb or (), eval_case.question, mode)
        actual_passage_id = outcome.match.passage.id if outcome.match is not None else None
        result_outcome = resolve_kb_outcome(eval_case.expected_passage_id, actual_passage_id)
        guard = guard_reply(outcome.match.passage.answer) if outcome.match is not None else None
        guard_ok = guard.ok if guard is not None else True
        parts: list[str] = []
        if result_outcome == "miss":
            parts.append(f"expected {eval_case.expected_passage_id}, got null ({outcome.refusal})")
        elif result_outcome == "wrong-answer":
            parts.append(f"expected {eval_case.expected_passage_id}, got {actual_passage_id}")
        elif result_outcome == "false-positive":
            parts.append(
                f"expected null, got {actual_passage_id} "
                "(the knowledge base answered a topic that must escalate)"
            )
        if not guard_ok:
            parts.append("guard violation on the knowledge-base answer")
        score, coverage = _outcome_rank(outcome)
        results.append(
            KbCaseResult(
                id=eval_case.id,
                question=eval_case.question,
                expected_passage_id=eval_case.expected_passage_id,
                actual_passage_id=actual_passage_id,
                outcome=result_outcome,
                guard_ok=guard_ok,
                score=score,
                coverage=coverage,
                refusal=outcome.refusal,
                explanation="; ".join(parts),
            )
        )

    total = len(results)
    answerable = sum(1 for result in results if result.expected_passage_id is not None)
    hits = sum(1 for result in results if result.outcome == "hit")
    wrong_answers = sum(1 for result in results if result.outcome == "wrong-answer")
    misses = sum(1 for result in results if result.outcome == "miss")
    false_positives = sum(1 for result in results if result.outcome == "false-positive")
    correct_nulls = sum(1 for result in results if result.outcome == "correct-null")
    guard_violations = sum(1 for result in results if not result.guard_ok)

    metrics = KbEvalMetrics(
        total=total,
        answerable=answerable,
        unanswerable=total - answerable,
        hits=hits,
        misses=misses,
        wrong_answers=wrong_answers,
        false_positives=false_positives,
        correct_nulls=correct_nulls,
        recall=hits / answerable if answerable > 0 else 0.0,
        false_positive_rate=(
            false_positives / (total - answerable) if total - answerable > 0 else 0.0
        ),
        guard_violations=guard_violations,
    )

    return KbEvalReport(mode=mode, results=tuple(results), metrics=metrics)


# ---------------------------------------------------------------------------
# Lexical ablation: same BM25, same coverage; only candidate mode adds the
# passage's indexed synthetic development prompts.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class KbParaphraseResult:
    id: str
    question: str
    category: KbParaphraseCategory
    expected_passage_id: str | None
    actual_passage_id: str | None
    score: float
    coverage: float
    correct: bool


@dataclass(frozen=True)
class KbParaphraseMetrics:
    total: int
    answerable: int
    must_escalate: int
    ambiguous: int
    protected: int
    hits: int
    misses: int
    wrong_top_passage: int
    false_positives: int
    recall: float
    protected_intercepted: int


@dataclass(frozen=True)
class KbParaphraseReport:
    mode: RetrievalMode
    results: tuple[KbParaphraseResult, ...]
    metrics: KbParaphraseMetrics


def run_kb_paraphrase_eval(
    content: ApprovedContent,
    cases: Sequence[KbParaphraseCase],
    mode: RetrievalMode,
) -> KbParaphraseReport:
    """Replay the paraphrase ablation dataset and score the two retrieval modes."""
    results: list[KbParaphraseResult] = []
    for eval_case in cases:
        outcome = retrieve(content.kb or (), eval_case.question, mode)
        actual_passage_id = outcome.match.passage.id if outcome.match is not None else None
        # 'protected' topics (compensation etc.) must never reach a passage; the
        # retrieval layer refuses them via the forbidden-topic gate.
        correct = (
            actual_passage_id == eval_case.expected_passage_id
            if eval_case.category == "answerable"
            else actual_passage_id is None
        )
        score, coverage = _outcome_rank(outcome)
        results.append(
            KbParaphraseResult(
                id=eval_case.id,
                question=eval_case.question,
                category=eval_case.category,
                expected_passage_id=eval_case.expected_passage_id,
                actual_passage_id=actual_passage_id,
                score=score,
                coverage=coverage,
                correct=correct,
            )
        )

    answerable = [result for result in results if result.category == "answerable"]
    must_escalate = [result for result in results if result.category == "must-escalate"]
    ambiguous = [result for result in results if result.category == "ambiguous"]
    protected_cases = [result for result in results if result.category == "protected"]
    hits = sum(
        1 for result in answerable if result.actual_passage_id == result.expected_passage_id
    )
    wrong_top_passage = sum(
        1
        for result in answerable
        if result.actual_passage_id is not None
        and result.actual_passage_id != result.expected_passage_id
    )
    false_positives = sum(
        1
        for result in [*must_escalate, *ambiguous]
        if result.actual_passage_id is not None
    )

    return KbParaphraseReport(
        mode=mode,
        results=tuple(results),
        metrics=KbParaphraseMetrics(
            total=len(results),
            answerable=len(answerable),
            must_escalate=len(must_escalate),
            ambiguous=len(ambiguous),
            protected=len(protected_cases),
            hits=hits,
            misses=len(answerable) - hits - wrong_top_passage,
            wrong_top_passage=wrong_top_passage,
            false_positives=false_positives,
            recall=hits / len(answerable) if len(answerable) > 0 else 0.0,
            protected_intercepted=sum(1 for result in protected_cases if result.correct),
        ),
    )


def _fixed(value: float, decimals: int) -> str:
    return f"{value:.{decimals}f}"


def _format_kb_paraphrase_row(label: str, report: KbParaphraseReport) -> str:
    metrics = report.metrics
    return "\n".join(
        [
            f"  {label.ljust(10)} {metrics.total:>3} cases "
            f"(answerable {metrics.answerable}, must-escalate {metrics.must_escalate}, "
            f"ambiguous {metrics.ambiguous}, protected {metrics.protected})",
            f"             recall {metrics.hits}/{metrics.answerable} "
            f"({_fixed(metrics.recall, 3)}); false positives {metrics.false_positives}; "
            f"wrong top passage {metrics.wrong_top_passage}; "
            f"protected intercepted {metrics.protected_intercepted}/{metrics.protected}",
        ]
    )


def format_kb_paraphrase_dev_report(
    baseline: KbParaphraseReport,
    candidate: KbParaphraseReport,
) -> str:
    failures = [result for result in candidate.results if not result.correct]
    lines = [
        "MUSK lexical ablation — DEVELOPMENT ONLY "
        "(synthetic prompts, not observed lead traffic)",
        "  indexed examples   "
        f"{sum(1 for entry in KB_PARAPHRASE_DEV_CASES if entry.category == 'answerable')} "
        "total; 7 per passage",
        f"  thresholds         BM25 >= {MIN_BM25_SCORE}; "
        f"term coverage >= {MIN_TERM_COVERAGE} (unchanged)",
        _format_kb_paraphrase_row("Baseline", baseline),
        _format_kb_paraphrase_row("Candidate", candidate),
        f"  runtime mode       {PRODUCTION_RETRIEVAL_MODE}",
    ]
    if not failures:
        lines.append("  dev failures       none")
    else:
        lines.append("  candidate dev failures")
        for failure in failures:
            expected = failure.expected_passage_id or "no passage"
            actual = failure.actual_passage_id or "no match"
            lines.append(
                f"    {failure.id} {failure.category}: expected {expected}, "
                f"got {actual} (score {failure.score:.2f}, coverage {failure.coverage:.2f}) "
                f"— {failure.question}"
            )
    return "\n".join(lines)


def _format_kb_paraphrase_metrics(metrics: KbParaphraseMetrics) -> str:
    return (
        f"{metrics.hits}/{metrics.answerable} recall ({_fixed(metrics.recall, 3)}); "
        f"false positives {metrics.false_positives}; wrong top passage {metrics.wrong_top_passage}; "
        f"protected intercepted {metrics.protected_intercepted}/{metrics.protected} "
        f"(total {metrics.total}: answerable {metrics.answerable}, "
        f"negatives {metrics.must_escalate}, ambiguous {metrics.ambiguous}, "
        f"protected {metrics.protected})"
    )


def format_kb_paraphrase_test_report(
    baseline: KbParaphraseReport,
    candidate: KbParaphraseReport,
    dev_candidate: KbParaphraseReport,
) -> str:
    dev = dev_candidate.metrics
    test = candidate.metrics
    dev_clean = (
        dev.misses == 0
        and dev.wrong_top_passage == 0
        and dev.false_positives == 0
        and dev.protected_intercepted == dev.protected
    )
    test_passes = (
        test.recall > baseline.metrics.recall
        and test.false_positives == 0
        and test.wrong_top_passage == 0
        and test.protected_intercepted == test.protected
    )
    accepted = dev_clean and test_passes
    lines = [
        "MUSK lexical ablation — FINAL HELD-OUT TEST "
        "(synthetic prompts; do not tune on this set)",
        "  held-out examples  "
        f"{sum(1 for entry in KB_PARAPHRASE_TEST_CASES if entry.category == 'answerable')} "
        "total; 3 per passage; none indexed",
        f"  Baseline            {_format_kb_paraphrase_metrics(baseline.metrics)}",
        f"  Candidate           {_format_kb_paraphrase_metrics(candidate.metrics)}",
        f"  acceptance          {'PASS' if accepted else 'BLOCKED'}",
        f"  runtime mode        {PRODUCTION_RETRIEVAL_MODE}",
        f"  phrase inventory    {len(KB_PASSAGES)} passages; each has 7 indexed development "
        "+ 3 held-out = 10 synthetic prompts",
        "  decision            "
        + (
            "candidate is eligible for production runtime"
            if accepted
            else "keep candidate benchmark-only; production remains on baseline"
        ),
    ]
    if not dev_clean:
        lines.append("  blocker             candidate did not clear the development quality gate")
    if test.false_positives != 0:
        lines.append("  blocker             hold-out false positives must remain exactly zero")
    if test.recall <= baseline.metrics.recall:
        lines.append("  blocker             held-out recall did not improve over baseline")
    if test.wrong_top_passage != 0:
        lines.append("  blocker             hold-out contains a wrong top passage")
    if test.protected_intercepted != test.protected:
        lines.append(
            "  blocker             one or more protected intents were not intercepted"
        )
    return "\n".join(lines)


def format_kb_report(report: KbEvalReport, verbose: bool = False) -> str:
    metrics = report.metrics
    results = report.results
    lines: list[str] = []
    lines.append(f"MUSK knowledge-base evaluation (deterministic retrieval — {report.mode})")
    lines.append(
        f"  cases            {metrics.total:>3}   "
        f"(answerable {metrics.answerable} / must escalate {metrics.unanswerable})"
    )
    lines.append(f"  hits             {metrics.hits:>3}")
    lines.append(f"  misses           {metrics.misses:>3}")
    lines.append(f"  wrong answers    {metrics.wrong_answers:>3}")
    lines.append(
        f"  false positives  {metrics.false_positives:>3}   "
        f"(target = {KB_FALSE_POSITIVE_TARGET})"
    )
    lines.append(f"  correct nulls    {metrics.correct_nulls:>3}")
    lines.append(
        f"  kb recall       {_fixed(metrics.recall, 2).rjust(6)}   "
        f"(target >= {_fixed(KB_RECALL_TARGET, 2)})"
    )
    lines.append(
        f"  kb false pos.   {_fixed(metrics.false_positive_rate, 2).rjust(6)}   "
        f"(target = {KB_FALSE_POSITIVE_TARGET})"
    )
    lines.append(f"  guard violations {metrics.guard_violations:>3}")

    if verbose:
        lines.append("")
        lines.append("All knowledge-base cases")
        for result in results:
            refusal = result.refusal if result.refusal is not None else "answered"
            lines.append(
                f"  {result.id}  {result.outcome.ljust(15)}  "
                f"score {result.score:.2f}  coverage {result.coverage:.2f}  "
                f"{refusal}  {result.question}"
            )
            if result.explanation:
                lines.append(f"       {result.explanation}")

    failures = [
        result
        for result in results
        if result.outcome != "hit" and result.outcome != "correct-null"
    ]
    lines.append("")
    if not failures:
        lines.append("Knowledge-base failures: none")
    else:
        lines.append("Knowledge-base failures")
        for result in failures:
            lines.append(f"  {result.id}  {result.question}")
            lines.append(f"       {result.explanation}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# JSON serialisation (camelCase keys mirroring the TypeScript interfaces)
# ---------------------------------------------------------------------------


def _kb_case_result_to_dict(result: KbCaseResult) -> dict[str, object]:
    return {
        "id": result.id,
        "question": result.question,
        "expectedPassageId": result.expected_passage_id,
        "actualPassageId": result.actual_passage_id,
        "outcome": result.outcome,
        "guardOk": result.guard_ok,
        "score": result.score,
        "coverage": result.coverage,
        "refusal": result.refusal,
        "explanation": result.explanation,
    }


def _kb_eval_metrics_to_dict(metrics: KbEvalMetrics) -> dict[str, object]:
    return {
        "total": metrics.total,
        "answerable": metrics.answerable,
        "unanswerable": metrics.unanswerable,
        "hits": metrics.hits,
        "misses": metrics.misses,
        "wrongAnswers": metrics.wrong_answers,
        "falsePositives": metrics.false_positives,
        "correctNulls": metrics.correct_nulls,
        "recall": metrics.recall,
        "falsePositiveRate": metrics.false_positive_rate,
        "guardViolations": metrics.guard_violations,
    }


def _kb_eval_report_to_dict(report: KbEvalReport) -> dict[str, object]:
    return {
        "mode": report.mode,
        "results": [_kb_case_result_to_dict(result) for result in report.results],
        "metrics": _kb_eval_metrics_to_dict(report.metrics),
    }


def _kb_paraphrase_result_to_dict(result: KbParaphraseResult) -> dict[str, object]:
    return {
        "id": result.id,
        "question": result.question,
        "category": result.category,
        "expectedPassageId": result.expected_passage_id,
        "actualPassageId": result.actual_passage_id,
        "score": result.score,
        "coverage": result.coverage,
        "correct": result.correct,
    }


def _kb_paraphrase_metrics_to_dict(metrics: KbParaphraseMetrics) -> dict[str, object]:
    return {
        "total": metrics.total,
        "answerable": metrics.answerable,
        "mustEscalate": metrics.must_escalate,
        "ambiguous": metrics.ambiguous,
        "protected": metrics.protected,
        "hits": metrics.hits,
        "misses": metrics.misses,
        "wrongTopPassage": metrics.wrong_top_passage,
        "falsePositives": metrics.false_positives,
        "recall": metrics.recall,
        "protectedIntercepted": metrics.protected_intercepted,
    }


def _kb_paraphrase_report_to_dict(
    report: KbParaphraseReport,
) -> dict[str, object]:
    return {
        "mode": report.mode,
        "results": [_kb_paraphrase_result_to_dict(result) for result in report.results],
        "metrics": _kb_paraphrase_metrics_to_dict(report.metrics),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Sequence[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    verbose = "--verbose" in args
    as_json = "--json" in args
    dev_baseline = run_kb_paraphrase_eval(
        APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, "baseline"
    )
    dev_candidate = run_kb_paraphrase_eval(
        APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, "candidate"
    )
    test_baseline = run_kb_paraphrase_eval(
        APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, "baseline"
    )
    test_candidate = run_kb_paraphrase_eval(
        APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, "candidate"
    )
    holdout_report = format_kb_paraphrase_test_report(
        test_baseline, test_candidate, dev_candidate
    )
    kb_baseline = run_kb_eval(APPROVED_CONTENT, EVAL_KB_CASES, "baseline")

    if as_json:
        payload = {
            "kb": _kb_eval_report_to_dict(kb_baseline),
            "kbParaphraseDev": {
                "baseline": _kb_paraphrase_report_to_dict(dev_baseline),
                "candidate": _kb_paraphrase_report_to_dict(dev_candidate),
            },
            "kbParaphraseTest": {
                "baseline": _kb_paraphrase_report_to_dict(test_baseline),
                "candidate": _kb_paraphrase_report_to_dict(test_candidate),
            },
        }
        sys.stdout.write(f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n")
        return

    sys.stdout.write(
        f"{format_kb_report(kb_baseline, verbose)}\n\n"
        f"{format_kb_paraphrase_dev_report(dev_baseline, dev_candidate)}\n\n"
        f"{holdout_report}\n"
    )


if __name__ == "__main__":
    main()
