// Retrieval evaluation harness ("bucle de evaluación") for the MUSK
// approved-content routing. A measurement instrument, not a retriever:
// no embeddings, no vector database, no LLM call. It replays the labelled
// dataset (eval.dataset.ts) against the deterministic runtime routing
// (classify gate + findApprovedAnswer first-match-wins) and scores it with
// recall/precision/misses plus intent and output-guard checks.
//
// Importing this module has NO side effects: the CLI only runs when this
// file is the process entry point (same guard a library would use).

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVAL_CASES,
  EVAL_KB_CASES,
  KB_PARAPHRASE_DEV_CASES,
  KB_PARAPHRASE_TEST_CASES,
  groupOf,
  type EvalCase,
  type KbEvalCase,
  type KbParaphraseCase,
} from './eval.dataset';
import { MuskAgent } from './agent';
import type { ApprovedContent } from './content';
import { APPROVED_CONTENT } from './content';
import { classify, findApprovedAnswer, normalizeEs, type Intent } from './intent';
import { MockProvider } from './llm';
import { KB_PASSAGES } from './kb';
import {
  MIN_BM25_SCORE,
  MIN_TERM_COVERAGE,
  PRODUCTION_RETRIEVAL_MODE,
  retrieve,
  type RetrievalMode,
} from './retrieval';
import { acceptanceConfirmed, guardReply } from './rules';

export type RetrievalOutcome = 'hit' | 'wrong-answer' | 'miss' | 'false-positive' | 'correct-null';

export interface CaseResult {
  id: string;
  question: string;
  expectedAnswerId: string | null;
  actualAnswerId: string | null;
  expectedIntent: Intent;
  actualIntent: Intent;
  outcome: RetrievalOutcome;
  intentOk: boolean;
  guardOk: boolean;
  violations: { id: string; rule: number }[];
  explanation: string; // one short English sentence, empty when the case is fully correct
}

export interface EvalMetrics {
  total: number;
  answerable: number; // cases with expectedAnswerId !== null
  unanswerable: number; // expectedAnswerId === null
  hits: number;
  wrongAnswers: number;
  misses: number;
  falsePositives: number;
  correctNulls: number;
  recall: number; // hits / answerable
  precision: number; // hits / (hits + wrongAnswers + falsePositives)
  intentAccuracy: number; // intentOk / total
  guardViolations: number; // total violations across all answers actually returned
}

export interface EvalReport {
  results: CaseResult[];
  metrics: EvalMetrics;
}

// Measured floors (baseline 2026-10-15). The test gate asserts these; the
// report prints them as targets. Raise them as the routing improves — never
// lower them to make a test pass.
export const RECALL_TARGET = 0.81;
export const PRECISION_TARGET = 1.0;

function resolveOutcome(expected: string | null, actual: string | null): RetrievalOutcome {
  if (expected !== null) {
    if (actual === null) return 'miss';
    return actual === expected ? 'hit' : 'wrong-answer';
  }
  return actual === null ? 'correct-null' : 'false-positive';
}

function explain(
  expectedAnswerId: string | null,
  actualAnswerId: string | null,
  outcome: RetrievalOutcome,
  expectedIntent: Intent,
  actualIntent: Intent,
  guardOk: boolean,
  violations: { id: string; rule: number }[],
): string {
  const parts: string[] = [];
  if (outcome === 'miss') {
    parts.push(`expected ${expectedAnswerId}, got null (no keyword matched)`);
  } else if (outcome === 'wrong-answer') {
    parts.push(`expected ${expectedAnswerId}, got ${actualAnswerId} (first-match-wins picked a different FAQ entry)`);
  } else if (outcome === 'false-positive') {
    parts.push(`expected null, got ${actualAnswerId} (an unapproved topic reached an FAQ answer)`);
  }
  if (actualIntent !== expectedIntent) {
    parts.push(`intent ${actualIntent}, expected ${expectedIntent}`);
  }
  if (!guardOk) {
    parts.push(`guard violation: ${violations.map((violation) => violation.id).join(', ')}`);
  }
  return parts.join('; ');
}

