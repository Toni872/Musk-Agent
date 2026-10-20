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
import { KB_PASSAGES, type KbPassage } from '../src/kb';
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

// The close this profile ships (a profile without one falls back to the
// approved sentence in REPLY_TEMPLATES).
function demoClosing(): string {
  return DEMO_CONTENT.closingInvitation ?? buildReply('callProposal');
}

// The reaction this profile ships for a given answer of a given question.
function demoReaction(questionId: string, index: number): string {
  const question = DEMO_CONTENT.qualificationQuestions.find((item) => item.id === questionId);
  return question?.reactions?.[index]?.say ?? '';
}

// The approved answer of a knowledge-base passage, looked up by id (never
// hardcoded in the test).
function passageAnswer(id: string): string {
  const found = KB_PASSAGES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`passage not found: ${id}`);
  return found.answer;
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
  //    captured as its answer (registered, never as a doubt) and the turn
  //    answers with the reaction matched to THAT answer (content.reactions).
  it('tras una pregunta de cualificación, la respuesta se captura y no es duda', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('parto de cero');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'parto de cero' });
    expect(result.reply).toBe(demoReaction('starting-experience', 0));
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

  // 10. The reception turn reacts to what the lead actually said, and the
  //     reaction is specific to THAT answer: a different answer gets a different
  //     line. This is what replaced the old silence — a single fixed courtesy
  //     message ("Gracias, lo apunto.") repeated on every answer is the robot
  //     tell, so the reaction is content-driven instead (rule 11: MUSK copy).
  //     The next qualification question still travels as its own message.
  it('el turno de recepción reacciona a lo que dijo el lead y sigue con la pregunta', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('parto de cero');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'parto de cero' });
    expect(result.reply).toBe(demoReaction('starting-experience', 0));
    expect(agent.records.filter((record) => record.kind === 'reply')).toHaveLength(1);

    // The other answer to the same question gets a DIFFERENT line.
    const other = makeDemoAgent();
    armQualification(other);
    const withExperience = await other.runTurn('he tocado algo de programación');
    expect(withExperience.reply).toBe(demoReaction('starting-experience', 1));
    expect(withExperience.reply).not.toBe(result.reply);

    // The ask is cleared, so the next question can still be asked.
    expect(agent.nextQualificationQuestion()?.id).toBe('time-interest');
  });

  // 11. When the answered question was the LAST one, there is nothing left to
  //     ask and the agent proposes the call — the objective of the flow. The
  //     reaction to that last answer opens the message and the profile's own
  //     close follows it (content.closingInvitation). A profile without its own
  //     close falls back to the sentence already approved for that moment, so no
  //     lead-facing copy is invented at runtime (rule 11).
  it('al agotar las preguntas propone la llamada con la reacción y el cierre del perfil', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('starting-experience');
    await agent.runTurn('parto de cero');
    expect(armQualification(agent)).toBe('time-interest');

    const result = await agent.runTurn('lo antes posible');

    expect(result.capturedAnswer).toEqual({
      questionId: 'time-interest',
      text: 'lo antes posible',
    });
    expect(result.reply).toBe(`${demoReaction('time-interest', 0)} ${demoClosing()}`);
    // The fallback sentence is still the tail the price answer already ships.
    expect(buildReply('price').endsWith(buildReply('callProposal'))).toBe(true);
    const replies = agent.records.filter((record) => record.kind === 'reply');
    // The last outbound message is the closing; the earlier one was the reaction
    // to the first answer.
    expect(replies[replies.length - 1].detail).toBe(result.reply);
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
    expect(proposal.reply).toBe(`${demoReaction('time-interest', 0)} ${demoClosing()}`);

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
    expect(closing.reply).toBe(`${demoReaction('time-interest', 0)} ${demoClosing()}`);

    const refusal = await agent.runTurn('no gracias');

    expect(refusal.capturedAnswer).toEqual({ questionId: 'call-proposal', text: 'no gracias' });
    expect(refusal.action).toBe('none');
    expect(refusal.reply).toBe(buildReply('decline'));
    expect(agent.isStopped).toBe(false);
  });

  // 14. No lead-facing message twice in a row: when the reply the engine would
  //     send is the one it just sent, a variant goes out instead. For a rule 5
  //     doubt that variant is the approved follow-up acknowledgement — swapping
  //     in the bare call sentence left the lead's second question visibly
  //     unacknowledged, which is the tell the client saw.
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
    expect(second.reply).toBe(DEMO_CONTENT.doubtFollowup);
    expect(second.reply).not.toBe(first.reply);
  });

  // 15b. The single exception to that silence, and it is bookkeeping only (18-10):
  //      the copy of the human request asks for the phone and the notice to the
  //      commercial has to carry the contact so he can find the lead in the CRM
  //      (AGENTS.md). Nothing is sent, but the phone given after the handoff is
  //      registered instead of dropped. Since D5, EVERY post-handoff message is
  //      registered (the agreed moment usually arrives late).
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
    // Every post-handoff message is now registered (D5): the agreed moment
    // usually arrives late and the commercial must learn it.
    expect(agent.records).toHaveLength(recordsAfterHandoff + 2);
    expect(agent.records[agent.records.length - 1].detail).toBe('after the handoff: "gracias"');
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
    // The silence is unchanged, but the message is no longer dropped: it is
    // registered so the commercial sees what the lead said after the handoff.
    expect(agent.records).toHaveLength(recordsAfterHandoff + 1);
    expect(agent.records[agent.records.length - 1].detail).toBe('after the handoff: "sI"');
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

  // Spec §3.3 / §8.2: the commercial must arrive with the lead's qualification
  // answers, not only with the reason the handoff fired. Full DEMO flow: answer
  // both qualification questions, then accept the call.
  it('la derivación completa lleva formación, respuestas y último mensaje al comercial', async () => {
    const agent = await armCallProposal();
    const lastMessage = 'sí, llámame cuando queráis';

    const result = await agent.runTurn(lastMessage);
    const handoff = result.handoff;

    expect(result.action).toBe('handoff');
    expect(handoff).toBeDefined();
    expect(handoff?.formation).toBe(DEMO_CONTENT.formationName);
    expect(handoff?.qualification).toEqual([
      { question: DEMO_CONTENT.qualificationQuestions[0].text, answer: 'parto de cero' },
      { question: DEMO_CONTENT.qualificationQuestions[1].text, answer: 'lo antes posible' },
    ]);
    expect(handoff?.doubts).toEqual([]);
    expect(handoff?.lastMessage).toBe(lastMessage);
    expect(handoff?.summary.startsWith(DEMO_CONTENT.formationName)).toBe(true);
    expect(handoff?.summary).toContain('aceptó la llamada');
    expect(handoff?.summary).toContain(
      `${DEMO_CONTENT.qualificationQuestions[0].text} → parto de cero`,
    );
    expect(handoff?.summary).toContain(
      `${DEMO_CONTENT.qualificationQuestions[1].text} → lo antes posible`,
    );
    expect(handoff?.summary).toContain('Dudas registradas: ninguna');
    expect(handoff?.summary.endsWith(lastMessage)).toBe(true);
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
    // Still captured (not a question) and answered with the matched reaction.
    expect(result.reply).toBe(demoReaction('starting-experience', 0));
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

  // An invitation that has been sent must stay listening. Before, a bare "si"
  // with nothing armed got the social greeting, and the repeat replacement then
  // sent the invitation WITHOUT arming it, so what came next fell through. Now
  // the "si" proposes the call itself (approved copy), the ask is armed by the
  // tail, and the next turn is received as its answer.
  it('tras la apertura, un "si" sin ask armado propone la llamada y se queda escuchando', async () => {
    const agent = makeDemoAgent();
    await agent.runTurn('Si'); // the opening is answered; nothing is armed after

    const proposed = await agent.runTurn('si');
    expect(proposed.reply).toBe(buildReply('callProposal'));
    expect(proposed.action).toBe('none');

    const accepted = await agent.runTurn('si');
    expect(accepted.action).toBe('handoff');
    expect(accepted.handoff?.reason).toBe('call_accepted');
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

// Reportado desde la UI con el perfil REAL: la respuesta aprobada de la FAQ
// termina ofreciendo la llamada ("...o lo vemos con detalle en una llamada sin
// compromiso") y el lead contestaba "si". Como no había ningún ask armado,
// "si" se clasificaba como mensaje nuevo y recibía el saludo social: el lead
// confirmaba algo y el agente volvía a presentarse.
describe('un "si" suelto avanza el flujo, no vuelve a saludar', () => {
  it('tras una respuesta de FAQ, "si" propone la llamada y el siguiente "si" deriva', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });

    const query = await agent.runTurn('informacion');
    expect(query.intent).toBe('general');

    const yes = await agent.runTurn('si');
    expect(yes.reply).toBe(buildReply('callProposal'));
    expect(yes.reply).not.toBe(buildReply('social'));
    expect(yes.action).toBe('none');

    const accepted = await agent.runTurn('si');
    expect(accepted.action).toBe('handoff');
    expect(accepted.handoff?.reason).toBe('call_accepted');
  });

  it('un "no" suelto se registra como duda (regla 5) y no saluda', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });

    await agent.runTurn('informacion');
    const no = await agent.runTurn('no');

    expect(no.reply).toBe(buildReply('decline'));
    expect(no.reply).not.toBe(buildReply('social'));
    expect(no.registeredDoubts).toContain('no');
    expect(no.action).toBe('none');
  });

  it('un saludo de verdad sigue recibiendo el saludo social', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });

    const hello = await agent.runTurn('hola');
    expect(hello.reply).toBe(buildReply('social'));
  });
});

