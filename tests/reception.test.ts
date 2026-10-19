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
import { APPROVED_CONTENT } from '../src/content';
import { DEMO_CONTENT } from '../src/content.demo';
import { buildReply, REPLY_TEMPLATES } from '../src/rules';

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

  // 15b. The single exception to that silence, and it is bookkeeping only (18-10):
  //      the copy of the human request asks for the phone and the notice to the
  //      commercial has to carry the contact so he can find the lead in the CRM
  //      (AGENTS.md). Nothing is sent, but the phone given after the handoff is
  //      registered instead of dropped. A turn without a phone changes nothing.
  it('tras la derivación por pedir humano, el teléfono que llega se registra sin responder', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const handoff = await agent.runTurn('quiero hablar con una persona');
    expect(handoff.action).toBe('handoff');
    expect(handoff.handoff?.reason).toBe('human_requested');
    const recordsAfterHandoff = agent.records.length;

    const lead = await agent.runTurn('mi movil es 687723287');
    expect(lead.reply).toBe('');
    expect(lead.suppressed).toBe(true);
    expect(agent.records).toHaveLength(recordsAfterHandoff + 1);
    expect(agent.records[agent.records.length - 1].kind).toBe('answer');
    expect(agent.records[agent.records.length - 1].detail).toContain('687723287');

    const other = await agent.runTurn('gracias');
    expect(other.reply).toBe('');
    expect(agent.records).toHaveLength(recordsAfterHandoff + 1);
  });

  // 15. After the handoff the agent stops writing: the lead is with a person, and
  //     a second voice (the social greeting, an acknowledgement) is what reads as
  //     a bot. The silence is deliberately marked (suppressed), never a lost turn.
  it('tras la derivación el agente deja de escribir', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('starting-experience');
    await agent.runTurn('parto de cero');
    expect(armQualification(agent)).toBe('time-interest');
    await agent.runTurn('lo antes posible');
    const accepted = await agent.runTurn('sI');
    expect(accepted.action).toBe('handoff');
    const recordsAfterHandoff = agent.records.length;

    const lead = await agent.runTurn('sI');

    expect(lead.reply).toBe('');
    expect(lead.suppressed).toBe(true);
    expect(agent.records).toHaveLength(recordsAfterHandoff);
    expect(agent.nextQualificationQuestion()).toBeNull();
  });
});