// Pure and deterministic: no agent instance, no state, no LLM. The actual
// answer mirrors the runtime routing of agent.runTurn exactly — the FAQ is
// only consulted on the 'general' path (and never when the lead accepted a
// call); any other intent replies with its approved template and returns no
// FAQ answer. A false positive therefore means classify() failed to intercept
// a forbidden/unapproved topic before the FAQ.
export function runRetrievalEval(content: ApprovedContent, cases: EvalCase[]): EvalReport {
  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    const actualIntent = classify(evalCase.question, content);
    // Mirror of the agent's fresh 'general' branch: only a CONFIRMED
    // acceptance suppresses the FAQ (a negated one is not an acceptance).
    const callAccepted = acceptanceConfirmed(normalizeEs(evalCase.question));
    const faqHit =
      actualIntent === 'general' && !callAccepted ? findApprovedAnswer(content, evalCase.question) : null;
    const actualAnswerId = faqHit?.id ?? null;

    const outcome = resolveOutcome(evalCase.expectedAnswerId, actualAnswerId);
    const intentOk = actualIntent === evalCase.expectedIntent;
    const guard = faqHit ? guardReply(faqHit.answer) : { ok: true, violations: [] };
    const violations = [...guard.violations];
    const guardOk = guard.ok;

    results.push({
      id: evalCase.id,
      question: evalCase.question,
      expectedAnswerId: evalCase.expectedAnswerId,
      actualAnswerId,
      expectedIntent: evalCase.expectedIntent,
      actualIntent,
      outcome,
      intentOk,
      guardOk,
      violations,
      explanation: explain(
        evalCase.expectedAnswerId,
        actualAnswerId,
        outcome,
        evalCase.expectedIntent,
        actualIntent,
        guardOk,
        violations,
      ),
    });
  }

  const total = results.length;
  const answerable = results.filter((result) => result.expectedAnswerId !== null).length;
  const hits = results.filter((result) => result.outcome === 'hit').length;
  const wrongAnswers = results.filter((result) => result.outcome === 'wrong-answer').length;
  const misses = results.filter((result) => result.outcome === 'miss').length;
  const falsePositives = results.filter((result) => result.outcome === 'false-positive').length;
  const correctNulls = results.filter((result) => result.outcome === 'correct-null').length;
  const intentOks = results.filter((result) => result.intentOk).length;
  const guardViolations = results.reduce((sum, result) => sum + result.violations.length, 0);

  const metrics: EvalMetrics = {
    total,
    answerable,
    unanswerable: total - answerable,
    hits,
    wrongAnswers,
    misses,
    falsePositives,
    correctNulls,
    recall: answerable > 0 ? hits / answerable : 0,
    precision: hits + wrongAnswers + falsePositives > 0 ? hits / (hits + wrongAnswers + falsePositives) : 0,
    intentAccuracy: total > 0 ? intentOks / total : 0,
    guardViolations,
  };

  return { results, metrics };
}

function isFailure(result: CaseResult): boolean {
  return result.outcome !== 'hit' && result.outcome !== 'correct-null' ? true : !result.intentOk || !result.guardOk;
}

// ---------------------------------------------------------------------------
// Knowledge-base evaluation (Phase 0)
//
// A second, SEPARATE measurement over the labelled knowledge-base dataset
// (src/eval.dataset.ts, groups F and G). It scores the deterministic retrieval
// layer (src/retrieval.ts):
//
//   - recall on the answerable group (F): the share of questions the knowledge
//     base answers WITH THE EXPECTED PASSAGE;
//   - FALSE POSITIVES on the escalate group (G): the share of forbidden-topic
//     questions the knowledge base answers anyway. It must be 0 (rule 5).
//
// It does not touch the FAQ metrics or their floors: those are untouched.
// ---------------------------------------------------------------------------

