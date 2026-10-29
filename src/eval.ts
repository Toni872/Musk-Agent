// Retrieval evaluation harness for the MUSK RAG layer.
//
// A measurement instrument, not a retriever: no embeddings, no vector
// database, no LLM call. It replays the labelled knowledge-base dataset against
// the deterministic retrieval (src/retrieval.ts) and scores recall and
// false positives. The FAQ/grounding/intent measurements are gone with the
// deterministic engine; what matters now is whether the RAG retrieves the
// right passage and stays silent on forbidden topics.
//
// Importing this module has NO side effects: the CLI only runs when this file
// is the process entry point.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPROVED_CONTENT, type ApprovedContent } from './content';
import {
  EVAL_KB_CASES,
  KB_PARAPHRASE_DEV_CASES,
  KB_PARAPHRASE_TEST_CASES,
  type KbEvalCase,
  type KbParaphraseCase,
} from './eval.dataset';
import { KB_PASSAGES } from './kb';
import {
  MIN_BM25_SCORE,
  MIN_TERM_COVERAGE,
  PRODUCTION_RETRIEVAL_MODE,
  retrieve,
  type RetrievalMode,
} from './retrieval';
import { guardReply } from './rules';

// ---------------------------------------------------------------------------
// Knowledge-base evaluation (groups F and G): recall on the answerable group
// and ZERO false positives on the escalate group.
// ---------------------------------------------------------------------------

export type KbRetrievalOutcome = 'hit' | 'wrong-answer' | 'miss' | 'false-positive' | 'correct-null';

export interface KbCaseResult {
  id: string;
  question: string;
  expectedPassageId: string | null;
  actualPassageId: string | null;
  outcome: KbRetrievalOutcome;
  guardOk: boolean;
  score: number;
  coverage: number;
  refusal: string | null;
  explanation: string;
}

export interface KbEvalMetrics {
  total: number;
  answerable: number;
  unanswerable: number;
  hits: number;
  misses: number;
  wrongAnswers: number;
  falsePositives: number;
  correctNulls: number;
  recall: number;
  falsePositiveRate: number;
  guardViolations: number;
}

export interface KbEvalReport {
  mode: RetrievalMode;
  results: KbCaseResult[];
  metrics: KbEvalMetrics;
}

// Measured floors of the knowledge-base layer (baseline 2026-10-20):
// recall 1.00 (22/22) and 0 false positives on the escalate group.
export const KB_RECALL_TARGET = 0.9;
export const KB_FALSE_POSITIVE_TARGET = 0;

function resolveKbOutcome(expected: string | null, actual: string | null): KbRetrievalOutcome {
  if (expected !== null) {
    if (actual === null) return 'miss';
    return actual === expected ? 'hit' : 'wrong-answer';
  }
  return actual === null ? 'correct-null' : 'false-positive';
}

export function runKbEval(
  content: ApprovedContent,
  cases: KbEvalCase[],
  mode: RetrievalMode = PRODUCTION_RETRIEVAL_MODE,
): KbEvalReport {
  const results: KbCaseResult[] = [];

  for (const evalCase of cases) {
    const outcome = retrieve(content.kb ?? [], evalCase.question, mode);
    const actualPassageId = outcome.match?.passage.id ?? null;
    const resultOutcome = resolveKbOutcome(evalCase.expectedPassageId, actualPassageId);
    const guard = outcome.match ? guardReply(outcome.match.passage.answer) : { ok: true, violations: [] };
    const parts: string[] = [];
    if (resultOutcome === 'miss') {
      parts.push(`expected ${evalCase.expectedPassageId}, got null (${outcome.refusal})`);
    } else if (resultOutcome === 'wrong-answer') {
      parts.push(`expected ${evalCase.expectedPassageId}, got ${actualPassageId}`);
    } else if (resultOutcome === 'false-positive') {
      parts.push(`expected null, got ${actualPassageId} (the knowledge base answered a topic that must escalate)`);
    }
    if (!guard.ok) parts.push('guard violation on the knowledge-base answer');
    results.push({
      id: evalCase.id,
      question: evalCase.question,
      expectedPassageId: evalCase.expectedPassageId,
      actualPassageId,
      outcome: resultOutcome,
      guardOk: guard.ok,
      score: outcome.match?.score ?? outcome.best?.score ?? 0,
      coverage: outcome.match?.coverage ?? outcome.best?.coverage ?? 0,
      refusal: outcome.refusal,
      explanation: parts.join('; '),
    });
  }

  const total = results.length;
  const answerable = results.filter((result) => result.expectedPassageId !== null).length;
  const hits = results.filter((result) => result.outcome === 'hit').length;
  const wrongAnswers = results.filter((result) => result.outcome === 'wrong-answer').length;
  const misses = results.filter((result) => result.outcome === 'miss').length;
  const falsePositives = results.filter((result) => result.outcome === 'false-positive').length;
  const correctNulls = results.filter((result) => result.outcome === 'correct-null').length;
  const guardViolations = results.filter((result) => !result.guardOk).length;

  const metrics: KbEvalMetrics = {
    total,
    answerable,
    unanswerable: total - answerable,
    hits,
    misses,
    wrongAnswers,
    falsePositives,
    correctNulls,
    recall: answerable > 0 ? hits / answerable : 0,
    falsePositiveRate: total - answerable > 0 ? falsePositives / (total - answerable) : 0,
    guardViolations,
  };

  return { mode, results, metrics };
}