// Financing reflexive/enclitic coverage (the `\bfinanciar\b` gap), the approved
// follow-up variant for a second consecutive rule-5 doubt, and the new demo
// content from the KB (catalog and enriched modality/location).
describe('financiación reflexiva, duda seguida y contenidos demo (KB)', () => {
  // Regression: "¿Los cursos pueden financiarse?" classified 'unknown' because
  // the financing regex had no reflexive form. It must get the mandatory rule 3
  // copy, and the pending opening ask must not capture it (guarded intents are
  // never receivable answers).
  it('financiación reflexiva: "¿Los cursos pueden financiarse?" clasifica financiacion', async () => {
    const agent = makeDemoAgent();

    const result = await agent.runTurn('¿Los cursos pueden financiarse?');

    expect(result.intent).toBe('financiacion');
    expect(result.reply).toBe(buildReply('financing'));
    expect(result.capturedAnswer).toBeUndefined();
    expect(result.registeredDoubts).toHaveLength(0);
  });

  // Two consecutive rule-5 doubts: the second gets the approved follow-up
  // variant, never the bare contact-ask (that swap left the lead's question
  // visibly unacknowledged). Both doubts stay registered for the handoff.
  it('dos dudas seguidas: la segunda recibe la variante aprobada, no la invitación', async () => {
    const agent = makeDemoAgent();

    const first = await agent.runTurn('¿tienen piscina?');
    expect(first.intent).toBe('unknown');
    expect(first.reply).toBe(buildReply('doubt'));

    const second = await agent.runTurn('¿me lo dices en ingles?');
    expect(second.intent).toBe('unknown');
    expect(second.reply).toBe(DEMO_CONTENT.doubtFollowup);
    expect(second.reply).not.toBe(buildReply('callProposal'));

    const handoff = await agent.runTurn('quiero hablar con una persona');
    expect(handoff.action).toBe('handoff');
    expect(handoff.handoff?.doubts).toEqual(['¿tienen piscina?', '¿me lo dices en ingles?']);
  });

  // Demo catalog entry (KB): the question routes to the new FAQ answer.
  it('catálogo demo: "Que cursos teneis?" responde con la entrada catalogo-formaciones', async () => {
    const expected = DEMO_CONTENT.faq.find((entry) => entry.id === 'catalogo-formaciones')!.answer;
    const agent = makeDemoAgent();

    const result = await agent.runTurn('Que cursos teneis?');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(expected);
    expect(result.ruleViolations).toHaveLength(0);
  });

  // Demo modality/location (KB): "dónde está la academia" reaches the enriched
  // modalidad answer (everything online, no fixed connection schedule).
  it('modalidad demo: "Hola, donde esta la academia?" responde con la entrada modalidad', async () => {
    const expected = DEMO_CONTENT.faq.find((entry) => entry.id === 'modalidad')!.answer;
    const agent = makeDemoAgent();

    const result = await agent.runTurn('Hola, donde esta la academia?');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(expected);
    expect(result.ruleViolations).toHaveLength(0);
  });

  // Three consecutive rule-5 doubts: the engine never sends the same
  // lead-facing text twice in a row, and the third message is NOT the bare
  // contact invitation. Before the profile follow-up existed, the third doubt
  // fell back to the bare invitation (or to a repeated doubt), and the
  // invariant "same text twice in a row" was only reachable by accident.
  it('tres dudas seguidas: nunca se repite el texto y la tercera no es la invitación', async () => {
    const agent = makeDemoAgent();

    const first = await agent.runTurn('¿tienen piscina?');
    expect(first.intent).toBe('unknown');
    expect(first.reply).toBe(buildReply('doubt'));

    const second = await agent.runTurn('¿me lo dices en ingles?');
    expect(second.reply).toBe(DEMO_CONTENT.doubtFollowup);
    expect(second.reply).not.toBe(first.reply);

    const third = await agent.runTurn('¿tiene parking?');
    expect(third.intent).toBe('unknown');
    expect(third.reply).not.toBe(second.reply);
    expect(third.reply).not.toBe(buildReply('callProposal'));
  });

  // A profile WITHOUT its own follow-up wording keeps the old behaviour: the
  // second consecutive doubt falls back to the bare approved invitation. The
  // unapproved copy lives in the DEMO profile only (rules 4 and 11).
  it('sin follow-up propio, la segunda duda vuelve a la invitación aprobada', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });

    const first = await agent.runTurn('¿tienen piscina?');
    expect(first.intent).toBe('unknown');
    expect(first.reply).toBe(buildReply('doubt'));

    const second = await agent.runTurn('¿me lo dices en ingles?');
    expect(second.reply).toBe(buildReply('callProposal'));
    expect(second.reply).not.toBe(first.reply);
  });
});