describe('recepción de respuestas a la propuesta de llamada (answer to call)', () => {
  // Arms the flow up to the call proposal: both qualification answers given,
  // the closing question sent, so the next lead message is RECEIVED as its
  // answer (pendingAsk = callProposal).
  async function armCallProposal(): Promise<MuskAgent> {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    return agent;
  }

  it('por las tardes → handoff call_accepted', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('por las tardes');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  it('sí, sobre las seis → handoff call_accepted', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('sí, sobre las seis');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  it('te dejo mi número, 612 345 678 → handoff call_accepted', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('te dejo mi número, 612 345 678');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  it('no puedo por la tarde → NOT handoff, doubt', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('no puedo por la tarde');
    expect(result.action).not.toBe('handoff');
    expect(result.action).toBe('none');
    expect(result.reply).toBe(buildReply('doubt'));
  });

  it('buenas tardes (answer) → NOT handoff', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('buenas tardes');
    expect(result.action).not.toBe('handoff');
  });

  it('lo antes posible (answer) → NOT handoff', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('lo antes posible');
    expect(result.action).not.toBe('handoff');
  });

  it('quiero hablar con una persona (answer) → human handoff', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('quiero hablar con una persona');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('human_requested');
  });

  it('me viene bien (answer) → handoff call_accepted', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    const result = await agent.runTurn('me viene bien');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
  });

  // Rule 9 regression: a date is NOT a phone number. The digits of two dates,
  // concatenated, contain a 9-digit window starting with 6/7/9 — the previous
  // detector joined every digit and falsely closed the deal. extractSpanishPhone
  // is strict: no contact cue, not a whole-message number → doubt (rule 5),
  // never a handoff.
  it('el 12/03/2027 y el 15/06/2027 → NO handoff: una fecha no es un teléfono', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('el 12/03/2027 y el 15/06/2027');

    expect(result.action).toBe('none');
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('el 12/03/2027 y el 15/06/2027');
    expect(result.ruleViolations).toHaveLength(0);
  });

  // F1 (answer path): a NEGATED acceptance fails acceptanceConfirmed, so it
  // IS receivable and now reaches receiveCallAnswer instead of closing the
  // deal from the fresh-message path (which is where it used to fire the
  // handoff and tell a refusing lead "te va bien la llamada"). Here
  // nonAvailability catches it: rule 5 doubt (register + human contact, no
  // pressure, rule 8), never the acceptance copy.
  it('no me viene bien (respuesta) → NO handoff: nonAvailability la lleva a la duda', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('no me viene bien');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('no me viene bien');
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // F1 (answer path): the negated "acepto" phrasing has no dedicated branch,
  // so it must land in the same rule 5 doubt fallback — never in a handoff.
  it('no acepto la llamada (respuesta) → NO handoff: duda de la regla 5', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('no acepto la llamada');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('no acepto la llamada');
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // F2: a moment scoped by a bare "no" must NOT close. DECISION: when in
  // doubt we do NOT close — the callAccepted copy promises a real person a
  // call (rule 9 counts a CONFIRMED acceptance only) and wrongly promising it
  // breaks rule 9, whereas the doubt path registers the doubt and offers a
  // human contact (the close is always human, AGENTS.md). This SUPERSEDES the
  // earlier decision that "no, mejor a las seis" closes with the acceptance
  // copy: it now goes to the doubt path.
  it('no, mejor a las seis → NO handoff: duda de la regla 5 (decisión corregida)', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('no, mejor a las seis');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('no, mejor a las seis');
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  it('no por las tardes → NO handoff: la negación anula el momento', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('no por las tardes');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('no por las tardes');
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  it('no el jueves → NO handoff: la negación anula el momento', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('no el jueves');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('no el jueves');
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  it('sí, pero no el jueves → NO handoff: el "no" posterior anula el momento', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('sí, pero no el jueves');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('sí, pero no el jueves');
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // F3: "cuando puedas" (the tuteo form) is a confirmed acceptance (rule 9)
  // through the answer path: handoff with the already-approved copy. It goes
  // through the fresh-message branch because acceptanceConfirmed keeps it out
  // of the answer path (a confirmed acceptance is never "received").
  it('cuando puedas (respuesta) → handoff call_accepted con el copy aprobado', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('cuando puedas');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // F3: a lead asking to be called IS an acceptance (rule 9), through the
  // same confirmed-acceptance path and the same approved copy.
  it('llamame (respuesta) → handoff call_accepted con el copy aprobado', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('llámame');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  it('llamadme (respuesta) → handoff call_accepted con el copy aprobado', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('llamadme, cuando podáis');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // The lead's raw text (the moment they gave) must reach the commercial
  // through the handoff payload, not just the template reply.
  it('el momento dado llega al comercial en lastMessage y summary', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('por las tardes');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.lastMessage).toBe('por las tardes');
    expect(result.handoff?.summary).toContain('por las tardes');
    expect(result.ruleViolations).toHaveLength(0);
  });

  // F4 (answer path): the negation guard recognises the negators that actually
  // negate a Spanish acceptance — `nunca`, `tampoco`, `jamas` (folded) and
  // `nada` — not only `no`. A negated acceptance is a REFUSAL (rule 9 counts
  // a CONFIRMED acceptance only), so none of these may close the deal with
  // the callAccepted copy. Each lands in the rule 5 doubt family with an
  // EXISTING REPLY_TEMPLATES value (rule 11: no new lead-facing copy).
  it('negadores ampliados (nunca/tampoco/jamas/nada) → NO handoff: duda de la regla 5', async () => {
    const blocked = [
      'nunca me viene bien',
      'tampoco me viene bien',
      'jamás me viene bien',
      'nunca por las tardes',
      'para nada me viene bien',
    ];
    for (const message of blocked) {
      const agent = await armCallProposal();
      const result = await agent.runTurn(message);

      expect(result.action, `"${message}" no debe derivar`).not.toBe('handoff');
      expect(result.handoff).toBeUndefined();
      expect(result.reply, `"${message}" debe reutilizar la plantilla de duda`).toBe(buildReply('doubt'));
      expect(result.reply).not.toBe(buildReply('callAccepted'));
      expect(result.registeredDoubts).toContain(message);
      expect(result.ruleViolations).toHaveLength(0);
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
    }
  });

  // F4 (trailing negation): the prefix guard only sees the text BEFORE the
  // trigger, so a bare negator at the very END used to close the deal. Only a
  // BARE trailing negator blocks ("me viene bien, no" / "me viene bien pero
  // no" — here caught by the whole-message negative answer trigger, which is
  // the same refusal). "no hay problema" is NOT a bare negator, so the
  // acceptance still closes — deliberately no filler-word allowance in the
  // suffix check.
  it('negación final suelta bloquea; un "no hay problema" final no cierra mal', async () => {
    for (const message of ['me viene bien, no', 'me viene bien pero no']) {
      const agent = await armCallProposal();
      const result = await agent.runTurn(message);

      expect(result.action, `"${message}" no debe derivar`).not.toBe('handoff');
      expect(result.handoff).toBeUndefined();
      expect(result.reply).not.toBe(buildReply('callAccepted'));
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
      expect(result.ruleViolations).toHaveLength(0);
    }

    const agent = await armCallProposal();
    const result = await agent.runTurn('sí, me viene bien, no hay problema');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.ruleViolations).toHaveLength(0);
  });

  // DECISION (locked, explicitly NOT a defect): handing over the contact IS
  // arranging the call (rule 9: the contact is what the call needs) and it
  // OVERRIDES a moment objection — each of these carries a negation and each
  // still closes with the approved copy. See the comment at the phone branch
  // in receiveCallAnswer; do not "fix" these to the doubt path.
  it('teléfono entregado pese a una objeción → handoff call_accepted (decisión, no defecto)', async () => {
    const phones = [
      'no, mi número es 612 345 678',
      'no el jueves, te dejo mi número 612 345 678',
      'no por las tardes, llámame al 612 345 678',
    ];
    for (const message of phones) {
      const agent = await armCallProposal();
      const result = await agent.runTurn(message);

      expect(result.action, `"${message}" debe derivar`).toBe('handoff');
      expect(result.handoff?.reason).toBe('call_accepted');
      expect(result.reply).toBe(buildReply('callAccepted'));
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
      expect(result.ruleViolations).toHaveLength(0);
    }
  });
});

// A question that arrives WITHOUT an interrogative sign used to be swallowed as
// the answer to the pending ask: the lead asked something and the agent took it
// as a reply to its own question. Reported against the demo profile with this
// exact message while the first qualification question was pending:
//   "de cero, cuentame mas sobre escuela musk"
// It fell to 'unknown' (no keyword matched "sobre escuela musk") and was
// captured as the answer to `starting-experience`, so the lead never got an
// answer. Rule 5 also depends on this: a question with no approved answer must
// register the doubt instead of being swallowed.
describe('preguntas sin signo de interrogación (questions without "?")', () => {
  const sobreMuskAnswer = DEMO_CONTENT.faq.find((entry) => entry.id === 'sobre-musk')!.answer;

  // The reported case, end to end.
  it('el caso reportado: "de cero, cuentame mas sobre escuela musk" se responde y NO se captura', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('de cero, cuentame mas sobre escuela musk');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(sobreMuskAnswer);
    expect(result.capturedAnswer).toBeUndefined();
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toHaveLength(0);

    // The ask stayed pending: the next plain message IS captured as its answer.
    const answer = await agent.runTurn('de cero');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'de cero' });
  });

  // Rule 5 for a question with no approved answer, and no '?' to reveal it.
  it('una pregunta sin respuesta aprobada registra la duda (regla 5) y deja el ask pendiente', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);
    const question = 'puedes decirme si teneis campus en Valencia';

    const result = await agent.runTurn(question);

    expect(result.intent).toBe('unknown');
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toEqual([question]);
    expect(result.capturedAnswer).toBeUndefined();
    expect(agent.qualificationAnswers).toHaveLength(0);

    const answer = await agent.runTurn('de cero');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'de cero' });
  });

  // Keyword coverage: the brand phrase must reach the approved presentation of
  // MUSK, not the broad 'informacion' entry (which used to win by accident when
  // only "dame informacion" matched).
  it('cobertura de palabras clave: "escuela musk" llega a la presentación de MUSK', async () => {
    for (const message of [
      'dame informacion sobre escuela musk',
      'cuentame mas sobre escuela musk',
      'hablame de la escuela musk',
    ]) {
      const agent = makeDemoAgent();
      const result = await agent.runTurn(message);

      expect(result.intent, `"${message}"`).toBe('general');
      expect(result.reply, `"${message}"`).toBe(sobreMuskAnswer);
    }
  });

  // The approved profile (what MUSK will actually run) routes the same way.
  it('el perfil aprobado también enruta "escuela musk" a la presentación de MUSK', async () => {
    const approvedAnswer = APPROVED_CONTENT.faq.find((entry) => entry.id === 'sobre-musk')!.answer;
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });

    const result = await agent.runTurn('cuentame mas sobre escuela musk');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(approvedAnswer);
  });

  // Precision: a free answer that merely reads as 'unknown' is still received.
  it('una respuesta normal sin "?" sigue capturándose (no se confunde con pregunta)', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);
    const text = 'de cero, sin experiencia en el sector';

    const result = await agent.runTurn(text);

    expect(result.capturedAnswer).toEqual({ questionId: id, text });
    expect(result.registeredDoubts).toHaveLength(0);
    expect(result.reply).toBe('');
  });
});