// ---------------------------------------------------------------------------
// Lexical ablation: same BM25, same coverage; only candidate mode adds the
// passage's indexed synthetic development prompts.
// ---------------------------------------------------------------------------

export interface KbParaphraseResult {
  id: string;
  question: string;
  category: KbParaphraseCase['category'];
  expectedPassageId: string | null;
  actualPassageId: string | null;
  score: number;
  coverage: number;
  correct: boolean;
}

export interface KbParaphraseMetrics {
  total: number;
  answerable: number;
  mustEscalate: number;
  ambiguous: number;
  protected: number;
  hits: number;
  misses: number;
  wrongTopPassage: number;
  falsePositives: number;
  recall: number;
  protectedIntercepted: number;
}

export interface KbParaphraseReport {
  mode: RetrievalMode;
  results: KbParaphraseResult[];
  metrics: KbParaphraseMetrics;
}

export function runKbParaphraseEval(
  content: ApprovedContent,
  cases: KbParaphraseCase[],
  mode: RetrievalMode,
): KbParaphraseReport {
  const results: KbParaphraseResult[] = cases.map((evalCase) => {
    const outcome = retrieve(content.kb ?? [], evalCase.question, mode);
    const actualPassageId = outcome.match?.passage.id ?? null;
    // 'protected' topics (compensation etc.) must never reach a passage; the
    // retrieval layer refuses them via the forbidden-topic gate.
    const correct =
      evalCase.category === 'answerable'
        ? actualPassageId === evalCase.expectedPassageId
        : actualPassageId === null;
    return {
      id: evalCase.id,
      question: evalCase.question,
      category: evalCase.category,
      expectedPassageId: evalCase.expectedPassageId,
      actualPassageId,
      score: outcome.match?.score ?? outcome.best?.score ?? 0,
      coverage: outcome.match?.coverage ?? outcome.best?.coverage ?? 0,
      correct,
    };
  });

  const answerable = results.filter((result) => result.category === 'answerable');
  const mustEscalate = results.filter((result) => result.category === 'must-escalate');
  const ambiguous = results.filter((result) => result.category === 'ambiguous');
  const protectedCases = results.filter((result) => result.category === 'protected');
  const hits = answerable.filter((result) => result.actualPassageId === result.expectedPassageId).length;
  const wrongTopPassage = answerable.filter(
    (result) => result.actualPassageId !== null && result.actualPassageId !== result.expectedPassageId,
  ).length;
  const falsePositives = [...mustEscalate, ...ambiguous].filter(
    (result) => result.actualPassageId !== null,
  ).length;

  return {
    mode,
    results,
    metrics: {
      total: results.length,
      answerable: answerable.length,
      mustEscalate: mustEscalate.length,
      ambiguous: ambiguous.length,
      protected: protectedCases.length,
      hits,
      misses: answerable.length - hits - wrongTopPassage,
      wrongTopPassage,
      falsePositives,
      recall: answerable.length > 0 ? hits / answerable.length : 0,
      protectedIntercepted: protectedCases.filter((result) => result.correct).length,
    },
  };
}