export type KbRetrievalOutcome =
  | 'hit'
  | 'wrong-answer'
  | 'miss'
  | 'false-positive'
  | 'correct-null';

export interface KbCaseResult {
  id: string;
  question: string;
  expectedPassageId: string | null;
  actualPassageId: string | null;
  expectedIntent: Intent;
  actualIntent: Intent;
  outcome: KbRetrievalOutcome;
  intentOk: boolean;
  guardOk: boolean;
  score: number;
  coverage: number;
  // Why the retrieval refused to answer: 'forbidden-topic' (a topic that must
  // always escalate) or 'below-threshold' (nothing cleared the thresholds).
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
  recall: number; // hits / answerable
  falsePositiveRate: number; // false positives / unanswerable
  intentAccuracy: number;
  guardViolations: number;
}

export interface KbEvalReport {
  mode: RetrievalMode;
  results: KbCaseResult[];
  metrics: KbEvalMetrics;
}

// Measured floors of the knowledge-base layer (baseline 2026-10-20):
// recall 1.00 (22/22) and 0 false positives on the escalate group. The recall
// floor is kept at 0.90 so a new paraphrase can be added to the dataset
// without lowering the bar; the false-positive floor is 0 and is absolute.
export const KB_RECALL_TARGET = 0.9;
export const KB_FALSE_POSITIVE_TARGET = 0;

function resolveKbOutcome(expected: string | null, actual: string | null): KbRetrievalOutcome {
  if (expected !== null) {
    if (actual === null) return 'miss';
    return actual === expected ? 'hit' : 'wrong-answer';
  }
  return actual === null ? 'correct-null' : 'false-positive';
}

// Pure and deterministic: no agent instance, no state, no LLM. The knowledge
// base is measured exactly as the runtime uses it: the same retrieve() call,
// and the same classify() the agent performs.
export function runKbEval(
  content: ApprovedContent,
  cases: KbEvalCase[],
  mode: RetrievalMode = PRODUCTION_RETRIEVAL_MODE,
): KbEvalReport {
  const results: KbCaseResult[] = [];

  for (const evalCase of cases) {
    const outcome = retrieve(content.kb ?? [], evalCase.question, mode);
    const actualPassageId = outcome.match?.passage.id ?? null;
    const actualIntent = classify(evalCase.question, content, mode);
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
    if (actualIntent !== evalCase.expectedIntent) {
      parts.push(`intent ${actualIntent}, expected ${evalCase.expectedIntent}`);
    }
    if (!guard.ok) {
      parts.push('guard violation on the knowledge-base answer');
    }
    results.push({
      id: evalCase.id,
      question: evalCase.question,
      expectedPassageId: evalCase.expectedPassageId,
      actualPassageId,
      expectedIntent: evalCase.expectedIntent,
      actualIntent,
      outcome: resultOutcome,
      intentOk: actualIntent === evalCase.expectedIntent,
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
  const intentOks = results.filter((result) => result.intentOk).length;
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
    intentAccuracy: total > 0 ? intentOks / total : 0,
    guardViolations,
  };

  return { mode, results, metrics };
}

// ---------------------------------------------------------------------------
// Phase 2 lexical ablation: same BM25, same coverage, same gates and thresholds;
// only candidate mode adds the passage's indexed synthetic development prompts.
// Protected intents are classified first and are measured in their own lane.
// ---------------------------------------------------------------------------

export interface KbParaphraseResult {
  id: string;
  question: string;
  category: KbParaphraseCase['category'];
  expectedPassageId: string | null;
  actualPassageId: string | null;
  actualIntent: Intent | null;
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
    if (evalCase.category === 'protected') {
      const actualIntent = classify(evalCase.question, content, mode);
      const correct = actualIntent === evalCase.expectedIntent && actualIntent !== 'kb';
      return {
        id: evalCase.id,
        question: evalCase.question,
        category: evalCase.category,
        expectedPassageId: null,
        actualPassageId: null,
        actualIntent,
        score: 0,
        coverage: 0,
        correct,
      };
    }

    const outcome = retrieve(content.kb ?? [], evalCase.question, mode);
    const actualPassageId = outcome.match?.passage.id ?? null;
    const correct = evalCase.category === 'answerable'
      ? actualPassageId === evalCase.expectedPassageId
      : actualPassageId === null;
    return {
      id: evalCase.id,
      question: evalCase.question,
      category: evalCase.category,
      expectedPassageId: evalCase.expectedPassageId,
      actualPassageId,
      actualIntent: null,
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
    'MUSK Phase 2 lexical ablation — DEVELOPMENT ONLY (synthetic prompts, not observed lead traffic)',
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
          `got ${failure.actualPassageId ?? failure.actualIntent ?? 'no match'} ` +
          `(score ${failure.score.toFixed(2)}, coverage ${failure.coverage.toFixed(2)}) — ${failure.question}`,
      );
    }
  }
  return lines.join('\n');
}