// D6: a bare "sí" to the rule-5 doubt proposal NEVER escalated. The agent
// asked "¿Te viene bien que te contacten para aclararlo?" but the pending ask
// was the QUALIFICATION question, so the "sí" was filed as the answer to it
// and no handoff fired: a lead who says "sí, contactadme" was a conversion
// that got lost. A bare affirmative can only be the answer to that yes/no
// question (the qualification questions are not yes/no questions).
describe('el "sí" a la propuesta de contacto deriva (D6)', () => {
  it('tras una duda, un "sí" deriva a humano y NO se captura como respuesta', async () => {
    const agent = makeDemoAgent();

    const doubt = await agent.runTurn('¿tienen piscina?');
    expect(doubt.intent).toBe('unknown');
    expect(doubt.reply).toBe(buildReply('doubt'));

    const yes = await agent.runTurn('sí');

    expect(yes.action).toBe('handoff');
    expect(yes.handoff?.reason).toBe('call_accepted');
    // The "sí" answers the contact proposal, NOT the qualification question.
    expect(yes.capturedAnswer).toBeUndefined();
    expect(agent.qualificationAnswers).toHaveLength(0);
    expect(yes.reply).toBe(buildReply('callAccepted'));
  });

  it('tras una duda no se apila otra pregunta (la de cualificación se aplaza)', async () => {
    const agent = makeDemoAgent();

    await agent.runTurn('¿tienen piscina?');

    // No second question on top of the doubt question: two questions in a row
    // leave the lead unable to answer either. The ask is deferred, not lost.
    expect(agent.nextQualificationQuestion()).toBeNull();
  });

  it('sin duda previa, un "sí" sigue siendo la respuesta a la pregunta pendiente', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('sí');

    expect(result.action).toBe('none');
    expect(result.handoff).toBeUndefined();
    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'sí' });
  });

  it('tras una duda, una respuesta libre se recibe como respuesta a la pregunta pendiente', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    // The doubt does not steal the pending qualification ask.
    const doubt = await agent.runTurn('¿tienen piscina?');
    expect(doubt.reply).toBe(buildReply('doubt'));

    const answer = await agent.runTurn('de cero');

    expect(answer.action).toBe('none');
    expect(answer.handoff).toBeUndefined();
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'de cero' });
    expect(answer.registeredDoubts).toHaveLength(0);
  });

  it('tras una duda, un stop sigue parando (regla 7) y no es un afirmativo', async () => {
    const agent = makeDemoAgent();

    await agent.runTurn('¿tienen piscina?');

    const stop = await agent.runTurn('no me escribas más');

    expect(stop.intent).toBe('stop');
    expect(stop.action).toBe('stop');
    expect(stop.handoff).toBeUndefined();
    expect(stop.registeredNoContinuar).toBe(true);
    expect(agent.isStopped).toBe(true);
  });
});