function formatKbParaphraseRow(label: string, report: KbParaphraseReport): string {
  const { metrics } = report;
  return [
    `  ${label.padEnd(10)} ${String(metrics.total).padStart(3)} cases ` +
      `(answerable ${metrics.answerable}, must-escalate ${metrics.mustEscalate}, ambiguous ${metrics.ambiguous}, protected ${metrics.protected})`,
    `             recall ${metrics.hits}/${metrics.answerable} (${fixed(metrics.recall, 3)}); ` +
      `false positives ${metrics.falsePositives}; wrong top passage ${metrics.wrongTopPassage}; ` +
      `protected intercepted ${metrics.protectedIntercepted}/${metrics.protected}`,
  ].join('\n');
}

export function formatKbParaphraseDevReport(
  baseline: KbParaphraseReport,
  candidate: KbParaphraseReport,
): string {
  const failures = candidate.results.filter((result) => !result.correct);
  const lines = [
    'MUSK lexical ablation — DEVELOPMENT ONLY (synthetic prompts, not observed lead traffic)',
    `  indexed examples   ${KB_PARAPHRASE_DEV_CASES.filter((entry) => entry.category === 'answerable').length} total; 7 per passage`,
    `  thresholds         BM25 >= ${MIN_BM25_SCORE}; term coverage >= ${MIN_TERM_COVERAGE} (unchanged)`,
    formatKbParaphraseRow('Baseline', baseline),
    formatKbParaphraseRow('Candidate', candidate),
    `  runtime mode       ${PRODUCTION_RETRIEVAL_MODE}`,
  ];
  if (failures.length === 0) {
    lines.push('  dev failures       none');
  } else {
    lines.push('  candidate dev failures');
    for (const failure of failures) {
      lines.push(
        `    ${failure.id} ${failure.category}: expected ${failure.expectedPassageId ?? 'no passage'}, ` +
          `got ${failure.actualPassageId ?? 'no match'} ` +
          `(score ${failure.score.toFixed(2)}, coverage ${failure.coverage.toFixed(2)}) — ${failure.question}`,
      );
    }
  }
  return lines.join('\n');
}

function formatKbParaphraseMetrics(metrics: KbParaphraseMetrics): string {
  return `${metrics.hits}/${metrics.answerable} recall (${fixed(metrics.recall, 3)}); ` +
    `false positives ${metrics.falsePositives}; wrong top passage ${metrics.wrongTopPassage}; ` +
    `protected intercepted ${metrics.protectedIntercepted}/${metrics.protected} ` +
    `(total ${metrics.total}: answerable ${metrics.answerable}, negatives ${metrics.mustEscalate}, ` +
    `ambiguous ${metrics.ambiguous}, protected ${metrics.protected})`;
}

export function formatKbParaphraseTestReport(
  baseline: KbParaphraseReport,
  candidate: KbParaphraseReport,
  devCandidate: KbParaphraseReport,
): string {
  const dev = devCandidate.metrics;
  const test = candidate.metrics;
  const devClean =
    dev.misses === 0 && dev.wrongTopPassage === 0 && dev.falsePositives === 0 &&
    dev.protectedIntercepted === dev.protected;
  const testPasses =
    test.recall > baseline.metrics.recall && test.falsePositives === 0 &&
    test.wrongTopPassage === 0 && test.protectedIntercepted === test.protected;
  const accepted = devClean && testPasses;
  const lines = [
    'MUSK lexical ablation — FINAL HELD-OUT TEST (synthetic prompts; do not tune on this set)',
    `  held-out examples  ${KB_PARAPHRASE_TEST_CASES.filter((entry) => entry.category === 'answerable').length} total; 3 per passage; none indexed`,
    `  Baseline            ${formatKbParaphraseMetrics(baseline.metrics)}`,
    `  Candidate           ${formatKbParaphraseMetrics(candidate.metrics)}`,
    `  acceptance          ${accepted ? 'PASS' : 'BLOCKED'}`,
    `  runtime mode        ${PRODUCTION_RETRIEVAL_MODE}`,
    `  phrase inventory    ${KB_PASSAGES.length} passages; each has 7 indexed development + 3 held-out = 10 synthetic prompts`,
    `  decision            ${accepted ? 'candidate is eligible for production runtime' : 'keep candidate benchmark-only; production remains on baseline'}`,
  ];
  if (!devClean) lines.push('  blocker             candidate did not clear the development quality gate');
  if (test.falsePositives !== 0) lines.push('  blocker             hold-out false positives must remain exactly zero');
  if (test.recall <= baseline.metrics.recall) lines.push('  blocker             held-out recall did not improve over baseline');
  if (test.wrongTopPassage !== 0) lines.push('  blocker             hold-out contains a wrong top passage');
  if (test.protectedIntercepted !== test.protected) lines.push('  blocker             one or more protected intents were not intercepted');
  return lines.join('\n');
}

