// Tests for the "answer reception" mechanism in the MUSK engine.
//
// The engine must tell apart an incoming message that is the ANSWER to the ask
// the agent just made from a fresh query it must answer. Before this existed,
// every message was classified as a fresh query, so a lead answering a
// qualification question received the rule 5 "no approved answer" reply — rule
// 5 applied to the WRONG KIND of message (an answer, not a question).
//
// All tests run offline: provider null, deterministic paths only.

import { describe, expect, it } from 'vitest';

import { MuskAgent, type LeadContact } from '../src/agent';
import { DEMO_CONTENT } from '../src/content.demo';
import { buildReply } from '../src/rules';

const lead: LeadContact = {
  id: 'lead-reception-001',
  contact: '+3460000002',
  bucket: 'ilocalizable',
};

function makeDemoAgent(): MuskAgent {
  return new MuskAgent({ content: DEMO_CONTENT, provider: null, lead });
}

// Arms a qualification ask and returns its id (the ask is the pending one).
function armQualification(agent: MuskAgent): string {
  const question = agent.nextQualificationQuestion();
  if (!question) throw new Error('expected an askable qualification question');
  return question.id;
}

describe('recepción de respuestas (answer reception)', () => {
  // 1. Opening armed: a bare affirmative first message is received as the
  //    answer to the opening, acknowledged with courtesy copy — NOT the social
  //    greeting — and questionId is null for the opening.
  it('la apertura queda armada: "Si" se recibe como respuesta, no como saludo', async () => {
    const agent = makeDemoAgent();
    const result = await agent.runTurn('Si');

    expect(result.capturedAnswer).toEqual({ questionId: null, text: 'Si' });
    expect(result.reply).toBe(buildReply('answerAck'));
    expect(result.reply).not.toBe(buildReply('social'));
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.records.some((record) => record.kind === 'answer')).toBe(true);
  });

  // 2. A qualification ask arms the reception: the next non-query message is
  //    captured as its answer (registered, never as a doubt).
  it('tras una pregunta de cualificación, la respuesta se captura y no es duda', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('parto de cero');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'parto de cero' });
    expect(result.reply).toBe(buildReply('answerAck'));
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toEqual([{ id, text: 'parto de cero' }]);
    expect(agent.records.some((record) => record.kind === 'answer')).toBe(true);
    expect(agent.records.some((record) => record.kind === 'doubt')).toBe(false);
  });

  // 3. RULE-1 REGRESSION: while a qualification ask is pending, a price
  //    question still gets the price template, registers no captured answer,
  //    and leaves the ask PENDING for the following non-query message.
  it('regla 1: una pregunta de precio no se captura y deja el ask pendiente', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const price = await agent.runTurn('¿cuánto cuesta?');
    expect(price.intent).toBe('price');
    expect(price.reply).toBe(buildReply('price'));
    expect(price.capturedAnswer).toBeUndefined();
    expect(price.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toHaveLength(0);

    // The ask stayed pending: the next non-query IS captured as its answer.
    const answer = await agent.runTurn('lo antes posible');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'lo antes posible' });
  });

  // 4. While a qualification ask is pending, a message matching an approved FAQ
  //    entry is answered from the FAQ (not swallowed as an answer) and the ask
  //    stays pending.
  it('una pregunta con respuesta aprobada se responde desde la FAQ y mantiene el ask', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const faq = await agent.runTurn('¿qué salidas tiene?');
    expect(faq.intent).toBe('general');
    expect(faq.capturedAnswer).toBeUndefined();
    expect(faq.registeredDoubts).toHaveLength(0);
    expect(faq.reply).toMatch(/junior|portafolio|equipo/i);
    expect(agent.qualificationAnswers).toHaveLength(0);

    const answer = await agent.runTurn('lo antes posible');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'lo antes posible' });
  });

  // 5. While a qualification ask is pending, a call-acceptance message (rule 9)
  //    still fires the handoff and is NOT captured.
  it('regla 9: una aceptación de llamada dispara el handoff y NO se captura', async () => {
    const agent = makeDemoAgent();
    armQualification(agent);

    const result = await agent.runTurn('me va bien una llamada');
    expect(result.intent).toBe('general');
    expect(result.action).toBe('handoff');
    expect(result.capturedAnswer).toBeUndefined();
    expect(agent.qualificationAnswers).toHaveLength(0);
  });

  // 6. Rule 7 still wins: a stop while an ask is pending stops the conversation
  //    and is NOT captured as an answer.
  it('regla 7: un stop con un ask pendiente detiene y NO se captura', async () => {
    const agent = makeDemoAgent();
    armQualification(agent);

    const result = await agent.runTurn('no me escribas más');
    expect(result.intent).toBe('stop');
    expect(result.action).toBe('stop');
    expect(result.registeredNoContinuar).toBe(true);
    expect(result.capturedAnswer).toBeUndefined();
    expect(agent.isStopped).toBe(true);
  });

  // 7. Full demo flow: the three scripted lead messages produce ZERO doubts and
  //    capture both qualification answers with the expected ids.
  it('flujo demo completo: cero dudas y ambas respuestas de cualificación capturadas', async () => {
    const agent = makeDemoAgent();
    const script = ['Si', 'parto de 0', 'lo antes posible'];
    const doubts: string[] = [];

    for (const message of script) {
      const result = await agent.runTurn(message);
      doubts.push(...result.registeredDoubts);
      agent.nextQualificationQuestion();
    }

    expect(doubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toEqual([
      { id: 'starting-experience', text: 'parto de 0' },
      { id: 'time-interest', text: 'lo antes posible' },
    ]);
    expect(agent.records.filter((record) => record.kind === 'answer')).toHaveLength(3);
    expect(agent.records.some((record) => record.kind === 'doubt')).toBe(false);
  });

  // 8. Rule 5 FIRST: a question the engine cannot answer, asked while a
  //    qualification ask is pending, must NOT be swallowed as the answer — it
  //    registers the doubt and leaves the ask pending.
  it('una pregunta sin respuesta aprobada no se captura: registra duda (regla 5)', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('¿tenéis campus en Valencia?');
    expect(result.intent).toBe('unknown');
    expect(result.capturedAnswer).toBeUndefined();
    expect(result.registeredDoubts).toHaveLength(1);
    expect(result.reply).toBe(buildReply('doubt'));
    expect(agent.qualificationAnswers).toHaveLength(0);
    expect(agent.records.some((record) => record.kind === 'doubt')).toBe(true);

    // The ask stayed pending: the next non-query IS captured as its answer.
    const answer = await agent.runTurn('parto de cero');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'parto de cero' });
  });

  // 9. reset() clears the captured answers and re-arms the opening ask.
  it('reset limpia las respuestas y vuelve a armar la apertura', async () => {
    const agent = makeDemoAgent();
    armQualification(agent);
    await agent.runTurn('parto de cero');
    expect(agent.qualificationAnswers).toHaveLength(1);

    agent.reset();

    expect(agent.qualificationAnswers).toHaveLength(0);
    const result = await agent.runTurn('Si');
    expect(result.capturedAnswer).toEqual({ questionId: null, text: 'Si' });
  });
});
