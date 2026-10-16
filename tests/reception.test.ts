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
  //    answer to the opening (not as a fresh query) and questionId is null for
  //    the opening. The turn sends no message of its own.
  it('la apertura queda armada: "Si" se recibe como respuesta, no como saludo', async () => {
    const agent = makeDemoAgent();
    const result = await agent.runTurn('Si');

    expect(result.capturedAnswer).toEqual({ questionId: null, text: 'Si' });
    expect(result.reply).toBe('');
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.records.some((record) => record.kind === 'answer')).toBe(true);
  });

  // 2. A qualification ask arms the reception: the next non-query message is
  //    captured as its answer (registered, never as a doubt) and the turn sends
  //    nothing — the next qualification question is the agent's message.
  it('tras una pregunta de cualificación, la respuesta se captura y no es duda', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('parto de cero');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'parto de cero' });
    expect(result.reply).toBe('');
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

  // 10. The reception turn sends no message of its own: the answer is recorded
  //     and the conversation continues with the next qualification question.
  //     This locks out the robot tell — one canned acknowledgement ("Gracias,
  //     lo apunto.") repeated identically as its own message on every answer.
  it('el turno de recepción no envía mensaje propio: sigue la siguiente pregunta', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('parto de cero');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'parto de cero' });
    expect(result.reply).toBe('');
    // Nothing was sent, so no outbound message is recorded: only the answer.
    expect(agent.records.map((record) => record.kind)).not.toContain('reply');
    // The ask is cleared, so the next question can be asked.
    expect(agent.nextQualificationQuestion()?.id).toBe('time-interest');
  });

  // 11. When the answered question was the LAST one, there is nothing left to
  //     ask and the agent proposes the call — the objective of the flow. The
  //     closing reuses the wording already approved (the same sentence the price
  //     answer closes with), so no new lead-facing copy is introduced (rule 11).
  it('al agotar las preguntas propone la llamada con la frase ya aprobada', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('starting-experience');
    await agent.runTurn('parto de cero');
    expect(armQualification(agent)).toBe('time-interest');

    const result = await agent.runTurn('lo antes posible');

    expect(result.capturedAnswer).toEqual({
      questionId: 'time-interest',
      text: 'lo antes posible',
    });
    expect(result.reply).toBe(buildReply('callProposal'));
    // Not new copy: it is the tail the price answer already ships.
    expect(buildReply('price').endsWith(buildReply('callProposal'))).toBe(true);
    const replies = agent.records.filter((record) => record.kind === 'reply');
    expect(replies).toHaveLength(1);
    expect(replies[0].detail).toBe(buildReply('callProposal'));
    expect(agent.nextQualificationQuestion()).toBeNull();
  });

  // 12. The closing is a QUESTION of its own (rule 9 counts a confirmed
  //     acceptance as a handoff): the message that follows it is its answer, and
  //     a plain "sI" to a yes/no question is that confirmation. Before this, the
  //     ask was lost and the lead was re-greeted with a message the agent had
  //     already sent.
  it('tras proponer la llamada, un "sI" se recibe como acuerdo y deriva (regla 9)', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('starting-experience');
    await agent.runTurn('parto de cero');
    expect(armQualification(agent)).toBe('time-interest');
    const proposal = await agent.runTurn('lo antes posible');
    expect(proposal.reply).toBe(buildReply('callProposal'));

    const answer = await agent.runTurn('sI');

    expect(answer.capturedAnswer).toEqual({ questionId: 'call-proposal', text: 'sI' });
    expect(answer.action).toBe('handoff');
    expect(answer.handoff?.reason).toBe('call_accepted');
    expect(answer.reply).toBe(buildReply('callAccepted'));
    // The lead is never sent the same line twice in a row.
    expect(answer.reply).not.toBe(proposal.reply);
  });

  // 13. A "no" to the call is a no to the CALL: no handoff, no pressure
  //     (rule 8) and never a rule 7 stop acknowledgement.
  it('un "no" a la propuesta de llamada no deriva y no presiona', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('starting-experience');
    await agent.runTurn('parto de cero');
    expect(armQualification(agent)).toBe('time-interest');
    const closing = await agent.runTurn('lo antes posible');
    expect(closing.reply).toBe(buildReply('callProposal'));

    const refusal = await agent.runTurn('no gracias');

    expect(refusal.capturedAnswer).toEqual({ questionId: 'call-proposal', text: 'no gracias' });
    expect(refusal.action).toBe('none');
    expect(refusal.reply).toBe(buildReply('decline'));
    expect(agent.isStopped).toBe(false);
  });

  // 14. No lead-facing message twice in a row: when the reply the engine would
  //     send is the one it just sent, the approved call sentence goes out
  //     instead. Repetition is the tell the client saw.
  it('no envía dos veces seguidas el mismo mensaje', async () => {
    const agent = makeDemoAgent();

    // The first message is received as the answer to the opening ask and the
    // turn sends nothing of its own.
    const opening = await agent.runTurn('xyz');
    expect(opening.reply).toBe('');

    const first = await agent.runTurn('xyz');
    expect(first.intent).toBe('unknown');
    expect(first.reply).toBe(buildReply('doubt'));

    const second = await agent.runTurn('xyz');
    expect(second.reply).toBe(buildReply('callProposal'));
    expect(second.reply).not.toBe(first.reply);
  });
});
