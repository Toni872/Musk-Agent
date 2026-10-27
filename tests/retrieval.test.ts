// Knowledge-base layer (Phase 0): the deterministic retrieval over the
// approved knowledge base (src/kb.ts / src/retrieval.ts).
//
// The gates under test are the ones that keep the hard rules true while the
// agent answers MORE questions than the hand-written FAQ could:
//   - no lead-facing answer contains a digit (no prices, amounts, salaries,
//     percentages, hour counts or durations);
//   - every answer passes the output guard (rules 1-4, 6);
//   - no answer mentions a forbidden topic;
//   - a passage is answered only when it clears BOTH thresholds;
//   - the agent answers with the passage, registers NO doubt, and records the
//     provenance; a question outside the knowledge base still escalates to
//     rule 5 exactly as before.

import { describe, expect, it } from 'vitest';

import { APPROVED_CONTENT } from '../src/content';
import { KB_PARAPHRASE_DEV_CASES, KB_PARAPHRASE_TEST_CASES } from '../src/eval.dataset';
import { classify } from '../src/intent';
import { KB_PASSAGES, type KbPassage } from '../src/kb';
import { retrieve, MIN_BM25_SCORE, MIN_TERM_COVERAGE } from '../src/retrieval';
import { MuskAgent } from '../src/agent';
import { guardReply } from '../src/rules';
import { normalizeEs } from '../src/text';

const DIGIT = /\d/;

