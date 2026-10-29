// Knowledge-base layer: the deterministic retrieval over the approved
// knowledge base (src/kb.ts / src/retrieval.ts), and the RAG retrieval
// (retrieveTopK) the LLM-driven engine uses per turn.
//
// The gates under test are the ones that keep the hard rules true:
//   - no lead-facing answer contains a digit (no prices, amounts, salaries,
//     percentages, hour counts or durations);
//   - every answer passes the output guard (rules 1-4, 6);
//   - no answer mentions a forbidden topic;
//   - a passage is answered only when it clears BOTH thresholds;
//   - a question outside the knowledge base still escalates (rule 5).

import { describe, expect, it } from 'vitest';

import { APPROVED_CONTENT } from '../src/content';
import { KB_PARAPHRASE_DEV_CASES, KB_PARAPHRASE_TEST_CASES } from '../src/eval.dataset';
import { KB_PASSAGES, type KbPassage } from '../src/kb';
import { retrieve, retrieveTopK, MIN_BM25_SCORE, MIN_TERM_COVERAGE } from '../src/retrieval';
import { guardReply } from '../src/rules';
import { normalizeEs } from '../src/text';

const DIGIT = /\d/;

// Concepts that must never appear in a lead-facing knowledge-base answer.
const FORBIDDEN_TOPICS: { id: string; pattern: RegExp }[] = [
  { id: 'price', pattern: /\b(precio|precios|cuesta|cuestan|coste|costos|euros?|tarifas?|importes?|caro|barato|dinero|gratis|gratuita)\b|€/i },
  { id: 'financing', pattern: /\b(financia\w*|cuotas?|mensualidades?|becas?|subvenci\w*|descuentos?|promocion\w*|condiciones? de pago|forma de pago|intereses?|sin intereses)\b/i },
  { id: 'start-dates', pattern: /\b(fecha|convocatoria\w*|calendario|dedicaci\w*|duraci\w*|horas|meses|trimestres)\b/i },
  { id: 'refunds', pattern: /\b(devoluci\w*|reembols\w*|devuelve\w*|devuelvo)\b/i },
  { id: 'entry-requirements', pattern: /\b(requisitos|requisitos tecnicos|portatil|ordenador|equipo necesario)\b/i },
  { id: 'physical-location', pattern: /\b(sede|oficina|direcci\w*|ubicaci\w*)\b/i },
  { id: 'internship-conditions', pattern: /\b(remuneraci\w*|cuanto pagan|condiciones economicas)\b/i },
  { id: 'employment-promise', pattern: /\b(garantiza\w*\s+(un\s+)?(empleo|trabajo|puesto|plaza)|empleo garantizado|trabajo garantizado)\b/i },
  { id: 'detailed-syllabus', pattern: /\b(modulo|modulos|unidad|unidades|tema\s+\d|leccion\s+\d)\b/i },
];

function passage(id: string): KbPassage {
  const found = KB_PASSAGES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`passage not found: ${id}`);
  return found;
}