// Rule 9 (fresh-message path): a contact handed over in a turn with NO ask
// armed. Reported from a real trace of the demo profile: the lead answered the
// call proposal with something the engine could not place, the ask was
// consumed, and when he then typed his mobile number the agent answered the
// rule 5 doubt copy and registered the number as a doubt. No handoff fired,
// with the contact already written in the chat: the MVP's whole objective
// (get to a human call) failing. The acceptance is now recognised in the
// fresh-message path too.
describe('contacto entregado sin pregunta armada (fresh path)', () => {
  // Leaves the agent in the reported state: the call proposal answered, no ask
  // armed. 'depende' is documented to match nothing and stay in the rule 5
  // doubt family — it is setup, not the behaviour under test — and the doubt
  // reply now leaves the ask ARMED (the agent keeps listening; see the ask
  // invariant describe below), so the setup closes with a "no" to the call: the
  // decline copy asks nothing, so that answer leaves nothing armed either.
  async function armCallProposalThenLeaveNoAsk(): Promise<MuskAgent> {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    await agent.runTurn('depende');
    const declined = await agent.runTurn('no');
    expect(declined.reply).toBe(buildReply('decline'));
    return agent;
  }

  it('el móvil del lead cierra el handoff aunque no haya pregunta armada', async () => {
    const agent = await armCallProposalThenLeaveNoAsk();

    const result = await agent.runTurn('687723287');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.registeredDoubts).toHaveLength(0);
    expect(result.capturedAnswer).toBeUndefined();
    expect(result.ruleViolations).toHaveLength(0);
    // The number is not filed as a question the lead never asked.
    expect(agent.records.some((record) => record.kind === 'doubt' && record.detail.includes('687723287'))).toBe(false);
  });

  it('con la pista "mi número es ..." también cierra', async () => {
    const agent = await armCallProposalThenLeaveNoAsk();

    const result = await agent.runTurn('mi móvil es 687 723 287');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  // The same trap one step further: an invitation sent with no ask armed. If
  // the lead answers it with his number, it must still close.
  it('tras una invitación a la llamada sin ask armado, el móvil sigue cerrando', async () => {
    const agent = makeDemoAgent();
    await agent.runTurn('Si'); // the opening is answered; nothing is armed after
    await agent.runTurn('si');
    const repeated = await agent.runTurn('si'); // identical → replaced by the invitation
    expect(repeated.reply).toBe(buildReply('callProposal'));

    const result = await agent.runTurn('612345678');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
  });

  // Precedence: the mandatory informational answers (rules 1-3) are never
  // replaced by the acceptance copy, not even when the message carries a phone.
  it('una pregunta de precio con un móvil dentro sigue respondiendo el precio (regla 1)', async () => {
    const agent = await armCallProposalThenLeaveNoAsk();

    const result = await agent.runTurn('¿cuánto cuesta? Mi número es 612 345 678');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.reply).toBe(buildReply('price'));
  });

  // Rule 7 outranks the contact: a lead who asks to stop is not called.
  it('un stop con un móvil dentro detiene la conversación (regla 7)', async () => {
    const agent = await armCallProposalThenLeaveNoAsk();

    const result = await agent.runTurn('no me escribas más, mi número es 612 345 678');

    expect(result.action).toBe('stop');
    expect(result.handoff).toBeUndefined();
    expect(result.registeredNoContinuar).toBe(true);
  });
});

