// Floors of the RAG retrieval evaluation: the labelled knowledge-base dataset
// must keep its measured recall and zero false positives.

import { describe, expect, it } from 'vitest';

import { APPROVED_CONTENT } from '../src/content';
import {
  KB_PARAPHRASE_DEV_CASES,
  KB_PARAPHRASE_TEST_CASES,
  EVAL_KB_CASES,
} from '../src/eval.dataset';
import {
  KB_FALSE_POSITIVE_TARGET,
  KB_RECALL_TARGET,
  runKbEval,
  runKbParaphraseEval,
} from '../src/eval';

describe('bucle de evaluación: puerta de la base de conocimiento', () => {
  it('el grupo que debe escalar nunca lo responde la base (falsos positivos = 0)', () => {
    const report = runKbEval(APPROVED_CONTENT, EVAL_KB_CASES, 'baseline');
    expect(report.metrics.falsePositives).toBe(KB_FALSE_POSITIVE_TARGET);
  });

  it('el recall de la base no regresa por debajo del suelo medido', () => {
    const report = runKbEval(APPROVED_CONTENT, EVAL_KB_CASES, 'baseline');
    expect(report.metrics.recall).toBeGreaterThanOrEqual(KB_RECALL_TARGET);
  });

  it('ninguna respuesta de la base rompe el guard', () => {
    const report = runKbEval(APPROVED_CONTENT, EVAL_KB_CASES, 'baseline');
    expect(report.metrics.guardViolations).toBe(0);
  });
});

describe('bucle de evaluación: ablación léxica', () => {
  it('el candidato no introduce falsos positivos en los negativos de desarrollo', () => {
    const candidate = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_DEV_CASES, 'candidate');
    expect(candidate.metrics.falsePositives).toBe(0);
    expect(candidate.metrics.wrongTopPassage).toBe(0);
  });

  it('el candidato intercepta todos los temas protegidos', () => {
    const candidate = runKbParaphraseEval(APPROVED_CONTENT, KB_PARAPHRASE_TEST_CASES, 'candidate');
    expect(candidate.metrics.protectedIntercepted).toBe(candidate.metrics.protected);
  });
});
