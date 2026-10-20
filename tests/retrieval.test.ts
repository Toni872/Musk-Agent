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
import { DEMO_CONTENT } from '../src/content.demo';
import { KB_PASSAGES, type KbPassage } from '../src/kb';
import { retrieve, MIN_BM25_SCORE, MIN_TERM_COVERAGE } from '../src/retrieval';
import { MuskAgent } from '../src/agent';
import { guardReply } from '../src/rules';

const DIGIT = /\d/;

// Concepts that must never appear in a lead-facing knowledge-base answer.
// Explicit and small on purpose: it is the mirror of the "no consta en la
// web" list of the source document.
const FORBIDDEN_TOPICS: { id: string; pattern: RegExp }[] = [
  { id: 'price', pattern: /\b(precio|precios|cuesta|cuestan|coste|costos|euros?|tarifas?|importes?|caro|barato|dinero|gratis|gratuita)\b|€/i },
  { id: 'financing', pattern: /\b(financia\w*|cuotas?|mensualidades?|becas?|subvenci\w*|descuentos?|promocion\w*|sin intereses)\b/i },
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
      expect(entry.source).toContain('escuela-musk-base-conocimiento.md');
    }
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

  it('the approved profile does NOT carry the knowledge base (pending sign-off)', () => {
    expect(APPROVED_CONTENT.kb).toBeUndefined();
    expect(DEMO_CONTENT.kb).toEqual(KB_PASSAGES);
  });

  it('the demo FAQ answers obey the same length cap as the knowledge base', () => {
    // The agent's voice is the product: this is a lead-capture agent on
    // WhatsApp, so a lead-facing answer that reads like a brochure loses the
    // lead instead of qualifying them. Same ceiling for both sources.
    for (const entry of DEMO_CONTENT.faq) {
      expect(entry.answer.length, `${entry.id} is ${entry.answer.length} chars (max 260): ${entry.answer}`).toBeLessThanOrEqual(260);
    }
  });

  it('the demo FAQ answers end without a question mark (the agent asks its own question)', () => {
    for (const entry of DEMO_CONTENT.faq) {
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

  it('resolves a question about publishing a game to the videojuegos passage', () => {
    const outcome = retrieve(KB_PASSAGES, 'quiero publicar un juego en Steam');
    expect(outcome.match).not.toBeNull();
    expect(outcome.match?.passage.id).toBe('kb-videojuegos-contenido');
  });

  it('a question outside the knowledge base returns no match', () => {
    const outcome = retrieve(KB_PASSAGES, 'quiero aprender cocina');
    expect(outcome.match).toBeNull();
    expect(outcome.refusal).toBe('below-threshold');
  });

  it('a forbidden topic never clears the thresholds (rule 5)', () => {
    for (const question of [
      '¿cuánto cuesta?',
      '¿me devolvéis el dinero si me arrepiento?',
      '¿hay becas o descuentos?',
      '¿tenéis una oficina física?',
      '¿hay calendario de convocatorias?',
      '¿qué requisitos técnicos necesito?',
    ]) {
      const outcome = retrieve(KB_PASSAGES, question);
      expect(outcome.match, `${question} must not be answered`).toBeNull();
      expect(outcome.refusal).toBe('forbidden-topic');
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

describe('knowledge base: the agent end to end', () => {
  it('answers a knowledge-base question with the passage and registers NO doubt', async () => {
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null });
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
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null });
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
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null });
    const result = await agent.runTurn('¿cuánto cuesta?');

    expect(result.intent).toBe('price');
    expect(result.reply).not.toContain('ARP');
    expect(result.reply).not.toContain('certificación');
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(false);
  });

  it('the approved profile (no knowledge base) behaves exactly as before', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null });
    const result = await agent.runTurn('¿me dan certificado de la UE?');

    expect(result.intent).toBe('unknown');
    expect(result.registeredDoubts.length).toBe(1);
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(false);
  });
});
