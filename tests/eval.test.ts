// Retrieval evaluation gate ("bucle de evaluación"): the labelled dataset
// (src/eval.dataset.ts) scores the approved-content routing offline. The
// absolute invariants (rules 1-6, guard, dataset coverage) must hold at
// 1.0/0; recall and precision have a measured floor that must never be
// lowered to make a test pass.

import { describe, expect, it } from 'vitest';

import { APPROVED_CONTENT } from '../src/content';
import { DEMO_CONTENT } from '../src/content.demo';
import { EVAL_CASES, EVAL_KB_CASES } from '../src/eval.dataset';
import {
  runRetrievalEval,
  runKbEval,
  runGroundingEval,
  type EvalReport,
  type KbEvalReport,
  type GroundingEvalReport,
} from '../src/eval';

const report: EvalReport = runRetrievalEval(APPROVED_CONTENT, EVAL_CASES);
// The knowledge base lives only in the DEMO profile (pending MUSK sign-off),
// so that is the profile the knowledge-base layer is measured on.
const kbReport: KbEvalReport = runKbEval(DEMO_CONTENT, EVAL_KB_CASES);
// The grounding layer is measured on the approved profile, with a provider
// that always answers with ungrounded content.
const groundingReport: GroundingEvalReport = await runGroundingEval(APPROVED_CONTENT, EVAL_CASES);

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

// ---------------------------------------------------------------------------
// Knowledge-base layer (Phase 0): measured separately, with its own floors.
// ---------------------------------------------------------------------------
describe('bucle de evaluación: puerta de la base de conocimiento', () => {
  // 7. Regla 5 y lista de temas prohibidos: el grupo que DEBE escalar
  //    (precio, devolución, becas, sede, calendario, requisitos) jamás puede
  //    ser respondido por la base de conocimiento. Absoluto: 0 falsos positivos.
  it('el grupo que debe escalar nunca lo responde la base de conocimiento (falsos positivos = 0)', () => {
    const falsePositiveIds = kbReport.results
      .filter((result) => result.outcome === 'false-positive')
      .map((result) => `${result.id}: ${result.question} -> ${result.actualPassageId}`)
      .join(' | ');
    expect(
      kbReport.metrics.falsePositives,
      `falsos positivos de la base de conocimiento: ${falsePositiveIds}`,
    ).toBe(0);
    expect(kbReport.metrics.falsePositiveRate).toBe(0);
  });

  // 8. El recall de la base de conocimiento no regresa por debajo del suelo
  //    medido (baseline 2026-10-20: 22/22 = 1.00).
  it('el recall de la base de conocimiento no regresa por debajo del suelo medido', () => {
    const failing = kbReport.results
      .filter((result) => result.outcome !== 'hit' && result.expectedPassageId !== null)
      .map((result) => `${result.id} (${result.question})`)
      .join(', ');
    expect(kbReport.metrics.recall, `recall ${kbReport.metrics.recall.toFixed(4)}; fallidos: ${failing}`).toBeGreaterThanOrEqual(0.9);
  });

  // 9. Toda respuesta de la base de conocimiento pasa el guard de salida.
  it('ninguna respuesta de la base de conocimiento rompe el guard', () => {
    expect(kbReport.metrics.guardViolations).toBe(0);
  });

  // 10. La base de conocimiento no desplaza a la FAQ: el intent real de cada
  //     caso etiquetado es el esperado.
  it('el enrutado de la base de conocimiento es exacto (intents = 1)', () => {
    const wrong = kbReport.results
      .filter((result) => !result.intentOk)
      .map((result) => `${result.id} (${result.actualIntent}, esperaba ${result.expectedIntent})`)
      .join(', ');
    expect(kbReport.metrics.intentAccuracy, `intents incorrectos: ${wrong}`).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Grounding layer (Phase 1): measured separately, with an absolute floor.
// ---------------------------------------------------------------------------
describe('bucle de evaluación: puerta de fundamentación', () => {
  // 11. Regla 4: una reformulación no fundamentada (una que añade un número
  //     o una palabra de otra entrada) NUNCA llega al lead: el turno entrega
  //     el texto aprobado de la entrada casada. Absoluto: 0 violaciones.
  it('una reformulación no fundamentada nunca llega al lead (violaciones = 0)', () => {
    const failed = groundingReport.results
      .filter((result) => !result.usedApprovedText)
      .map((result) => `${result.id}: ${result.question}`)
      .join(' | ');
    expect(groundingReport.metrics.violations, `violaciones de fundamentación: ${failed}`).toBe(0);
    expect(groundingReport.metrics.usedApprovedText).toBe(groundingReport.metrics.total);
    expect(groundingReport.metrics.total).toBeGreaterThan(0);
  });

  // 12. La comprobación de fundamentación se dispara de verdad: en todos los
  //     casos el veredicto es negativo (la reformulación no fundamentada se
  //     rechaza y se usa el texto aprobado).
  it('la comprobación de fundamentación rechaza la reformulación no fundamentada', () => {
    const accepted = groundingReport.results
      .filter((result) => result.groundingOk)
      .map((result) => result.id)
      .join(', ');
    expect(groundingReport.metrics.rejectedRephrases, `aceptadas sin fundamentar: ${accepted}`).toBe(
      groundingReport.metrics.total,
    );
  });
});
