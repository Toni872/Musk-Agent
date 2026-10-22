// Tests for the ONE-outbound-message-per-turn composition (src/outbound.ts).
//
// The helper is the single place where the reply and the qualification question
// decide how they travel, so these tests pin the RULES. The parity test at the
// end drives the engine exactly as src/simulator.ts does (raw MuskAgent +
// composeTurnOutbound) and compares the result with what the UI view-model
// renders: the CLI and the browser must show the same single message.

import { describe, expect, it } from 'vitest';

import { MuskAgent } from '../src/agent';
import { DEMO_CONTENT } from '../src/content.demo';
import { composeTurnOutbound } from '../src/outbound';
import { buildReply, guardReply } from '../src/rules';
import { at } from './helpers';
import { createChat } from '../ui/chat';

const GOAL_QUESTION = DEMO_CONTENT.qualificationQuestions[0]!;
const CATALOG_ANSWER = DEMO_CONTENT.faq.find((entry) => entry.id === 'catalogo-formaciones')!.answer;

describe('un único mensaje saliente por turno (outbound)', () => {
  it('la respuesta y la pregunta viajan juntas, en ese orden', () => {
    const outbound = composeTurnOutbound(CATALOG_ANSWER, GOAL_QUESTION);

    expect(outbound.merged).toBe(true);
    expect(outbound.text).toBe(`${CATALOG_ANSWER} ${GOAL_QUESTION.text}`);
    expect(outbound.text.indexOf(CATALOG_ANSWER)).toBe(0);
    expect(outbound.text.endsWith(GOAL_QUESTION.text)).toBe(true);
    // One question at a time, and it is still sendable copy.
    expect(outbound.text.match(/\?/g)).toHaveLength(1);
    expect(outbound.text.length).toBeLessThan(300);
    expect(outbound.text).not.toMatch(/\d/);
    expect(guardReply(outbound.text).ok).toBe(true);
  });

  // Single-question rule: a reply that already asks something keeps its own
  // question and the ask travels as its own message. Nothing is appended.
  it('una respuesta que ya termina en interrogación no recibe la pregunta encima', () => {
    const askedReply = 'El equipo lo confirma en una llamada. ¿Te viene bien por la tarde?';
    const outbound = composeTurnOutbound(askedReply, GOAL_QUESTION);

    expect(outbound.merged).toBe(false);
    expect(outbound.text).toBe(askedReply);
    expect(outbound.text).not.toContain(GOAL_QUESTION.text);
    expect(outbound.text.match(/\?/g)).toHaveLength(1);
  });

  // A received answer sends no reply of its own: the question IS the message.
  it('sin respuesta propia, el mensaje del turno es la pregunta', () => {
    const outbound = composeTurnOutbound('', GOAL_QUESTION);

    expect(outbound.merged).toBe(false);
    expect(outbound.text).toBe(GOAL_QUESTION.text);
  });

  it('sin pregunta pendiente, el mensaje es la respuesta tal cual', () => {
    const outbound = composeTurnOutbound(CATALOG_ANSWER, null);

    expect(outbound.merged).toBe(false);
    expect(outbound.text).toBe(CATALOG_ANSWER);
  });

  it('un turno suprimido no produce ningún mensaje saliente', () => {
    expect(composeTurnOutbound('', null).text).toBe('');
  });

  // Defense in depth: the agent guards each half on its own, but joining them
  // produces a NEW string, so it is re-checked. (Such a question would already
  // be refused by nextQualificationQuestion, which is exactly why this path is a
  // belt-and-braces check and not a normal outcome.)
  it('una composición que rompa el guardián NO se envía unida', () => {
    expect(guardReply('El programa cuesta 500').ok).toBe(true);
    const outbound = composeTurnOutbound('El programa cuesta 500', {
      id: 'invented',
      text: 'euros al mes?',
      purpose: 'test',
    });

    expect(outbound.merged).toBe(false);
    expect(outbound.text).toBe('El programa cuesta 500');
    expect(guardReply(outbound.text).ok).toBe(true);
  });

  // Functional parity between the two surfaces. src/simulator.ts drives the
  // agent exactly like this: runTurn, then nextQualificationQuestion, then
  // composeTurnOutbound. The UI must show that same single message.
  it('el CLI y la UI componen el mismo mensaje único', async () => {
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null });

    const result = await agent.runTurn('Sí, me interesa. Dame información sobre los cursos.');
    const ask = agent.nextQualificationQuestion();
    const cliText = composeTurnOutbound(result.reply, ask).text;

    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Sí, me interesa. Dame información sobre los cursos.');
    const bubbles = state.messages.filter((message) => message.role === 'agent');

    expect(at(bubbles, 1).text).toBe(cliText);
    expect(cliText).toBe(`${CATALOG_ANSWER} ${GOAL_QUESTION.text}`);
    // The ask is armed exactly as before on both surfaces.
    expect(ask?.id).toBe('goal');
    const answer = await agent.runTurn('el curso de full stack');
    expect(answer.capturedAnswer).toEqual({ questionId: 'goal', text: 'el curso de full stack' });
  });

  // The rule-5 doubt path keeps its behaviour: the doubt reply asks the lead
  // something, so no qualification question is stacked on top of it.
  it('tras una duda no se apila la pregunta de cualificación', async () => {
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null });

    const result = await agent.runTurn('¿tienen piscina?');
    expect(result.reply).toBe(buildReply('doubt'));

    expect(agent.nextQualificationQuestion()).toBeNull();
    expect(composeTurnOutbound(result.reply, null).text).toBe(result.reply);
    expect(composeTurnOutbound(result.reply, GOAL_QUESTION).text).toBe(result.reply);
  });
});