describe('knowledge base: the passages themselves', () => {
  it('has a unique id per passage and a provenance for each one', () => {
    const ids = KB_PASSAGES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of KB_PASSAGES) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.answer.trim().length).toBeGreaterThan(0);
      expect(entry.terms.length).toBeGreaterThan(0);
      if (entry.id === 'kb-obj-no-tiempo') {
        expect(entry.source).toContain('Nicolás');
        expect(entry.source).toContain('correo de Miguel');
      } else {
        expect(entry.source).toContain('escuela-musk-base-conocimiento.md');
      }
    }
  });

  it('has seven indexed synthetic development prompts for every passage', () => {
    for (const entry of KB_PASSAGES) {
      expect(entry.exampleQueries, `${entry.id} example query count`).toHaveLength(7);
      expect(new Set(entry.exampleQueries?.map(normalizeEs).values()).size, `${entry.id} unique prompts`).toBe(7);
    }
    expect(KB_PARAPHRASE_DEV_CASES.filter((entry) => entry.category === 'answerable')).toHaveLength(35 * 7);
  });

  it('keeps exactly three distinct held-out prompts per passage outside all indexed evidence', () => {
    const heldOut = KB_PARAPHRASE_TEST_CASES.filter((entry) => entry.category === 'answerable');
    expect(heldOut).toHaveLength(35 * 3);

    const heldOutByPassage = new Map<string, number>();
    for (const entry of heldOut) {
      const passageId = entry.expectedPassageId;
      expect(passageId).not.toBeNull();
      heldOutByPassage.set(passageId!, (heldOutByPassage.get(passageId!) ?? 0) + 1);
    }
    for (const entry of KB_PASSAGES) {
      expect(heldOutByPassage.get(entry.id), `${entry.id} held-out count`).toBe(3);
    }

    const indexed = new Set(KB_PASSAGES.flatMap((entry) => entry.exampleQueries ?? []).map(normalizeEs));
    const normalizedHoldout = heldOut.map((entry) => normalizeEs(entry.question));
    expect(new Set(normalizedHoldout).size).toBe(normalizedHoldout.length);
    for (const query of normalizedHoldout) {
      expect(indexed.has(query), `held-out query was indexed: ${query}`).toBe(false);
    }
  });

  it('uses only the approved passage answer as candidate retrieval output', () => {
    const query = passage('kb-metodo-practica').exampleQueries?.[0];
    expect(query).toBeDefined();
    const outcome = retrieve(KB_PASSAGES, query!, 'candidate');
    expect(outcome.match?.passage.id).toBe('kb-metodo-practica');
    expect(outcome.match?.passage.answer).toBe(passage('kb-metodo-practica').answer);
  });

  it('every answer passes the output guard (rules 1-4, 6)', () => {
    for (const entry of KB_PASSAGES) {
      const guard = guardReply(entry.answer);
      expect(
        guard.ok,
        `${entry.id}: ${guard.violations.map((violation) => violation.id).join(', ')}`,
      ).toBe(true);
    }
  });

  it('no answer contains a single digit (no prices, amounts, hours or percentages)', () => {
    for (const entry of KB_PASSAGES) {
      expect(DIGIT.test(entry.answer), `${entry.id} contains a digit: ${entry.answer}`).toBe(false);
    }
  });

  it('no answer mentions a forbidden topic', () => {
    for (const entry of KB_PASSAGES) {
      for (const topic of FORBIDDEN_TOPICS) {
        expect(
          topic.pattern.test(entry.answer),
          `${entry.id} mentions a forbidden topic (${topic.id}): ${entry.answer}`,
        ).toBe(false);
      }
    }
  });

  it('every answer is short enough for a WhatsApp message', () => {
    for (const entry of KB_PASSAGES) {
      expect(entry.answer.length, `${entry.id} is ${entry.answer.length} chars (max 260): ${entry.answer}`).toBeLessThanOrEqual(260);
    }
  });

  it('every answer is more than a stub', () => {
    for (const entry of KB_PASSAGES) {
      expect(entry.answer.length, `${entry.id} is ${entry.answer.length} chars (min 60): ${entry.answer}`).toBeGreaterThanOrEqual(60);
    }
  });

  it('every answer ends without a question mark (the agent asks its own question)', () => {
    for (const entry of KB_PASSAGES) {
      expect(
        entry.answer.trimEnd().endsWith('?'),
        `${entry.id} ends with a question mark: ${entry.answer}`,
      ).toBe(false);
    }
  });

  it('the unified profile carries the whole approved knowledge base', () => {
    expect(APPROVED_CONTENT.kb).toEqual(KB_PASSAGES);
  });

  it('the FAQ answers obey the same length cap as the knowledge base', () => {
    for (const entry of APPROVED_CONTENT.faq) {
      expect(entry.answer.length, `${entry.id} is ${entry.answer.length} chars (max 260): ${entry.answer}`).toBeLessThanOrEqual(260);
    }
  });
});