export function formatKbParaphraseTestReport(
  baseline: KbParaphraseReport,
  candidate: KbParaphraseReport,
  legacyCandidate: KbEvalReport,
  devCandidate: KbParaphraseReport,
): string {
  const dev = devCandidate.metrics;
  const test = candidate.metrics;
  const legacy = legacyCandidate.metrics;
  const devClean =
    dev.misses === 0 &&
    dev.wrongTopPassage === 0 &&
    dev.falsePositives === 0 &&
    dev.protectedIntercepted === dev.protected;
  const legacyClean =
    legacy.misses === 0 &&
    legacy.wrongAnswers === 0 &&
    legacy.falsePositives === 0;
  const testPasses =
    test.recall > baseline.metrics.recall &&
    test.falsePositives === 0 &&
    test.wrongTopPassage === 0 &&
    test.protectedIntercepted === test.protected;
  const accepted = devClean && legacyClean && testPasses;
  const lines = [
    'MUSK Phase 2 lexical ablation — FINAL HELD-OUT TEST (synthetic prompts; do not tune on this set)',
    `  held-out examples  ${KB_PARAPHRASE_TEST_CASES.filter((entry) => entry.category === 'answerable').length} total; 3 per passage; none indexed`,
    `  Baseline            ${formatKbParaphraseMetrics(baseline.metrics)}`,
    `  Candidate           ${formatKbParaphraseMetrics(candidate.metrics)}`,
    `  acceptance          ${accepted ? 'PASS' : 'BLOCKED'}`,
    `  runtime mode        ${PRODUCTION_RETRIEVAL_MODE}`,
    `  phrase inventory    ${KB_PASSAGES.length} passages; each has 7 indexed development + 3 held-out = 10 synthetic prompts`,
    ...KB_PASSAGES.map(
      (passage) => `    ${passage.id}: indexed ${(passage.exampleQueries ?? []).length}; held-out ${KB_PARAPHRASE_TEST_CASES.filter((entry) => entry.category === 'answerable' && entry.expectedPassageId === passage.id).length}`,
    ),
    `  decision            ${accepted ? 'candidate is eligible for production runtime' : 'keep candidate benchmark-only; production remains on baseline'}`,
  ];
  if (!devClean) lines.push('  blocker             candidate did not clear the development quality gate');
  if (!legacyClean) lines.push('  blocker             candidate changed one or more legacy/core KB outcomes');
  if (test.falsePositives !== 0) lines.push('  blocker             hold-out false positives must remain exactly zero');
  if (test.recall <= baseline.metrics.recall) lines.push('  blocker             held-out recall did not improve over baseline');
  if (test.wrongTopPassage !== 0) lines.push('  blocker             hold-out contains a wrong top passage');
  if (test.protectedIntercepted !== test.protected) lines.push('  blocker             one or more protected intents were not intercepted');
  return lines.join('\n');
}