// D5: the agreed moment used to be LOST when it arrived after the handoff.
// After the handoff, runTurn only recorded messages containing a Spanish phone
// number; everything else was silently discarded, so the commercial never
// learned "9:00" (MVP spec §3.6: the notice carries contact and context).
describe('el momento acordado que llega tras la derivación no se pierde (D5)', () => {
  it('el mensaje posterior a la derivación se registra y actualiza el aviso', async () => {
    const agent = makeDemoAgent();

    // Full demo flow: the lead answers, the agent proposes the call, and the
    // lead answers with a moment ("mañana"), which closes the handoff.
    await agent.runTurn('de cero');
    await agent.runTurn('lo antes posible');
    const handoff = await agent.runTurn('mañana');

    expect(handoff.action).toBe('handoff');
    expect(handoff.handoff?.reason).toBe('call_accepted');
    expect(handoff.handoff?.lastMessage).toBe('mañana');

    // The agreed time arrives AFTER the handoff: the agent stays silent (rule
    // 9) but the message is registered and the notice is corrected.
    const after = await agent.runTurn('mañana a las 9:00');

    expect(after.reply).toBe('');
    expect(after.suppressed).toBe(true);
    expect(after.action).toBe('none');
    expect(after.handoff?.summary).toContain('9:00');
    expect(after.handoff?.summary.endsWith('mañana a las 9:00')).toBe(true);
    expect(after.handoff?.lastMessage).toBe('mañana a las 9:00');
    expect(after.handoff?.afterHandoff).toEqual(['mañana a las 9:00']);
    expect(agent.records.some((record) => record.detail.includes('9:00'))).toBe(true);
  });

  it('el teléfono posterior a la derivación se sigue registrando como contacto', async () => {
    const agent = makeDemoAgent();

    await agent.runTurn('de cero');
    await agent.runTurn('lo antes posible');
    await agent.runTurn('mañana');

    const after = await agent.runTurn('mi móvil es 687723287');

    expect(after.reply).toBe('');
    expect(after.suppressed).toBe(true);
    expect(agent.records.some((record) => record.detail.includes('contact given after the handoff'))).toBe(
      true,
    );
    expect(after.handoff?.lastMessage).toBe('mi móvil es 687723287');
  });
});