describe('knowledge base: the retrieval layer', () => {
  it('resolves a certification question to the ARP passage', () => {
    const outcome = retrieve(KB_PASSAGES, '¿me dan certificado de la UE?');
    expect(outcome.match).not.toBeNull();
    expect(outcome.match?.passage.id).toBe('kb-certificacion-arp');
  });

  it('resolves a question about publishing a game to the freelance passage', () => {
    const outcome = retrieve(KB_PASSAGES, 'quiero publicar un juego en Steam');
    expect(outcome.match).not.toBeNull();
    expect(outcome.match?.passage.id).toBe('kb-freelance');
  });

  it('a question outside the knowledge base returns no match', () => {
    const outcome = retrieve(KB_PASSAGES, 'quiero aprender cocina');
    expect(outcome.match).toBeNull();
    expect(outcome.refusal).toBe('below-threshold');
  });

  const PROGRAMME_CONTENT_PASSAGES: { programme: string; slug: string }[] = [
    { programme: 'python', slug: 'kb-python-' },
    { programme: 'front end', slug: 'kb-frontend-' },
    { programme: 'back end', slug: 'kb-backend-' },
    { programme: 'full stack', slug: 'kb-fullstack-' },
    { programme: 'videojuegos', slug: 'kb-videojuegos-' },
  ];

  const CONTENT_QUESTION_TEMPLATES: ((programme: string) => string)[] = [
    (programme) => `¿de qué trata el de ${programme}?`,
    (programme) => `¿de qué trata ${programme}?`,
    (programme) => `háblame de ${programme}`,
    (programme) => `¿en qué consiste ${programme}?`,
    (programme) => `¿qué se aprende en ${programme}?`,
    (programme) => `¿qué me enseñáis en ${programme}?`,
  ];

  for (const { programme, slug } of PROGRAMME_CONTENT_PASSAGES) {
    it.each(CONTENT_QUESTION_TEMPLATES.map((template) => [template(programme)]))(
      'answers "%s" from the same programme, never silence and never another course',
      (question) => {
        const outcome = retrieve(KB_PASSAGES, question);
        expect(outcome.refusal, `${question} must not escalate`).toBeNull();
        expect(outcome.match, `${question} must be answered`).not.toBeNull();
        expect(
          outcome.match?.passage.id.startsWith(slug),
          `${question} answered with ${outcome.match?.passage.id}`,
        ).toBe(true);
      },
    );
  }

  const STRONG_CONTENT_TEMPLATES: ((programme: string) => string)[] = [
    (programme) => `¿de qué trata el de ${programme}?`,
    (programme) => `¿de qué trata ${programme}?`,
    (programme) => `¿qué es el curso de ${programme}?`,
    (programme) => `¿de qué va el curso de ${programme}?`,
  ];

  for (const { programme, slug } of PROGRAMME_CONTENT_PASSAGES) {
    it.each(STRONG_CONTENT_TEMPLATES.map((template) => [template(programme)]))(
      'resolves the content question "%s" to the content passage',
      (question) => {
        const outcome = retrieve(KB_PASSAGES, question);
        expect(outcome.match?.passage.id, question).toBe(`${slug}contenido`);
      },
    );
  }

  it.each([
    '¿qué salidas tiene full stack?',
    '¿de qué puedo trabajar con python?',
    '¿en qué puedo trabajar si hago videojuegos?',
  ])('still routes the outcomes question "%s" to the outcomes passage', (question) => {
    const outcome = retrieve(KB_PASSAGES, question);
    expect(outcome.match?.passage.id, question).toMatch(/-salidas$/);
  });

  it('a forbidden topic never clears the thresholds (rule 5)', () => {
    for (const question of [
      '¿cuánto cuesta?',
      '¿me devolvéis el dinero si me arrepiento?',
      '¿hay becas o descuentos?',
      '¿tenéis una oficina física?',
      '¿hay calendario de convocatorias?',
      '¿cuánto dura el curso?',
      '¿cuántas horas lectivas son?',
      '¿cuándo empieza la próxima convocatoria?',
      '¿qué intereses y cuotas tiene el pago?',
      '¿qué condiciones de pago tengo para completar la formación?',
      '¿qué requisitos técnicos necesito?',
    ]) {
      const outcome = retrieve(KB_PASSAGES, question);
      expect(outcome.match, `${question} must not be answered`).toBeNull();
      expect(outcome.refusal).toBe('forbidden-topic');
    }
  });

  it('the explicitly approved completion window resolves to the time-objection passage', () => {
    const outcome = retrieve(KB_PASSAGES, '¿Cuánto tiempo tengo para completar la formación?');
    expect(outcome.match?.passage.id).toBe('kb-obj-no-tiempo');
    expect(outcome.refusal).toBeNull();
    expect(outcome.match?.passage.answer).toContain('dos años');
    expect(outcome.match?.passage.answer).not.toMatch(/\d/);
    expect(guardReply(outcome.match?.passage.answer ?? '').ok).toBe(true);
  });

  it('a match clears BOTH thresholds, and the outcome reports them', () => {
    const outcome = retrieve(KB_PASSAGES, '¿me dan certificado de la UE?');
    expect(outcome.thresholds.minScore).toBe(MIN_BM25_SCORE);
    expect(outcome.thresholds.minCoverage).toBe(MIN_TERM_COVERAGE);
    expect(outcome.match?.score).toBeGreaterThanOrEqual(MIN_BM25_SCORE);
    expect(outcome.match?.coverage).toBeGreaterThanOrEqual(MIN_TERM_COVERAGE);
  });

  it('is deterministic: the same question always gives the same passage', () => {
    const first = retrieve(KB_PASSAGES, '¿qué me recomendáis, Python o Full Stack?');
    const second = retrieve(KB_PASSAGES, '¿qué me recomendáis, Python o Full Stack?');
    expect(first.match?.passage.id).toBe(second.match?.passage.id);
    expect(first.match?.score).toBe(second.match?.score);
  });

  it('the knowledge base refuses a compensation question', () => {
    const outcome = retrieve(KB_PASSAGES, '¿Cuánto cobran en las prácticas?');
    expect(outcome.match).toBeNull();
    expect(outcome.refusal).toBe('forbidden-topic');
  });
});

describe('knowledge base: the RAG retrieval (retrieveTopK)', () => {
  it('returns the closest passages, ranked, for a known question', () => {
    const ranked = retrieveTopK(KB_PASSAGES, '¿qué se aprende en python?');
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]?.passage.id).toBe('kb-python-contenido');
  });

  it('returns nothing for a question with no content words', () => {
    const ranked = retrieveTopK(KB_PASSAGES, 'hola');
    expect(ranked).toEqual([]);
  });

  it('respects the requested k', () => {
    const ranked = retrieveTopK(KB_PASSAGES, '¿qué formaciones tenéis?', 3);
    expect(ranked.length).toBeLessThanOrEqual(3);
  });
});