function formatKbParaphraseMetrics(metrics: KbParaphraseMetrics): string {
  return `${metrics.hits}/${metrics.answerable} recall (${fixed(metrics.recall, 3)}); ` +
    `false positives ${metrics.falsePositives}; wrong top passage ${metrics.wrongTopPassage}; ` +
    `protected intercepted ${metrics.protectedIntercepted}/${metrics.protected} ` +
    `(total ${metrics.total}: answerable ${metrics.answerable}, negatives ${metrics.mustEscalate}, ` +
    `ambiguous ${metrics.ambiguous}, protected ${metrics.protected})`;
}

// ---------------------------------------------------------------------------
// Grounding evaluation (Phase 1)
//
// A third, SEPARATE measurement over the labelled FAQ dataset: what happens
// when the optional LLM layer answers a question with content the approved
// source does NOT support.
//
// The provider is a MockProvider that always returns a deliberately
// ungrounded answer (it adds a number and a price word). The invariant under
// test is the one of the hard rules: the reply that reaches the lead must be
// the APPROVED TEXT of the matched entry, never the model's answer. A
// violation here is a rule 4 breach (unapproved content reaching the lead),
// so the floor is absolute: 0.
// ---------------------------------------------------------------------------

// The deliberately ungrounded answer of the mock provider: it adds a number
// ("500"), a price word ("euros") and two terms that belong to no approved
// entry ("Discord", "Steam").
export const UNGROUNDED_MODEL_ANSWER =
  'Vale, cuesta 500 euros y lo ves en Discord y Steam.';

export interface GroundingCaseResult {
  id: string;
  question: string;
  expectedAnswerId: string;
  // The lead-facing reply of the turn.
  reply: string;
  // True when the lead received the approved text of the matched entry.
  usedApprovedText: boolean;
  // The grounding verdict of the turn (the provider was consulted).
  groundingOk: boolean;
  unsupported: string[];
  explanation: string;
}

export interface GroundingEvalMetrics {
  total: number;
  usedApprovedText: number;
  // Lead-facing replies that are NOT the approved text. Must be 0.
  violations: number;
  // Turns where the grounding check rejected the rephrase (the check fired).
  rejectedRephrases: number;
}

export interface GroundingEvalReport {
  results: GroundingCaseResult[];
  metrics: GroundingEvalMetrics;
}

// Absolute floor: an ungrounded answer must never reach the lead.
export const GROUNDING_VIOLATION_TARGET = 0;

export async function runGroundingEval(
  content: ApprovedContent,
  cases: EvalCase[],
): Promise<GroundingEvalReport> {
  const results: GroundingCaseResult[] = [];

  for (const evalCase of cases) {
    if (evalCase.expectedAnswerId === null) continue;
    if (evalCase.expectedIntent !== 'general') continue;
    const entry = content.faq.find((item) => item.id === evalCase.expectedAnswerId);
    if (entry === undefined) continue;

    // A fresh agent per case: the measurement is per question, with no state
    // carried over from the previous one.
    const provider = new MockProvider(UNGROUNDED_MODEL_ANSWER);
    const agent = new MuskAgent({ content, provider });
    const result = await agent.runTurn(evalCase.question);
    if (provider.calls.length === 0) continue; // the LLM was not consulted on this turn

    const usedApprovedText = result.reply === entry.answer;
    const grounding = result.grounding;
    const parts: string[] = [];
    if (!usedApprovedText) {
      parts.push('the lead received an ungrounded reply instead of the approved text');
    }
    if (grounding !== undefined && grounding.ok) {
      parts.push('the grounding check accepted the ungrounded rephrase');
    }
    results.push({
      id: evalCase.id,
      question: evalCase.question,
      expectedAnswerId: evalCase.expectedAnswerId,
      reply: result.reply,
      usedApprovedText,
      groundingOk: grounding?.ok ?? false,
      unsupported: grounding?.unsupported ?? [],
      explanation: parts.join('; '),
    });
  }

  const total = results.length;
  const usedApprovedText = results.filter((result) => result.usedApprovedText).length;
  const violations = results.filter((result) => !result.usedApprovedText).length;
  const rejectedRephrases = results.filter((result) => !result.groundingOk).length;

  return {
    results,
    metrics: { total, usedApprovedText, violations, rejectedRephrases },
  };
}

