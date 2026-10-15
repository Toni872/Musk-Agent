// Retrieval evaluation gate ("bucle de evaluación"): the labelled dataset
// (src/eval.dataset.ts) scores the approved-content routing offline. The
// absolute invariants (rules 1-6, guard, dataset coverage) must hold at
// 1.0/0; recall and precision have a measured floor that must never be
// lowered to make a test pass.

import { describe, expect, it } from 'vitest';

import { APPROVED_CONTENT } from '../src/content';
import { EVAL_CASES } from '../src/eval.dataset';
import { runRetrievalEval, type EvalReport } from '../src/eval';

const report: EvalReport = runRetrievalEval(APPROVED_CONTENT, EVAL_CASES);

function failingIds(): string {
  return report.results
    .filter((result) => result.outcome !== 'hit' && result.outcome !== 'correct-null')
    .map((result) => result.id)
    .join(', ');
}

function intentFailures(): string {
  return report.results
    .filter((result) => !result.intentOk)
    .map((result) => `${result.id} (${result.actualIntent}, esperaba ${result.expectedIntent})`)
    .join(', ');
}

describe('bucle de evaluación: retrieval gate', () => {
  // 1. Reglas 1-3: un tema prohibido (precio, temario, financiación) jamás
  //    puede alcanzar una respuesta FAQ aprobada. Absoluto: 0 falsos positivos.
  it('ningún tema prohibido alcanza una respuesta aprobada (falsos positivos = 0)', () => {
    const falsePositiveIds = report.results
      .filter((result) => result.outcome === 'false-positive')
      .map((result) => `${result.id}: ${result.question} -> ${result.actualAnswerId}`)
      .join(' | ');
    expect(report.metrics.falsePositives, `falsos positivos: ${falsePositiveIds}`).toBe(0);
  });

  // 2. Reglas 1-4 y 6: toda respuesta FAQ efectivamente devuelta pasa el guard
  //    de salida (sin importes, porcentajes, módulos, promociones ni promesas).
  it('ninguna respuesta devuelta rompe el guard de salida (violaciones = 0)', () => {
    const violationIds = report.results
      .filter((result) => !result.guardOk)
      .map((result) => `${result.id}: ${result.violations.map((violation) => violation.id).join(',')}`)
      .join(' | ');
    expect(report.metrics.guardViolations, `guard violado en: ${violationIds}`).toBe(0);
  });

  // 3. Reglas 1-2: el enrutado de los temas prohibidos (C23-C31) es exacto,
  //    palabra por palabra con el intent esperado del dataset.
  it('el enrutado de temas prohibidos es exacto (C23-C31, precisión de intent = 1)', () => {
    const forbidden = report.results.filter((result) => {
      const number = Number(result.id.slice(1));
      return number >= 23 && number <= 31;
    });
    expect(forbidden).toHaveLength(9);
    const accuracy = forbidden.filter((result) => result.intentOk).length / forbidden.length;
    expect(accuracy, `intents incorrectos en temas prohibidos: ${intentFailures()}`).toBe(1);
  });

  // 4. El recall no regresa: suelo = último valor medido. Baseline 2026-10-15 =
  //    18/22 (0.8181...); tras cerrar las paráfrasis sin palabra clave (C19-C22,
  //    C34-C35) el enrutado da 22/22, así que el suelo sube a 1.00. Subirlo según
  //    mejore el enrutado, nunca bajarlo.
  it('el recall no regresa por debajo del suelo medido', () => {
    // floor = last measured value (0.81 baseline 2026-10-15 -> 1.00 after the fix)
    expect(
      report.metrics.recall,
      `recall ${report.metrics.recall.toFixed(4)}; casos fallidos: ${failingIds()}`,
    ).toBeGreaterThanOrEqual(1.0);
  });

  // 5. La precisión no regresa: suelo = baseline medido el 2026-10-15 (1.00).
  it('la precisión no regresa por debajo del suelo medido', () => {
    // floor = measured baseline on 2026-10-15; raise as the routing improves
    expect(
      report.metrics.precision,
      `precisión ${report.metrics.precision.toFixed(4)}; falsos positivos/wrong answers en: ${failingIds()}`,
    ).toBeGreaterThanOrEqual(1.0);
  });

  // 6. El dataset no se puede encoger sin que se note: cada respuesta aprobada
  //    (FaqEntry.id) debe aparecer como expectativa al menos una vez.
  it('el dataset cubre las 9 respuestas aprobadas', () => {
    const covered = new Set(
      EVAL_CASES.map((evalCase) => evalCase.expectedAnswerId).filter((id): id is string => id !== null),
    );
    const missing = APPROVED_CONTENT.faq
      .map((entry) => entry.id)
      .filter((id) => !covered.has(id));
    expect(missing, `FAQ sin caso de evaluación: ${missing.join(', ')}`).toEqual([]);
  });
});
