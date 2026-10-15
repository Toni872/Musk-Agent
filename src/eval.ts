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

import { EVAL_CASES, groupOf, type EvalCase } from './eval.dataset';
import type { ApprovedContent } from './content';
import { APPROVED_CONTENT } from './content';
import { classify, findApprovedAnswer, normalizeEs, type Intent } from './intent';
import { guardReply, HANDOFF_TRIGGERS } from './rules';

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
    const callAccepted = HANDOFF_TRIGGERS.callAccepted.test(normalizeEs(evalCase.question));
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

function fixed(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function formatReport(report: EvalReport, options?: { verbose?: boolean }): string {
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

  return lines.join('\n');
}

function main(argv: string[]): void {
  const verbose = argv.includes('--verbose');
  const asJson = argv.includes('--json');
  const report = runRetrievalEval(APPROVED_CONTENT, EVAL_CASES);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatReport(report, { verbose })}\n`);
}

// Zero import-time side effects: the CLI runs only when this module is the
// process entry point (npm run eval / tsx src/eval.ts).
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2));
}