// The knowledge base (Phase 0) answered the lead's question in SILENCE. A
// message that MATCHES a passage but is not written with a question mark was
// swallowed: classify() returned the 'kb' intent, the reception path treated
// it like 'unknown' (receivable), so the agent sent NOTHING and filed the
// lead's own message as the answer to the pending ask.
//
// The rule now: a knowledge-base match means the message is a QUERY, exactly
// like an approved-FAQ match — the approved answer is sent and the pending ask
// stays armed. The EXCEPTION is the lead's own answer to the pending ask,
// which is never stolen by the knowledge base.
describe('la base de conocimiento no se traga ni la pregunta ni la respuesta', () => {
  it('una pregunta que casa con un pasaje se responde y NO se captura', async () => {
    const agent = makeDemoAgent();

    const result = await agent.runTurn('quiero el certificado de la UE');

    expect(result.intent).toBe('kb');
    expect(result.reply).not.toBe('');
    expect(result.reply).toBe(passageAnswer('kb-certificacion-arp'));
    expect(result.registeredDoubts).toEqual([]);
    expect(result.ruleViolations).toEqual([]);
    // The message was a QUERY, not the answer to the pending ask: it is not
    // captured, and the ask stays armed.
    expect(result.capturedAnswer).toBeUndefined();
    expect(agent.qualificationAnswers).toHaveLength(0);
  });

  it('una pregunta que casa con un pasaje deja el ask pendiente', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('quiero el certificado de la UE');

    expect(result.reply).toBe(passageAnswer('kb-certificacion-arp'));
    // The ask was NOT stolen by the answer: it is still pending, so the lead's
    // next message is still received as the answer to THAT question.
    const answer = await agent.runTurn('no tengo experiencia');
    expect(answer.capturedAnswer?.questionId).toBe(id);
  });

  it('la respuesta del lead a la pregunta pendiente NO se la queda la base de conocimiento', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);
    expect(id).toBe('starting-experience');

    // This message matches the passage 'kb-sin-experiencia' (intent 'kb')
    // AND is the answer to the pending question.
    const result = await agent.runTurn('no tengo experiencia');

    expect(result.capturedAnswer?.questionId).toBe('starting-experience');
    expect(result.capturedAnswer?.text).toBe('no tengo experiencia');
    // The approved reaction is sent, NOT the passage answer.
    expect(result.reply).toBe(demoReaction('starting-experience', 0));
    expect(result.reply).not.toBe(passageAnswer('kb-sin-experiencia'));
    expect(result.registeredDoubts).toEqual([]);
  });

  it('"paso" no activa el pasaje del método: sigue siendo un rechazo', async () => {
    const agent = makeDemoAgent();

    // The bare token "paso" matches the passage 'kb-metodo-demostracion'
    // (score 4.99) on its own, and the lead meant "paso de ti" (a decline).
    const first = await agent.runTurn('paso');

    expect(first.intent).not.toBe('kb');
    expect(first.reply).not.toBe(passageAnswer('kb-metodo-demostracion'));
    expect(first.reply).not.toContain('aprendizaje demostrado');
  });

  it('"paso" como respuesta a la propuesta de llamada es un rechazo (regla 5)', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('starting-experience');
    await agent.runTurn('parto de cero');
    expect(armQualification(agent)).toBe('time-interest');
    const closing = await agent.runTurn('lo antes posible');
    expect(closing.reply).toBe(`${demoReaction('time-interest', 0)} ${demoClosing()}`);

    const refusal = await agent.runTurn('paso');

    expect(refusal.capturedAnswer).toEqual({ questionId: 'call-proposal', text: 'paso' });
    expect(refusal.action).toBe('none');
    expect(refusal.handoff).toBeUndefined();
    expect(refusal.reply).toBe(buildReply('decline'));
    expect(refusal.reply).not.toBe(passageAnswer('kb-metodo-demostracion'));
    expect(agent.isStopped).toBe(false);
  });

  it('una aceptación confirmada manda sobre la respuesta de la base de conocimiento (regla 9)', async () => {
    const agent = makeDemoAgent();

    // The message matches a passage AND accepts the call: the handoff wins.
    const result = await agent.runTurn('quiero el certificado de la UE y me va bien');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.reply).not.toBe(passageAnswer('kb-certificacion-arp'));
  });

  it('una respuesta libre que no casa con ningún pasaje se sigue recibiendo como respuesta', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('el lunes');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'el lunes' });
    expect(result.registeredDoubts).toEqual([]);
    expect(result.handoff).toBeUndefined();
  });

  it('el "sí" que responde a la duda sigue derivando (D6, sin regresión)', async () => {
    const agent = makeDemoAgent();

    const doubt = await agent.runTurn('¿tienen piscina?');
    expect(doubt.intent).toBe('unknown');
    expect(doubt.reply).toBe(buildReply('doubt'));

    const yes = await agent.runTurn('sí');

    expect(yes.action).toBe('handoff');
    expect(yes.handoff?.reason).toBe('call_accepted');
    expect(yes.reply).toBe(buildReply('callAccepted'));
    expect(yes.capturedAnswer).toBeUndefined();
  });
});
