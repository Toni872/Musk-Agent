"""Tests for the retrieval evaluation harness.

Ported from tests/eval.test.ts. Floors of the RAG retrieval evaluation: the
labelled knowledge-base dataset must keep its measured recall and zero false
positives.
"""

from app.content import APPROVED_CONTENT
from app.eval import (
    KB_FALSE_POSITIVE_TARGET,
    KB_RECALL_TARGET,
    run_kb_eval,
    run_kb_paraphrase_eval,
)
from app.eval_dataset import (
    EVAL_KB_CASES,
    KB_PARAPHRASE_DEV_CASES,
    KB_PARAPHRASE_TEST_CASES,
)


def test_escalation_group_is_never_answered_by_the_knowledge_base() -> None:
    report = run_kb_eval(APPROVED_CONTENT, EVAL_KB_CASES, "baseline")
    assert report.metrics.false_positives == KB_FALSE_POSITIVE_TARGET


def test_knowledge_base_recall_does_not_regress_below_the_measured_floor() -> None:
    report = run_kb_eval(APPROVED_CONTENT, EVAL_KB_CASES, "baseline")
    assert report.metrics.recall >= KB_RECALL_TARGET


def test_no_knowledge_base_answer_breaks_the_guard() -> None:
    report = run_kb_eval(APPROVED_CONTENT, EVAL_KB_CASES, "baseline")
    assert report.metrics.guard_violations == 0


def test_candidate_adds_no_false_positives_on_development_negatives() -> None:
    candidate = run_kb_paraphrase_eval(
        APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, "candidate"
    )
    assert candidate.metrics.false_positives == 0
    assert candidate.metrics.wrong_top_passage == 0


def test_candidate_intercepts_all_protected_topics() -> None:
    candidate = run_kb_paraphrase_eval(
        APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, "candidate"
    )
    assert candidate.metrics.protected_intercepted == candidate.metrics.protected