// The ask invariant: a message that ASKS the lead for the contact or a moment
// leaves the ask armed. Reported trace, step by step: after the call proposal
// the engine could not place the lead's answer, replied with the rule 5 doubt
// copy ("... ¿Te viene bien que te contacten para aclararlo?") — a QUESTION —
// and then armed nothing, so the lead's "si" was classified as a brand-new
// message and got the social greeting. The agent asked and stopped listening.
describe('la pregunta que el agente hace se queda escuchando (ask invariante)', () => {
  // Both qualification answers given and the call proposal sent: the next lead
  // message is received as its answer (pendingAsk = callProposal).
  async function armCallProposal(): Promise<MuskAgent> {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');
    agent.nextQualificationQuestion();
    await agent.runTurn('lo antes posible');
    return agent;
  }

  // The trace's own words: the engine could not place "mañana" as a moment
  // (availability needed an explicit context) and registered it as a doubt.
  it('"mañana" suelto cierra el handoff (la traza del cliente)', async () => {
    const agent = await armCallProposal();

    const result = await agent.runTurn('mañana');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  // The goodbye trap one line down: "hasta manana" carries the same word, and a
  // goodbye must never arrange a call (rule 9).
  it('"hasta mañana" NO cierra: es una despedida, no un momento', async () => {
    const agent = await armCallProposal();

    const result = await agent.runTurn('hasta mañana');

    expect(result.action).not.toBe('handoff');
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.registeredDoubts).toContain('hasta mañana');
  });

  it('el "sí" que responde a la duda cierra el handoff (regla 9)', async () => {
    const agent = await armCallProposal();
    const doubt = await agent.runTurn('depende');
    expect(doubt.reply).toBe(buildReply('doubt'));

    const result = await agent.runTurn('si');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
  });

  it('el móvil que responde a la duda cierra el handoff', async () => {
    const agent = await armCallProposal();
    await agent.runTurn('depende');

    const result = await agent.runTurn('687723287');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.handoff?.lastMessage).toBe('687723287');
  });

  // A guarded answer keeps priority over the armed ask: the price question is
  // NOT received as the call's answer (rule 1 copy is mandatory), and it does
  // not steal the ask either — the next message is still received as its answer.
  it('una pregunta de precio tras la duda conserva su respuesta y no roba el ask', async () => {
    const agent = await armCallProposal();
    await agent.runTurn('depende');

    const price = await agent.runTurn('cuánto cuesta?');
    expect(price.reply).toBe(buildReply('price'));
    expect(price.action).toBe('none');

    const accepted = await agent.runTurn('me viene bien');
    expect(accepted.action).toBe('handoff');
    expect(accepted.handoff?.reason).toBe('call_accepted');
  });

  // Repeat avoidance never beats answering: an approved answer that answers
  // what the lead asked is sent again instead of being replaced by the
  // invitation, which left the question unanswered (the "cuéntame más, ¿qué
  // cursos tienes?" report).
  it('una respuesta aprobada repetida se repite: no la sustituye la invitación', async () => {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('parto de cero');

    const first = await agent.runTurn('cuánto cuesta?');
    const second = await agent.runTurn('cuánto cuesta?');

    expect(first.reply).toBe(buildReply('price'));
    expect(second.reply).toBe(buildReply('price'));
    expect(second.reply).not.toBe(buildReply('callProposal'));
  });
});