function fixed(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function formatReport(
  report: EvalReport,
  options?: { verbose?: boolean; kb?: KbEvalReport; grounding?: GroundingEvalReport },
): string {
  const { metrics, results } = report;
  const lines: string[] = [];

  lines.push('MUSK retrieval evaluation');
  lines.push(`  cases            ${String(metrics.total).padStart(3)}   (answerable ${metrics.answerable} / unanswerable ${metrics.unanswerable})`);
  lines.push(`  hits             ${String(metrics.hits).padStart(3)}`);
  lines.push(`  misses           ${String(metrics.misses).padStart(3)}`);
  lines.push(`  wrong answers    ${String(metrics.wrongAnswers).padStart(3)}`);
  lines.push(`  false positives  ${String(metrics.falsePositives).padStart(3)}`);
  lines.push(`  correct nulls    ${String(metrics.correctNulls).padStart(3)}`);
  lines.push(`  recall          ${fixed(metrics.recall, 2).padStart(6)}   (target >= ${fixed(RECALL_TARGET, 2)})`);
  lines.push(`  precision       ${fixed(metrics.precision, 2).padStart(6)}   (target >= ${fixed(PRECISION_TARGET, 2)})`);
  lines.push(`  intent accuracy ${fixed(metrics.intentAccuracy, 2).padStart(6)}`);
  lines.push(`  guard violations ${String(metrics.guardViolations).padStart(3)}`);

  if (options?.verbose) {
    lines.push('');
    lines.push('All cases');
    for (const result of results) {
      lines.push(`  ${result.id} (group ${groupOf(result.id)})  ${result.outcome.padEnd(15)} intent ${result.intentOk ? 'ok  ' : 'FAIL'}  ${result.question}`);
      if (result.explanation) {
        lines.push(`       ${result.explanation}`);
      }
    }
  }

  const failures = results.filter(isFailure);
  lines.push('');
  if (failures.length === 0) {
    lines.push('Failures: none');
  } else {
    lines.push('Failures');
    for (const result of failures) {
      lines.push(`  ${result.id}  ${result.question}`);
      lines.push(`       ${result.explanation}`);
    }
    lines.push('');
    lines.push(`Failing ids (paste into a bug list): ${failures.map((result) => `${result.id} (group ${groupOf(result.id)})`).join(', ')}`);
  }

  if (options?.kb !== undefined) {
    lines.push('');
    lines.push(formatKbReport(options.kb, { verbose: options.verbose }));
  }

  if (options?.grounding !== undefined) {
    lines.push('');
    lines.push(formatGroundingReport(options.grounding, { verbose: options.verbose }));
  }

  return lines.join('\n');
}

// The knowledge-base section of the report. It is printed SEPARATELY from
// the FAQ metrics: the two layers are measured independently and the FAQ
// floors are untouched.
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
  lines.push(
    `  kb false pos.   ${fixed(metrics.falsePositiveRate, 2).padStart(6)}   (target = ${KB_FALSE_POSITIVE_TARGET})`,
  );
  lines.push(`  intent accuracy ${fixed(metrics.intentAccuracy, 2).padStart(6)}`);
  lines.push(`  guard violations ${String(metrics.guardViolations).padStart(3)}`);

  if (options?.verbose) {
    lines.push('');
    lines.push('All knowledge-base cases');
    for (const result of results) {
      lines.push(
        `  ${result.id} (group ${groupOf(result.id)})  ${result.outcome.padEnd(15)} intent ${result.intentOk ? 'ok  ' : 'FAIL'}  score ${result.score.toFixed(2)}  coverage ${result.coverage.toFixed(2)}  ${result.refusal ?? 'answered'}  ${result.question}`,
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

// The grounding section of the report. It is printed SEPARATELY from the FAQ
// and the knowledge-base metrics: it measures the optional LLM layer, and its
// floor (0 violations) is absolute.
export function formatGroundingReport(
  report: GroundingEvalReport,
  options?: { verbose?: boolean },
): string {
  const { metrics, results } = report;
  const lines: string[] = [];
  lines.push('MUSK grounding evaluation (LLM rephrase vs approved source)');
  lines.push(`  cases            ${String(metrics.total).padStart(3)}`);
  lines.push(`  approved text    ${String(metrics.usedApprovedText).padStart(3)}`);
  lines.push(
    `  violations       ${String(metrics.violations).padStart(3)}   (target = ${GROUNDING_VIOLATION_TARGET})`,
  );
  lines.push(`  rejected rephrases ${String(metrics.rejectedRephrases).padStart(3)}`);

  if (options?.verbose) {
    lines.push('');
    lines.push('All grounding cases');
    for (const result of results) {
      lines.push(
        `  ${result.id}  ${result.usedApprovedText ? 'approved text' : 'FAIL        '}  grounding ${result.groundingOk ? 'ok  ' : 'FAIL'}  ${result.question}`,
      );
      if (result.explanation) lines.push(`       ${result.explanation}`);
    }
  }

  const failures = results.filter((result) => !result.usedApprovedText || result.groundingOk);
  lines.push('');
  if (failures.length === 0) {
    lines.push('Grounding failures: none');
  } else {
    lines.push('Grounding failures');
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
  const devOnly = argv.includes('--dev-only');
  const devBaseline = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, 'baseline');
  const devCandidate = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, 'candidate');
  const legacyBaseline = runKbEval(APPROVED_CONTENT, EVAL_KB_CASES, 'baseline');
  const legacyCandidate = runKbEval(APPROVED_CONTENT, EVAL_KB_CASES, 'candidate');
  if (devOnly) {
    process.stdout.write(
      `${formatKbParaphraseDevReport(devBaseline, devCandidate)}\n\n` +
        `${formatKbReport(legacyBaseline)}\n\n${formatKbReport(legacyCandidate)}\n`,
    );
    return;
  }
  const testBaseline = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, 'baseline');
  const testCandidate = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, 'candidate');
  const holdoutReport = formatKbParaphraseTestReport(
    testBaseline,
    testCandidate,
    legacyCandidate,
    devCandidate,
  );
  const report = runRetrievalEval(APPROVED_CONTENT, EVAL_CASES);
  // The knowledge base lives only in the DEMO profile (pending MUSK sign-off),
  // so that is the profile the knowledge-base layer is measured on.
  const kbReport = legacyBaseline;
  // The grounding layer is measured on the approved profile: the LLM rephrase
  // is checked against the approved answer of the matched FAQ entry.
  const groundingReport = await runGroundingEval(APPROVED_CONTENT, EVAL_CASES);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          faq: report,
          kb: kbReport,
          kbCandidateLegacy: legacyCandidate,
          kbParaphraseDev: { baseline: devBaseline, candidate: devCandidate },
          kbParaphraseTest: { baseline: testBaseline, candidate: testCandidate },
          grounding: groundingReport,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  process.stdout.write(
      `${formatReport(report, { verbose, kb: kbReport, grounding: groundingReport })}\n\n` +
      `${formatKbReport(legacyCandidate)}\n\n` +
      `${formatKbParaphraseDevReport(devBaseline, devCandidate)}\n\n` +
      `${holdoutReport}\n`,
  );
}

// Zero import-time side effects: the CLI runs only when this module is the
// process entry point (npm run eval / tsx src/eval.ts).
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main(process.argv.slice(2));
}