function fixed(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function formatKbReport(report: KbEvalReport, options?: { verbose?: boolean }): string {
  const { metrics, results } = report;
  const lines: string[] = [];
  lines.push(`MUSK knowledge-base evaluation (deterministic retrieval — ${report.mode})`);
  lines.push(
    `  cases            ${String(metrics.total).padStart(3)}   (answerable ${metrics.answerable} / must escalate ${metrics.unanswerable})`,
  );
  lines.push(`  hits             ${String(metrics.hits).padStart(3)}`);
  lines.push(`  misses           ${String(metrics.misses).padStart(3)}`);
  lines.push(`  wrong answers    ${String(metrics.wrongAnswers).padStart(3)}`);
  lines.push(`  false positives  ${String(metrics.falsePositives).padStart(3)}   (target = ${KB_FALSE_POSITIVE_TARGET})`);
  lines.push(`  correct nulls    ${String(metrics.correctNulls).padStart(3)}`);
  lines.push(`  kb recall       ${fixed(metrics.recall, 2).padStart(6)}   (target >= ${fixed(KB_RECALL_TARGET, 2)})`);
  lines.push(`  kb false pos.   ${fixed(metrics.falsePositiveRate, 2).padStart(6)}   (target = ${KB_FALSE_POSITIVE_TARGET})`);
  lines.push(`  guard violations ${String(metrics.guardViolations).padStart(3)}`);

  if (options?.verbose) {
    lines.push('');
    lines.push('All knowledge-base cases');
    for (const result of results) {
      lines.push(
        `  ${result.id}  ${result.outcome.padEnd(15)}  score ${result.score.toFixed(2)}  coverage ${result.coverage.toFixed(2)}  ${result.refusal ?? 'answered'}  ${result.question}`,
      );
      if (result.explanation) lines.push(`       ${result.explanation}`);
    }
  }

  const failures = results.filter(
    (result) => result.outcome !== 'hit' && result.outcome !== 'correct-null',
  );
  lines.push('');
  if (failures.length === 0) {
    lines.push('Knowledge-base failures: none');
  } else {
    lines.push('Knowledge-base failures');
    for (const result of failures) {
      lines.push(`  ${result.id}  ${result.question}`);
      lines.push(`       ${result.explanation}`);
    }
  }
  return lines.join('\n');
}

async function main(argv: string[]): Promise<void> {
  const verbose = argv.includes('--verbose');
  const asJson = argv.includes('--json');
  const devBaseline = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, 'baseline');
  const devCandidate = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, 'candidate');
  const testBaseline = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, 'baseline');
  const testCandidate = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, 'candidate');
  const holdoutReport = formatKbParaphraseTestReport(testBaseline, testCandidate, devCandidate);
  const kbBaseline = runKbEval(APPROVED_CONTENT, EVAL_KB_CASES, 'baseline');

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          kb: kbBaseline,
          kbParaphraseDev: { baseline: devBaseline, candidate: devCandidate },
          kbParaphraseTest: { baseline: testBaseline, candidate: testCandidate },
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(
    `${formatKbReport(kbBaseline, { verbose })}\n\n` +
      `${formatKbParaphraseDevReport(devBaseline, devCandidate)}\n\n` +
      `${holdoutReport}\n`,
  );
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main(process.argv.slice(2));
}