// Concepts that must never appear in a lead-facing knowledge-base answer.
// Explicit and small on purpose: it is the mirror of the "no consta en la
// web" list of the source document.
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

  it('keeps protected development paraphrases on their hard-rule route before KB retrieval', () => {
    const protectedCases = KB_PARAPHRASE_DEV_CASES.filter((entry) => entry.category === 'protected');
    expect(protectedCases).toHaveLength(5);
    for (const entry of protectedCases) {
      expect(classify(entry.question, APPROVED_CONTENT, 'candidate'), entry.id).toBe(entry.expectedIntent);
    }
  });

  it('keeps held-out protected intents on their hard-rule route before KB retrieval', () => {
    const protectedCases = KB_PARAPHRASE_TEST_CASES.filter((entry) => entry.category === 'protected');
    expect(protectedCases).toHaveLength(5);
    for (const entry of protectedCases) {
      expect(classify(entry.question, APPROVED_CONTENT, 'candidate'), entry.id).toBe(entry.expectedIntent);
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
    // A lead reading 500 characters on WhatsApp does not qualify, they leave.
    // The cap is a ceiling, not a target: the answers aim at 140-220 chars.
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
    // Two questions in a row leave the lead unable to answer either one.
    for (const entry of KB_PASSAGES) {
      expect(
        entry.answer.trimEnd().endsWith('?'),
        `${entry.id} ends with a question mark: ${entry.answer}`,
      ).toBe(false);
    }
  });

  it('the unified profile carries the whole approved knowledge base', () => {
    // The DEMO base was promoted to the single profile, so the KB travels with
    // it: the agent's answers do not depend on which profile is loaded.
    expect(APPROVED_CONTENT.kb).toEqual(KB_PASSAGES);
  });

  it('the demo FAQ answers obey the same length cap as the knowledge base', () => {
    // The agent's voice is the product: this is a lead-capture agent on
    // WhatsApp, so a lead-facing answer that reads like a brochure loses the
    // lead instead of qualifying them. Same ceiling for both sources.
    for (const entry of APPROVED_CONTENT.faq) {
      expect(entry.answer.length, `${entry.id} is ${entry.answer.length} chars (max 260): ${entry.answer}`).toBeLessThanOrEqual(260);
    }
  });

  it('the demo FAQ answers end without a question mark (the agent asks its own question)', () => {
    for (const entry of APPROVED_CONTENT.faq) {
      expect(
        entry.answer.trimEnd().endsWith('?'),
        `${entry.id} ends with a question mark: ${entry.answer}`,
      ).toBe(false);
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

  // -------------------------------------------------------------------------
  // Programme-content questions, the class the lead actually writes on
  // WhatsApp ("¿de qué trata el de X?", "háblame de X", "¿en qué consiste X?").
  //
  // The contract these tests defend is NOT "the content passage always wins":
  // the passage ranking is BM25 and a longer content passage legitimately
  // loses the score tie against its own, shorter outcomes passage. What must
  // never happen is the three defects measured on 2026-10-27:
  //
  //  1. an answer about a DIFFERENT programme ("¿de qué trata el de python?"
  //     answered with the PCAP certification passage);
  //  2. silence (rule 5) for a programme the base does cover, which is what
  //     "¿de qué trata el de videojuegos?" did: score 3.43 against a 3.5 floor;
  //  3. the wrong topic for the strongest templates: "¿de qué trata…",
  //     "¿qué es el curso de…" and "¿de qué va el curso de…" ask about content,
  //     so they must reach the content passage, not the outcomes one.
  // -------------------------------------------------------------------------
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

  // The strongest templates carry a content word that only the content passage
  // has ("trata", "curso"), so the base can tell content from outcomes and must
  // pick content. "¿qué me enseñáis en X?" is deliberately NOT here: "enseña" is
  // shared by five passages, so on the two-word programmes the score tie is won
  // by the shorter outcomes passage. That is a ranking preference inside the
  // same programme, not a wrong answer, and the test above already forbids the
  // cases that matter (silence and another course).
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

  it.each(['los cursos pueden finanaciarse?', 'los cursos pueden finanaciar?'])(
    'rejects the observed financing transposition typo "%s" before scoring an answer',
    (question) => {
      const outcome = retrieve(KB_PASSAGES, question);

      expect(classify(question, APPROVED_CONTENT)).toBe('financiacion');
      expect(outcome.match).toBeNull();
      expect(outcome.refusal).toBe('forbidden-topic');
    },
  );

  it('the explicitly approved completion window resolves to the time-objection passage', () => {
    const outcome = retrieve(KB_PASSAGES, '¿Cuánto tiempo tengo para completar la formación?');

    expect(outcome.match?.passage.id).toBe('kb-obj-no-tiempo');
    expect(outcome.refusal).toBeNull();
    expect(outcome.match?.passage.answer).toContain('dos años');
    expect(outcome.match?.passage.answer).not.toMatch(/\d/);
    expect(guardReply(outcome.match?.passage.answer ?? '').ok).toBe(true);
  });

  it('does not use the completion-window exception for hours, start dates or payment terms', () => {
    for (const question of [
      '¿Cuántas horas lectivas son para completar la formación?',
      '¿Cuándo empieza el curso para completar la formación?',
      '¿Qué intereses y cuotas tengo para completar la formación?',
    ]) {
      const outcome = retrieve(KB_PASSAGES, question);
      expect(outcome.match, question).toBeNull();
      expect(outcome.refusal, question).toBe('forbidden-topic');
    }
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
});

describe('knowledge base: protected compensation questions', () => {
  const compensationQuestions = [
    '¿Cuánto cobran en las prácticas?',
    '¿Las prácticas son remuneradas?',
    '¿Cuánto se cobra en las prácticas?',
    '¿Cuánto pagan las prácticas?',
  ];

  it.each(compensationQuestions)(
    'escalates "%s" on both profiles instead of answering approved content',
    (question) => {
      expect(classify(question, APPROVED_CONTENT)).toBe('unknown');
      expect(classify(question, APPROVED_CONTENT)).toBe('unknown');
    },
  );

  it('the knowledge base refuses a compensation question', () => {
    const outcome = retrieve(KB_PASSAGES, '¿Cuánto cobran en las prácticas?');

    expect(outcome.match).toBeNull();
    expect(outcome.refusal).toBe('forbidden-topic');
  });

  it('does not over-block plain internship or requirements questions', () => {
    expect(classify('¿Hacéis prácticas?', APPROVED_CONTENT)).toBe('kb');
    // The approved FAQ wins over the base (it is the curated layer), so the
    // requirements entry answers it directly.
    expect(classify('¿me contáis los requisitos?', APPROVED_CONTENT)).toBe('general');
  });

  it('price keeps its own approved routing before the compensation gate', () => {
    expect(classify('¿Cuánto cuesta el curso?', APPROVED_CONTENT)).toBe('price');
  });
});

describe('knowledge base: the agent end to end', () => {
  it('answers the approved completion-window question from the time-objection passage', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
    const result = await agent.runTurn('¿Cuánto tiempo tengo para completar la formación?');

    expect(result.intent).toBe('kb');
    expect(result.reply).toBe(passage('kb-obj-no-tiempo').answer);
    expect(result.registeredDoubts).toEqual([]);
    expect(result.ruleViolations).toEqual([]);
  });

  it('hours, start-date and payment-term questions still escalate instead of using the KB', async () => {
    for (const question of [
      '¿cuántas horas lectivas son?',
      '¿cuándo empieza la próxima convocatoria?',
      '¿qué condiciones de pago tengo para completar la formación?',
    ]) {
      const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
      const result = await agent.runTurn(question);

      expect(result.intent, question).toBe('unknown');
      expect(result.registeredDoubts, question).toEqual([question]);
      expect(agent.records.some((record) => record.kind === 'kb' && record.detail.includes('kb ='))).toBe(false);
    }
  });

  it('answers a knowledge-base question with the passage and registers NO doubt', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
    const result = await agent.runTurn('¿me dan certificado de la UE?');

    expect(result.intent).toBe('kb');
    expect(result.reply).toBe(passage('kb-certificacion-arp').answer);
    expect(result.registeredDoubts).toEqual([]);
    expect(result.ruleViolations).toEqual([]);

    const provenance = agent.records.find((record) => record.kind === 'kb');
    expect(provenance).toBeDefined();
    expect(provenance?.kb?.passageId).toBe('kb-certificacion-arp');
    expect(provenance?.kb?.minScore).toBe(MIN_BM25_SCORE);
    expect(provenance?.kb?.minCoverage).toBe(MIN_TERM_COVERAGE);
    expect(provenance?.detail).toContain('kb = kb-certificacion-arp');
  });

  it('a question outside the knowledge base still escalates to rule 5', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
    const result = await agent.runTurn('¿me puedes mandar un informe en pdf?');

    expect(result.intent).toBe('unknown');
    expect(result.registeredDoubts.length).toBe(1);
    expect(result.reply).toContain('duda');

    // The escalation carries the closest passage, so the operator can see
    // what came closest without the lead ever seeing it.
    const provenance = agent.records.find((record) => record.kind === 'kb');
    expect(provenance?.detail).toContain('kb closest =');
  });

  it('a price question is answered by the approved price reply, never by the knowledge base', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
    const result = await agent.runTurn('¿cuánto cuesta?');

    expect(result.intent).toBe('price');
    expect(result.reply).not.toContain('ARP');
    expect(result.reply).not.toContain('certificación');
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Naming a programme changes WHO answers. The generic FAQ line covers the
// shapes that name nothing; once the lead writes the course down, that same
// shape is asking about that course and the brief explanation has to come from
// the course passage, not from the school-wide blurb. This is the behaviour the
// pilot demo depends on: the lead asks "¿en qué consiste X?" and gets X.
// ---------------------------------------------------------------------------
describe('knowledge base: a named programme outranks the generic FAQ', () => {
  const PROGRAMME_QUESTIONS: [string, string][] = [
    ['¿en qué consiste python?', 'kb-python-contenido'],
    ['¿en qué consiste el máster de videojuegos?', 'kb-videojuegos-contenido'],
    ['¿de qué trata el de videojuegos?', 'kb-videojuegos-contenido'],
    ['¿qué es el curso de front end?', 'kb-frontend-contenido'],
    ['¿de qué va el curso de back end?', 'kb-backend-contenido'],
    ['quiero información de python', 'kb-python-contenido'],
  ];

  it.each(PROGRAMME_QUESTIONS)('classifies "%s" as a knowledge-base answer', (question) => {
    expect(classify(question, APPROVED_CONTENT)).toBe('kb');
  });

  it('answers with the brief explanation of the named course', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
    const result = await agent.runTurn('¿en qué consiste python?');

    expect(result.intent).toBe('kb');
    expect(result.reply).toContain('Python');
    expect(result.registeredDoubts).toHaveLength(0);
  });

  // The guard that keeps the curated family answer: "programación" is a family,
  // not a programme, so it must NOT be answered with the video games master.
  it('keeps the family question in the curated catalogue copy', () => {
    expect(classify('¿de qué trata el de programación?', APPROVED_CONTENT)).toBe('general');
    expect(classify('¿qué cursos tenéis?', APPROVED_CONTENT)).toBe('general');
  });

  // And these name nothing, so the generic answer stays: true, short, and it
  // hands the detail to the call instead of guessing a course.
  it.each(['¿en qué consiste?', '¿de qué va el curso?', '¿de qué va el de videojuegos?'])(
    'keeps "%s" on the generic answer',
    (question) => {
      expect(classify(question, APPROVED_CONTENT)).toBe('general');
    },
  );

  it('still escalates a protected topic even when it names a programme', () => {
    expect(classify('¿cuánto cuesta python?', APPROVED_CONTENT)).toBe('price');
    expect(classify('¿qué condiciones de pago tiene python?', APPROVED_CONTENT)).toBe('unknown');
  });
});
