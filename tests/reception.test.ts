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
import { classify, findApprovedAnswer, normalizeEs } from '../src/intent';
import { KB_PASSAGES, type KbPassage } from '../src/kb';
import { MockProvider } from '../src/llm';
import { buildReply, guardReply, REPLY_TEMPLATES } from '../src/rules';
import { first, last } from './helpers';

const lead: LeadContact = {
  id: 'lead-reception-001',
  contact: '+3460000002',
  bucket: 'ilocalizable',
};

function makeDemoAgent(): MuskAgent {
  return new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });
}

// Arms a qualification ask and returns its id (the ask is the pending one).
function armQualification(agent: MuskAgent): string {
  const question = agent.nextQualificationQuestion();
  if (!question) throw new Error('expected an askable qualification question');
  return question.id;
}

// The close this profile ships (a profile without one falls back to the
// approved sentence in REPLY_TEMPLATES).
function demoGoalReply(answerText = 'Quiero cambiar de sector'): string {
  const question = APPROVED_CONTENT.qualificationQuestions.find((entry) => entry.id === 'goal');
  const foldedAnswer = normalizeEs(answerText);
  const reaction = question?.reactions?.find((entry) =>
    entry.keywords.some((keyword) => foldedAnswer.includes(normalizeEs(keyword))),
  )?.say;
  const closing = APPROVED_CONTENT.closingInvitation ?? buildReply('callProposal');
  return reaction ? `${reaction} ${closing}` : closing;
}

// The approved answer of a knowledge-base passage, looked up by id (never
// hardcoded in the test).
function passageAnswer(id: string): string {
  const found = KB_PASSAGES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`passage not found: ${id}`);
  return found.answer;
}

describe('recepción de respuestas (answer reception)', () => {
  it('routes the specific course-catalog request without broadening the Musk information route', async () => {
    const catalog = await makeDemoAgent().runTurn('Dame informacion sobre los cursos');
    const musk = await makeDemoAgent().runTurn('dame informacion sobre musk');

    expect(catalog.intent).toBe('general');
    expect(findApprovedAnswer(APPROVED_CONTENT, 'Dame informacion sobre los cursos')?.id).toBe('catalogo-formaciones');
    expect(catalog.reply).toBe(APPROVED_CONTENT.faq.find((entry) => entry.id === 'catalogo-formaciones')?.answer);
    expect(findApprovedAnswer(APPROVED_CONTENT, 'dame informacion sobre musk')?.id).toBe('sobre-musk');
    expect(musk.intent).toBe('general');
    expect(musk.reply).toBe(APPROVED_CONTENT.faq.find((entry) => entry.id === 'sobre-musk')?.answer);
  });

  it('runs the reproduced transcript through the catalog, formation choice, and protected financing route', async () => {
    const agent = makeDemoAgent();
    const catalogQuestion = 'Si, me interesa. Dame informacion sobre los cursos';
    const catalog = await agent.runTurn(catalogQuestion);

    expect(findApprovedAnswer(APPROVED_CONTENT, catalogQuestion)?.id).toBe('catalogo-formaciones');
    expect(catalog.reply).toBe(APPROVED_CONTENT.faq.find((entry) => entry.id === 'catalogo-formaciones')?.answer);
    expect(agent.nextQualificationQuestion()?.text).toBe(
      '¿Tienes ya alguna formación en mente o qué te gustaría conseguir? Así el equipo puede orientarte en una llamada.',
    );

    const choice = await agent.runTurn('el curso de full stack');
    const fullStackAcknowledgement =
      'Entiendo, te interesa Full Stack: la parte visual y la lógica de una aplicación web.';
    const closingInvitation = APPROVED_CONTENT.closingInvitation!;
    expect(choice.capturedAnswer).toEqual({ questionId: 'goal', text: 'el curso de full stack' });
    expect(choice.reply).toContain(fullStackAcknowledgement);
    expect(choice.reply.split(closingInvitation)).toHaveLength(2);
    expect(choice.reply.match(/\?/g)).toHaveLength(1);
    expect(choice.reply).toBe(`${fullStackAcknowledgement} ${closingInvitation}`);
    expect(guardReply(choice.reply).ok).toBe(true);
    expect(choice.reply).not.toContain('kb-fullstack-salidas');
    expect(agent.records.some((record) => record.kind === 'kb' && record.detail.includes('kb-fullstack-salidas'))).toBe(false);

    const financingQuestion = 'los cursos pueden finanaciarse?';
    const financing = await agent.runTurn(financingQuestion);
    expect(financing.intent).toBe('financiacion');
    expect(financing.reply).toBe(APPROVED_CONTENT.financingReply);
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(false);
    for (const reply of [catalog.reply, choice.reply, financing.reply]) {
      expect(guardReply(reply).ok).toBe(true);
      expect(reply.length).toBeLessThan(260);
    }
  });

  it('does not turn a negated course mention into a positive goal acknowledgement', async () => {
    for (const message of ['no me interesa Full Stack', 'no busco Full Stack']) {
      const agent = makeDemoAgent();
      expect(agent.nextQualificationQuestion()?.id).toBe('goal');

      const result = await agent.runTurn(message);

      expect(result.intent).toBe('decline');
      expect(result.capturedAnswer).toBeUndefined();
      expect(result.reply).toBe(buildReply('decline'));
      expect(result.reply).not.toContain('Entiendo, te interesa Full Stack');
      expect(result.action).toBe('none');
    }
  });

  it('routes the financing transposition typo to the profile-configured rule 3 reply', async () => {
    const agent = makeDemoAgent();
    const result = await agent.runTurn('los cursos pueden finanaciarse?');

    expect(result.intent).toBe('financiacion');
    expect(result.reply).toBe(APPROVED_CONTENT.financingReply);
    expect(result.registeredDoubts).toEqual([]);
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(false);
  });

  it.each([
    ['Explícame la formación', 'informacion'],
    ['¿Qué es la formación?', 'informacion'],
    ['Cuéntame sobre los cursos', 'catalogo-formaciones'],
    ['Háblame de los cursos', 'catalogo-formaciones'],
    ['Cuéntame en qué consiste', 'informacion'],
  ])('routes "%s" to FAQ %s without consuming the qualification ask', async (message, expectedFaqId) => {
    const agent = makeDemoAgent();
    const expectedFaq = APPROVED_CONTENT.faq.find((entry) => entry.id === expectedFaqId);
    expect(expectedFaq).toBeDefined();

    const result = await agent.runTurn(message);

    expect(result.intent).toBe('general');
    expect(findApprovedAnswer(APPROVED_CONTENT, message)?.id).toBe(expectedFaqId);
    expect(result.reply).toBe(expectedFaq!.answer);
    expect(result.registeredDoubts).toEqual([]);
    expect(agent.nextQualificationQuestion()?.id).toBe('goal');

    if (message === 'Explícame la formación') {
      expect(result.reply).not.toBe(passageAnswer('kb-presencial-online'));
    }
    if (expectedFaqId === 'catalogo-formaciones') {
      for (const program of ['Python', 'Front End', 'Back End', 'Full Stack', 'máster de videojuegos']) {
        expect(result.reply).toContain(program);
      }
    }
  });

  it('flujo demo: responde qué es la formación, reconoce el objetivo y propone la llamada', async () => {
    const agent = makeDemoAgent();
    const infoAnswer = APPROVED_CONTENT.faq.find((entry) => entry.id === 'informacion')!.answer;

    const info = await agent.runTurn('Cuéntame en qué consiste');

    expect(info.intent).toBe('general');
    expect(info.reply).toBe(infoAnswer);
    expect(info.reply).not.toContain('te cuento más o lo vemos con detalle');

    expect(agent.nextQualificationQuestion()).toMatchObject({ id: 'goal' });
    const goalText = 'Obtener conocimientos para optar a una plaza';
    const goal = await agent.runTurn(goalText);
    const acknowledgement =
      'Entiendo: quieres ampliar conocimientos para optar a una plaza.';
    const availabilityQuestion = '¿Qué día y a qué hora te viene bien que el equipo te llame?';

    expect(goal.capturedAnswer).toEqual({ questionId: 'goal', text: goalText });
    expect(goal.reply.startsWith(acknowledgement)).toBe(true);
    expect(goal.reply).toContain(APPROVED_CONTENT.closingInvitation);
    expect(goal.reply).toBe(`${acknowledgement} ${APPROVED_CONTENT.closingInvitation}`);
    expect(goal.reply.match(/\?/g)).toHaveLength(1);
    expect(goal.reply).toContain(availabilityQuestion);
    expect(goal.reply.length).toBeLessThan(240);
    expect(guardReply(goal.reply).ok).toBe(true);
    expect(goal.ruleViolations).toHaveLength(0);
  });

  it('las reacciones del objetivo priorizan frases específicas y pasan el guard', async () => {
    const goalQuestion = APPROVED_CONTENT.qualificationQuestions.find((entry) => entry.id === 'goal');
    const reactions = goalQuestion?.reactions ?? [];
    expect(reactions).toHaveLength(8);
expect(reactions.slice(0, 5).map((reaction) => reaction.say)).toEqual([
      'Entiendo, te interesa Python: programación con aplicaciones en software y análisis de datos.',
      'Entiendo, te interesa Front End: diseño y desarrollo de interfaces web.',
      'Entiendo, te interesa Back End: la lógica del servidor, los datos y las APIs.',
      'Entiendo, te interesa Full Stack: la parte visual y la lógica de una aplicación web.',
      'Entiendo, te interesa videojuegos: diseño y programación para crear experiencias interactivas.',
    ]);
    for (const reaction of reactions.slice(0, 5)) {
      expect(reaction.avoidKeywords).toContain('no me interesa');
    }
    for (const reaction of reactions) {
      expect(guardReply(reaction.say).ok).toBe(true);
      expect(reaction.say).not.toContain('?');
      // Rules 1, 2 and 4: a course acknowledgement carries no figure of any kind
      // (the price guard does not catch every digit on its own).
      expect(reaction.say).not.toMatch(/\d/);
    }

    const courseSelections: Array<[string, string]> = [
      ['Python', reactions[0]!.say],
      ['Frontend', reactions[1]!.say],
      ['Backend', reactions[2]!.say],
      ['Full Stack', reactions[3]!.say],
      ['quiero crear juegos', reactions[4]!.say],
    ];
    for (const [answer, expectedAcknowledgement] of courseSelections) {
      const agent = makeDemoAgent();
      expect(agent.nextQualificationQuestion()?.id).toBe('goal');
      const result = await agent.runTurn(answer);

expect(result.capturedAnswer).toEqual({ questionId: 'goal', text: answer });
      expect(result.reply).toBe(`${expectedAcknowledgement} ${APPROVED_CONTENT.closingInvitation}`);
      expect(result.reply.match(/\?/g)).toHaveLength(1);
      expect(result.reply.length).toBeLessThan(240);
      expect(guardReply(result.reply).ok).toBe(true);
      expect(agent.records.some((record) => record.kind === 'kb' && record.detail.includes('kb-'))).toBe(false);
    }

    const cases: Array<[string, string]> = [
      [
        'Quiero cambiar de sector y aprender conocimientos',
        'Entiendo: buscas prepararte para cambiar de sector.',
      ],
      ['Quiero cambiar de trabajo', 'Entiendo: buscas prepararte para cambiar de sector.'],
      [
        'Quiero aprender',
        'Entiendo: quieres ampliar tus conocimientos en el área tecnológica.',
      ],
    ];
    for (const [answer, expectedAcknowledgement] of cases) {
      const agent = makeDemoAgent();
      expect(agent.nextQualificationQuestion()?.id).toBe('goal');
      const result = await agent.runTurn(answer);

      expect(result.capturedAnswer).toEqual({ questionId: 'goal', text: answer });
      expect(result.reply.startsWith(expectedAcknowledgement)).toBe(true);
      expect(result.reply).toContain(APPROVED_CONTENT.closingInvitation);
      expect(guardReply(result.reply).ok).toBe(true);
    }
  });

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
  //    captured under the goal id, never registered as a doubt.
  it('tras la pregunta sobre el objetivo, la respuesta se captura y no es duda', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('Quiero cambiar de sector');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
    expect(result.reply).toBe(demoGoalReply());
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toEqual([{ id, text: 'Quiero cambiar de sector' }]);
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
    expect(price.reply).toBe(APPROVED_CONTENT.priceReply);
    expect(price.capturedAnswer).toBeUndefined();
    expect(price.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toHaveLength(0);

    // The ask stayed pending: the next non-query IS captured as its answer.
    const answer = await agent.runTurn('Quiero cambiar de sector');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
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

    const answer = await agent.runTurn('Quiero cambiar de sector');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
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

  // 7. The call-first DEMO asks one goal question, captures it under its stable
  //    id, and closes directly on the call proposal without reactions.
  it('flujo demo: captura el objetivo y propone directamente la llamada', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('goal');
    const result = await agent.runTurn('Quiero cambiar de sector');

    expect(result.capturedAnswer).toEqual({ questionId: 'goal', text: 'Quiero cambiar de sector' });
    expect(result.reply).toBe(demoGoalReply());
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toEqual([{ id: 'goal', text: 'Quiero cambiar de sector' }]);
    expect(agent.records.filter((record) => record.kind === 'answer')).toHaveLength(1);
    expect(agent.records.some((record) => record.kind === 'doubt')).toBe(false);
  });

  it('transcripción real: pregunta de ubicación, objetivo capturado y llamada con momento registrado', async () => {
    const agent = makeDemoAgent();
    const modality = await agent.runTurn('¿Dónde está la academia?');

    expect(modality.intent).toBe('general');
    expect(modality.reply).toBe(APPROVED_CONTENT.faq.find((entry) => entry.id === 'modalidad')?.answer);

    const goalQuestion = agent.nextQualificationQuestion();
    expect(goalQuestion).toMatchObject({
      id: 'goal',
      text: '¿Tienes ya alguna formación en mente o qué te gustaría conseguir? Así el equipo puede orientarte en una llamada.',
    });
    const goal = await agent.runTurn('Quiero cambiar de sector');
    expect(goal.capturedAnswer).toEqual({ questionId: 'goal', text: 'Quiero cambiar de sector' });
    expect(goal.reply).toBe(demoGoalReply());

    const call = await agent.runTurn('mañana a las nueve');
    expect(call.action).toBe('handoff');
    expect(call.capturedAnswer).toEqual({ questionId: 'call-proposal', text: 'mañana a las nueve' });
    expect(call.handoff?.lastMessage).toBe('mañana a las nueve');
    expect(call.handoff?.recipient).toBe('Laura');
    expect(call.handoff?.qualification).toEqual([
      { question: goalQuestion?.text, answer: 'Quiero cambiar de sector' },
    ]);
    expect(call.handoff?.summary).toContain(
      '¿Tienes ya alguna formación en mente o qué te gustaría conseguir? Así el equipo puede orientarte en una llamada. → Quiero cambiar de sector',
    );
    expect(call.handoff?.summary).toContain('Bolsa de origen: ilocalizables.');
    expect(call.handoff?.summary).toContain('Último mensaje del lead: mañana a las nueve');
  });

  it('el resumen distingue la bolsa de no compradores y admite una destinataria sin configurar', async () => {
    const agent = new MuskAgent({
      content: { ...APPROVED_CONTENT, handoffRecipient: undefined },
      provider: null,
      lead: { ...lead, bucket: 'no_comprador' },
    });
    const result = await agent.runTurn('quiero hablar con una persona');

    expect(result.handoff?.recipient).toBeUndefined();
    expect(result.handoff?.summary).toContain('Bolsa de origen: no compradores.');
    expect(result.handoff?.summary).toContain('Último mensaje del lead: quiero hablar con una persona');
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
    const answer = await agent.runTurn('Quiero cambiar de sector');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
  });

  // 9. reset() clears the captured answers and re-arms the opening ask.
  it('reset limpia las respuestas y vuelve a armar la apertura', async () => {
    const agent = makeDemoAgent();
    armQualification(agent);
    await agent.runTurn('Quiero cambiar de sector');
    expect(agent.qualificationAnswers).toHaveLength(1);

    agent.reset();

    expect(agent.qualificationAnswers).toHaveLength(0);
    const result = await agent.runTurn('Si');
    expect(result.capturedAnswer).toEqual({ questionId: null, text: 'Si' });
  });

  // 10. Goal answers are recorded verbatim; the one-question profile has no
  //     reaction or follow-up question before its call-oriented close.
  it('el turno de recepción captura el objetivo y cierra sin reacción de relleno', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const answerText = 'Quiero cambiar de sector';
    const result = await agent.runTurn(answerText);

    expect(result.capturedAnswer).toEqual({ questionId: id, text: answerText });
    expect(result.reply).toBe(demoGoalReply());
    expect(agent.qualificationAnswers).toEqual([{ id, text: answerText }]);
    expect(agent.nextQualificationQuestion()).toBeNull();
  });

  // 11. The one goal answer immediately produces the profile's editable call
  //     invitation. A profile without one falls back to the approved template.
  it('al responder el objetivo propone la llamada con el cierre del perfil', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('goal');

    const result = await agent.runTurn('Quiero cambiar de sector');

    expect(result.capturedAnswer).toEqual({
      questionId: 'goal',
      text: 'Quiero cambiar de sector',
    });
    expect(result.reply).toBe(demoGoalReply());
    // The fallback sentence is still the tail the price answer already ships.
    expect(buildReply('price').endsWith(buildReply('callProposal'))).toBe(true);
    const replies = agent.records.filter((record) => record.kind === 'reply');
    // The last outbound message is the call-oriented closing.
    expect(last(replies).detail).toBe(result.reply);
    expect(agent.nextQualificationQuestion()).toBeNull();
  });

  // 12. The closing is a QUESTION of its own (rule 9 counts a confirmed
  //     acceptance as a handoff): the message that follows it is its answer, and
  //     a plain "sI" to a yes/no question is that confirmation. Before this, the
  //     ask was lost and the lead was re-greeted with a message the agent had
  //     already sent.
  it('tras proponer la llamada, un "sI" se recibe como acuerdo y deriva (regla 9)', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('goal');
    const proposal = await agent.runTurn('Quiero cambiar de sector');
    expect(proposal.reply).toBe(demoGoalReply());

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
    expect(armQualification(agent)).toBe('goal');
    const closing = await agent.runTurn('Quiero cambiar de sector');
    expect(closing.reply).toBe(demoGoalReply());

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

    // A greeting is classified, not swallowed by the opening ask: the lead's
    // first message always gets an answer.
    const first = await agent.runTurn('xyz');
    expect(first.intent).toBe('unknown');
    expect(first.reply).toBe(buildReply('doubt'));

    const second = await agent.runTurn('xyz');
    expect(second.reply).toBe(APPROVED_CONTENT.doubtFollowup);
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
    await agent.runTurn('Quiero cambiar de sector');
    const handoff = await agent.runTurn('quiero hablar con una persona');
    expect(handoff.action).toBe('handoff');
    expect(handoff.handoff?.reason).toBe('human_requested');
    const recordsAfterHandoff = agent.records.length;

    const lead = await agent.runTurn('mi movil es 687723287');
    expect(lead.reply).toBe('');
    expect(lead.suppressed).toBe(true);
    expect(agent.records).toHaveLength(recordsAfterHandoff + 1);
    expect(last(agent.records).kind).toBe('answer');
    expect(last(agent.records).detail).toContain('687723287');

    const other = await agent.runTurn('gracias');
    expect(other.reply).toBe('');
    // Every post-handoff message is now registered (D5): the agreed moment
    // usually arrives late and the commercial must learn it.
    expect(agent.records).toHaveLength(recordsAfterHandoff + 2);
    expect(last(agent.records).detail).toBe('after the handoff: "gracias"');
  });

  // 15. After the handoff the agent stops writing: the lead is with a person, and
  //     a second voice (the social greeting, an acknowledgement) is what reads as
  //     a bot. The silence is deliberately marked (suppressed), never a lost turn.
  it('tras la derivación el agente deja de escribir', async () => {
    const agent = makeDemoAgent();
    expect(armQualification(agent)).toBe('goal');
    await agent.runTurn('Quiero cambiar de sector');
    const accepted = await agent.runTurn('sI');
    expect(accepted.action).toBe('handoff');
    const recordsAfterHandoff = agent.records.length;

    const lead = await agent.runTurn('sI');

    expect(lead.reply).toBe('');
    expect(lead.suppressed).toBe(true);
    // The silence is unchanged, but the message is no longer dropped: it is
    // registered so the commercial sees what the lead said after the handoff.
    expect(agent.records).toHaveLength(recordsAfterHandoff + 1);
    expect(last(agent.records).detail).toBe('after the handoff: "sI"');
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
    await agent.runTurn('Quiero cambiar de sector');
    return agent;
  }

  it('por las tardes → handoff call_accepted', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('por las tardes');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  it('sí, sobre las seis → handoff call_accepted', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('sí, sobre las seis');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  it('te dejo mi número, 612 345 678 → handoff call_accepted', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('te dejo mi número, 612 345 678');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
  });

  it('no puedo por la tarde → NOT handoff, doubt', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('no puedo por la tarde');
    expect(result.action).not.toBe('handoff');
    expect(result.action).toBe('none');
    expect(result.reply).toBe(buildReply('doubt'));
  });

  it('buenas tardes (answer) → NOT handoff', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('buenas tardes');
    expect(result.action).not.toBe('handoff');
  });

  it('lo antes posible (answer) → NOT handoff', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('lo antes posible');
    expect(result.action).not.toBe('handoff');
  });

  it('quiero hablar con una persona (answer) → human handoff', async () => {
    const agent = await armCallProposal();
    const result = await agent.runTurn('quiero hablar con una persona');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('human_requested');
  });

  it('me viene bien (answer) → handoff call_accepted', async () => {
    const agent = await armCallProposal();
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
    expect(handoff?.formation).toBe(APPROVED_CONTENT.formationName);
    expect(handoff?.qualification).toEqual([
      { question: first(APPROVED_CONTENT.qualificationQuestions).text, answer: 'Quiero cambiar de sector' },
    ]);
    expect(handoff?.doubts).toEqual([]);
    expect(handoff?.lastMessage).toBe(lastMessage);
    expect(handoff?.summary.startsWith(APPROVED_CONTENT.formationName)).toBe(true);
    expect(handoff?.summary).toContain('aceptó la llamada');
    expect(handoff?.summary).toContain(
      `${first(APPROVED_CONTENT.qualificationQuestions).text} → Quiero cambiar de sector`,
    );
    expect(handoff?.summary).toContain('Bolsa de origen: ilocalizables.');
    expect(handoff?.recipient).toBe('Laura');
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

// A separate reception regression: a compound message without "?" can still
// contain a recognized question, so it must receive the FAQ answer instead of
// being captured as the goal response. This is not the partner's demonstrated
// transcript; that flow has its own end-to-end test above.
describe('preguntas sin signo de interrogación (questions without "?")', () => {
  const sobreMuskAnswer = APPROVED_CONTENT.faq.find((entry) => entry.id === 'sobre-musk')!.answer;

  it('una pregunta compuesta sin signo se responde y NO se captura como objetivo', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('de cero, cuentame mas sobre escuela musk');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(sobreMuskAnswer);
    expect(result.capturedAnswer).toBeUndefined();
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.qualificationAnswers).toHaveLength(0);

    // The ask stayed pending: the next plain message IS captured as its answer.
    const answer = await agent.runTurn('Quiero cambiar de sector');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
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

    const answer = await agent.runTurn('Quiero cambiar de sector');
    expect(answer.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
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
    const text = 'Quiero cambiar de sector';

    const result = await agent.runTurn(text);

    expect(result.capturedAnswer).toEqual({ questionId: id, text });
    expect(result.registeredDoubts).toHaveLength(0);
    // It is the final qualification answer, so the call invitation follows.
    expect(result.reply).toBe(demoGoalReply());
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
    await agent.runTurn('Quiero cambiar de sector');
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
    expect(result.reply).toBe(APPROVED_CONTENT.priceReply);
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
  // The goal answer is given and the call proposal sent: the next lead
  // message is received as its answer (pendingAsk = callProposal).
  async function armCallProposal(): Promise<MuskAgent> {
    const agent = makeDemoAgent();
    agent.nextQualificationQuestion();
    await agent.runTurn('Quiero cambiar de sector');
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
  // A statement of interest arriving as the reply to the armed call ask is NOT
  // a failed answer: re-offering it as a doubt said "no tengo una respuesta
  // aprobada sobre eso" to a message that asked nothing and counted a FALSE
  // doubt in the pilot KPI. The approved invitation is re-offered and no doubt
  // is registered; the ask stays armed.
  it('"me interesa mucho" tras el ask no registra una duda falsa', async () => {
    const agent = await armCallProposal();

    const result = await agent.runTurn('me interesa mucho');

    expect(result.action).toBe('none');
    expect(result.reply).toBe(buildReply('callProposal'));
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.doubts).toHaveLength(0);
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // A pure thanks arriving as the reply to the armed ask is a closing, not a
  // failed answer: it must not be filed as a doubt either. A FAREWELL stays in
  // the doubt path on purpose ("hasta mañana" is the documented goodbye trap).
  it('"gracias" tras el ask cierra sin registrar duda', async () => {
    const agent = await armCallProposal();

    const result = await agent.runTurn('gracias');

    expect(result.action).toBe('none');
    expect(result.reply).toBe(buildReply('closing'));
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.doubts).toHaveLength(0);
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  it('una pregunta de precio tras la duda conserva su respuesta y no roba el ask', async () => {
    const agent = await armCallProposal();
    await agent.runTurn('depende');

    const price = await agent.runTurn('cuánto cuesta?');
    expect(price.reply).toBe(APPROVED_CONTENT.priceReply);
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
    await agent.runTurn('Quiero cambiar de sector');

    const first = await agent.runTurn('cuánto cuesta?');
    const second = await agent.runTurn('cuánto cuesta?');

    expect(first.reply).toBe(APPROVED_CONTENT.priceReply);
    expect(second.reply).toBe(APPROVED_CONTENT.priceReply);
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
    expect(result.reply).toBe(APPROVED_CONTENT.financingReply);
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
    expect(second.reply).toBe(APPROVED_CONTENT.doubtFollowup);
    expect(second.reply).not.toBe(buildReply('callProposal'));

    const handoff = await agent.runTurn('quiero hablar con una persona');
    expect(handoff.action).toBe('handoff');
    expect(handoff.handoff?.doubts).toEqual(['¿tienen piscina?', '¿me lo dices en ingles?']);
  });

  // Demo catalog entry (KB): the question routes to the new FAQ answer.
  it('catálogo demo: "Que cursos teneis?" responde con la entrada catalogo-formaciones', async () => {
    const expected = APPROVED_CONTENT.faq.find((entry) => entry.id === 'catalogo-formaciones')!.answer;
    const agent = makeDemoAgent();

    const result = await agent.runTurn('Que cursos teneis?');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(expected);
    expect(result.ruleViolations).toHaveLength(0);
  });

  // The catalog answer used to end with "Dime qué te atrae y te oriento.", which
  // asked exactly what the `goal` question asks in the SAME turn (the turn now
  // emits ONE message, so the lead read the ask twice). The answer keeps the
  // five programmes and the "con IA" differentiator, and stops asking.
  it('el catálogo ya no repite la invitación que hace la pregunta de cualificación', async () => {
    const entry = APPROVED_CONTENT.faq.find((item) => item.id === 'catalogo-formaciones')!;
    const question = APPROVED_CONTENT.qualificationQuestions.find((item) => item.id === 'goal')!;

    expect(entry.answer).toBe(
      'Cinco programas: Python, Front End, Back End, Full Stack y el máster de videojuegos.' +
        ' Todos online y desde cero, con IA en los de desarrollo y videojuegos.',
    );
    // No invitation duplicated by the question that follows in the same turn.
    expect(entry.answer).not.toContain('te oriento');
    expect(entry.answer.endsWith('?')).toBe(false);
    // Same guarantees as before: no digit, no price, no promise, guard clean.
    expect(entry.answer).not.toMatch(/\d/);
    expect(guardReply(entry.answer).ok).toBe(true);
    expect(entry.answer.length).toBeLessThan(200);

    const agent = makeDemoAgent();
    const result = await agent.runTurn('Sí, me interesa. Dame informacion sobre los cursos');
    expect(result.reply).toBe(entry.answer);
    expect(result.ruleViolations).toHaveLength(0);
    // Joined with the goal question, the turn still asks ONE thing.
    const ask = agent.nextQualificationQuestion();
    expect(ask?.id).toBe('goal');
    expect(`${result.reply} ${ask!.text}`.match(/\?/g)).toHaveLength(1);
    expect(`${result.reply} ${ask!.text}`.length).toBeLessThan(300);
  });

  // Demo modality/location (KB): "dónde está la academia" reaches the enriched
  // modalidad answer (everything online, no fixed connection schedule).
  it('modalidad demo: "Hola, donde esta la academia?" responde con la entrada modalidad', async () => {
    const expected = APPROVED_CONTENT.faq.find((entry) => entry.id === 'modalidad')!.answer;
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
    expect(second.reply).toBe(APPROVED_CONTENT.doubtFollowup);
    expect(second.reply).not.toBe(first.reply);

    const third = await agent.runTurn('¿tiene parking?');
    expect(third.intent).toBe('unknown');
    expect(third.reply).not.toBe(second.reply);
    expect(third.reply).not.toBe(buildReply('callProposal'));
  });

  // A profile WITHOUT its own follow-up wording keeps the old behaviour: the
  // second consecutive doubt falls back to the bare approved invitation. The
  // follow-up copy is optional, so a future profile can drop it.
  it('sin follow-up propio, la segunda duda vuelve a la invitación aprobada', async () => {
    const agent = new MuskAgent({
      content: { ...APPROVED_CONTENT, doubtFollowup: undefined },
      provider: null,
      lead,
    });

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

    // Full demo flow: the goal answer triggers the call proposal, then the lead
    // accepts with a moment ("mañana"), which closes the handoff.
    agent.nextQualificationQuestion();
    await agent.runTurn('Quiero cambiar de sector');
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

    agent.nextQualificationQuestion();
    await agent.runTurn('Quiero cambiar de sector');
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
    const answer = await agent.runTurn('Quiero cambiar de sector');
    expect(answer.capturedAnswer?.questionId).toBe(id);
  });

  it('la respuesta libre a la pregunta pendiente queda asociada al objetivo', async () => {
    const agent = makeDemoAgent();
    const id = armQualification(agent);
    expect(id).toBe('goal');

    const result = await agent.runTurn('Quiero cambiar de sector');

    expect(result.capturedAnswer?.questionId).toBe('goal');
    expect(result.capturedAnswer?.text).toBe('Quiero cambiar de sector');
    expect(result.reply).toBe(demoGoalReply());
    expect(result.registeredDoubts).toEqual([]);
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(false);
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
    expect(armQualification(agent)).toBe('goal');
    const closing = await agent.runTurn('Quiero cambiar de sector');
    expect(closing.reply).toBe(demoGoalReply());

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

// ---------------------------------------------------------------------------
// Grounding of the optional LLM layer (Phase 1)
// ---------------------------------------------------------------------------

// The approved answer of an FAQ entry, looked up by id (never hardcoded here).
function faqAnswer(id: string): string {
  const found = APPROVED_CONTENT.faq.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`FAQ entry not found: ${id}`);
  return found.answer;
}

// A question that reaches the 'modalidad' entry of the approved profile.
const ONLINE_QUESTION = '¿la formación es online?';

function makeGroundedAgent(provider: MockProvider): MuskAgent {
  return new MuskAgent({ content: APPROVED_CONTENT, provider, lead });
}

describe('fundamentación de la reformulación del LLM (regla 4)', () => {
  // 1. A faithful rephrase (the source's own words) is what the lead
  //    receives, and the turn says the rephrase was grounded.
  it('una reformulación fiel llega al lead y la fundamentación es correcta', async () => {
    const rephrase =
      'Es online: campus virtual, comunidad y tutores personales que te acompañan. No hay horarios fijos de conexión.';
    const provider = new MockProvider(rephrase);
    const agent = makeGroundedAgent(provider);

    const result = await agent.runTurn(ONLINE_QUESTION);

    expect(result.reply).toBe(rephrase);
    expect(result.grounding?.ok).toBe(true);
    expect(result.grounding?.unsupported).toEqual([]);
    expect(result.ruleViolations).toEqual([]);
  });

  // 2. A rephrase that smuggles a price is rejected: the lead receives the
  //    APPROVED text and the unsupported tokens are reported to the operator.
  it('una reformulación que cuela un precio se rechaza y se usa el texto aprobado', async () => {
    const provider = new MockProvider('La formación es online, con clases en directo, y cuesta 500 euros.');
    const agent = makeGroundedAgent(provider);

    const result = await agent.runTurn(ONLINE_QUESTION);

    expect(result.reply).toBe(faqAnswer('modalidad'));
    expect(result.grounding?.ok).toBe(false);
    expect(result.grounding?.unsupported).toContain('500');
  });

  // 3. A rephrase that copies the content of ANOTHER FAQ entry is rejected
  //    too: the source of the matched entry does not support it.
  it('una reformulación que copia otra entrada de la FAQ se rechaza', async () => {
    const provider = new MockProvider(faqAnswer('informacion'));
    const agent = makeGroundedAgent(provider);

    const result = await agent.runTurn(ONLINE_QUESTION);

    expect(result.reply).toBe(faqAnswer('modalidad'));
    expect(result.grounding?.ok).toBe(false);
  });

  // 4. A provider that throws: the approved text is sent (the turn must never
  //    depend on the LLM).
  it('un proveedor que falla devuelve el texto aprobado', async () => {
    const provider = new MockProvider(() => {
      throw new Error('provider down');
    });
    const agent = makeGroundedAgent(provider);

    const result = await agent.runTurn(ONLINE_QUESTION);

    expect(result.reply).toBe(faqAnswer('modalidad'));
  });

  // 5. A provider that returns an empty answer: the approved text is sent.
  it('un proveedor que devuelve una respuesta vacía devuelve el texto aprobado', async () => {
    const provider = new MockProvider('');
    const agent = makeGroundedAgent(provider);

    const result = await agent.runTurn(ONLINE_QUESTION);

    expect(result.reply).toBe(faqAnswer('modalidad'));
  });

  // 6. The request carries the approved answer of the MATCHED entry and
  //    nothing else: the model cannot copy another entry (the leak the old
  //    prompt allowed, because it shipped the whole FAQ).
  it('la petición lleva la respuesta aprobada de la entrada casada y solo esa', async () => {
    const provider = new MockProvider('respuesta');
    const agent = makeGroundedAgent(provider);

    await agent.runTurn(ONLINE_QUESTION);

    expect(provider.calls).toHaveLength(1);
    const system = first(provider.calls).system;
    expect(system).toContain(faqAnswer('modalidad'));
    expect(system).not.toContain(faqAnswer('informacion'));
    expect(system).not.toContain(faqAnswer('salidas'));
  });

  // 7. The verdict is visible to the operator: the turn records a
  //    'grounding' entry, both when the rephrase is accepted and when it is
  //    rejected.
  it('el veredicto queda registrado para el operador', async () => {
    const provider = new MockProvider('La formación es online, con clases en directo, y cuesta 500 euros.');
    const agent = makeGroundedAgent(provider);

    await agent.runTurn(ONLINE_QUESTION);

    const grounding = agent.records.filter((record) => record.kind === 'grounding');
    expect(grounding).toHaveLength(1);
    expect(first(grounding).detail).toContain('rephrase rejected');
    expect(first(grounding).detail).toContain('unsupported');
    expect(first(grounding).detail).toContain('used the approved text');
  });
});

// ---------------------------------------------------------------------------
// The SOURCE of the grounding check: everything the model was shown
// ---------------------------------------------------------------------------
//
// The rule is: the model may only use content it was SHOWN. The source is
// the approved answer of the matched entry PLUS the approved profile context
// (general description + methodology), and NOT the formation name, the
// skills/outcomes lists or the other FAQ entries.
//
// Measured on the DEMO profile: its formation name carries the internal
// marker "(muestra de demo)", which must never be able to reach the lead.
const demoEntry = (id: string) => {
  const found = APPROVED_CONTENT.faq.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`FAQ entry not found: ${id}`);
  return found;
};

const DEMO_ONLINE_QUESTION = 'donde esta la academia?';

function makeDemoGroundedAgent(provider: MockProvider): MuskAgent {
  return new MuskAgent({ content: APPROVED_CONTENT, provider, lead });
}

describe('la fuente de fundamentación es todo lo que se le mostró al modelo', () => {
  // 1. A faithful rephrase that uses a word of the profile context
  //    ("formación", from generalDescription) is ACCEPTED: it was shown, so it
  //    is allowed. This was a false negative: the LLM layer always fell back
  //    to the raw approved text, which costs tokens and adds nothing.
  it('una reformulación fiel que usa una palabra del contexto del perfil se acepta', async () => {
    const rephrase =
      'Es una formación online, con campus virtual, comunidad y tutores personales que te acompañan.';
    const provider = new MockProvider(rephrase);
    const agent = makeDemoGroundedAgent(provider);

    const result = await agent.runTurn(DEMO_ONLINE_QUESTION);

    expect(result.reply).toBe(rephrase);
    expect(result.grounding?.ok).toBe(true);
    expect(result.grounding?.unsupported).toEqual([]);
    expect(result.ruleViolations).toEqual([]);
  });

  // 2. A rephrase that adds a number or a price is still REJECTED: the lead
  //    receives the approved text.
  it('una reformulación que añade un número o un precio se rechaza', async () => {
    const provider = new MockProvider('Todo es online y cuesta 300 euros.');
    const agent = makeDemoGroundedAgent(provider);

    const result = await agent.runTurn(DEMO_ONLINE_QUESTION);

    expect(result.reply).toBe(demoEntry('modalidad').answer);
    expect(result.grounding?.ok).toBe(false);
    expect(result.grounding?.unsupported).toContain('300');
  });

  // 3. A rephrase that uses a word of ANOTHER FAQ entry of the same profile
  //    (and of neither the matched answer nor the profile context) is still
  //    REJECTED: the cross-entry leak stays closed.
  it('una reformulación con una palabra de otra entrada de la FAQ se rechaza', async () => {
    const provider = new MockProvider(
      'Te gradúas con el certificado de la Unión Europea y puedes hacer tu juego en Steam.',
    );
    const agent = makeDemoGroundedAgent(provider);

    const result = await agent.runTurn(DEMO_ONLINE_QUESTION);

    expect(result.reply).toBe(demoEntry('modalidad').answer);
    expect(result.grounding?.ok).toBe(false);
    expect(result.grounding?.unsupported).toContain('graduas');
    expect(result.grounding?.unsupported).toContain('steam');
  });

  // 4. A rephrase that leaks the internal demo marker is REJECTED: the
  //    formation name is not part of the source, so the model cannot say it.
  it('una reformulación que filtra el marcador interno de demo se rechaza', async () => {
    const provider = new MockProvider('Es una formación online de demo, con campus virtual y tutores.');
    const agent = makeDemoGroundedAgent(provider);

    const result = await agent.runTurn(DEMO_ONLINE_QUESTION);

    expect(result.reply).toBe(demoEntry('modalidad').answer);
    expect(result.grounding?.ok).toBe(false);
    expect(result.grounding?.unsupported).toContain('demo');
  });

  // 5. The request carries the matched answer AND the profile context, and
  //    does NOT carry the other FAQ answers nor the formation name.
  it('la petición lleva la respuesta casada y el contexto, y nada más', async () => {
    const provider = new MockProvider('respuesta');
    const agent = makeDemoGroundedAgent(provider);

    await agent.runTurn(DEMO_ONLINE_QUESTION);

    expect(provider.calls).toHaveLength(1);
    const system = first(provider.calls).system;
    // The matched answer (the volatile part) and the profile context (the
    // stable part) are both there.
    expect(system).toContain(demoEntry('modalidad').answer);
    expect(system).toContain(APPROVED_CONTENT.generalDescription);
    expect(system).toContain(APPROVED_CONTENT.methodology);
    // The other FAQ answers are not.
    for (const entry of APPROVED_CONTENT.faq) {
      if (entry.id === 'modalidad') continue;
      expect(system).not.toContain(entry.answer);
    }
    // The formation name (and its internal demo marker) are not.
    expect(system).not.toContain(APPROVED_CONTENT.formationName);
    expect(system).not.toContain('muestra de demo');
  });
});

// Two demo defects found while checking the spec by hand, both user-visible in
// the published demo and both fixed at the routing level, not by rewriting copy:
//
// 1. "¿sigues ahí?" and "qué pena" reached the knowledge base and came back with
//    the "AI is worth it" or "you can take two years" passage. Nonsense replies
//    to a check-in are worse than no reply: the lead reads a bot that is not
//    listening. They are small talk and now classify as such.
// 2. "¿cuántos años dura la formación?" matched the "no tengo tiempo" objection
//    passage because the demo duration entry only knew "cuánto dura" and
//    "cuántos meses". A confident answer to a question nobody asked.
describe('small talk y duración no se responden con la base de conocimiento', () => {
  it('un "¿sigues ahí?" recibe el saludo social, no un pasaje', async () => {
    const agent = makeDemoAgent();

    const result = await agent.runTurn('¿Sigues ahí?');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(buildReply('social'));
    expect(result.registeredDoubts).toHaveLength(0);
  });

  it('"qué pena" es small talk y no una pregunta a la base de conocimiento', () => {
    // Locked at the classifier because a message like this one can legitimately
    // be received as the answer to an armed ask; the defect was the route, not
    // the turn. Before the fix this returned 'kb' and answered with the
    // "la IA sigue mereciendo la pena" passage.
    expect(classify('Qué pena', APPROVED_CONTENT)).toBe('general');
  });

  it('el small talk no se traga un rechazo que empieza igual', async () => {
    const agent = makeDemoAgent();

    const result = await agent.runTurn('Sigues ahí, no me interesa');

    expect(result.intent).toBe('decline');
    expect(result.reply).toBe(buildReply('decline'));
  });

  it('"¿cuántos años dura la formación?" responde la entrada de duración', async () => {
    const agent = makeDemoAgent();

    const result = await agent.runTurn('¿Cuántos años dura la formación?');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(findApprovedAnswer(APPROVED_CONTENT, 'duracion')?.answer);
    expect(result.reply).not.toContain('no tengo tiempo');
  });

  it('las dudas quedan contables y deduplicadas para poder medirlas', async () => {
    const agent = makeDemoAgent();
    const question = '¿Cuánto cobran en las prácticas?';

    await agent.runTurn(question);
    await agent.runTurn(question);

    expect(agent.doubts).toEqual([question]);
  });
});
// ---------------------------------------------------------------------------
// Orientación: el lead que todavía no sabe qué formación elegir
// ---------------------------------------------------------------------------
//
// These phrasings reached rule 5 (registered doubt) before, so a lead who asked
// the single most natural opening question got "no tengo una respuesta
// aprobada" instead of orientation. The cause was NOT missing content: the
// knowledge base already lists "no se por donde empezar", "cual me conviene" and
// "orientame" as terms. It was the scorer: those queries reduce to ONE content
// term after stopword removal, and BM25 cannot reach the 3.5 threshold with a
// single matching term (it lands around 2.4). The calibrated thresholds are a
// documented, held-out-validated decision, so the answer is provided by the
// curated catalogue layer instead of moving the bar.
describe('orientación: el lead que no sabe qué formación elegir', () => {
  const phrasings = [
    'No sé por dónde empezar',
    'Me gustaría que me orientéis un poco',
    'Orientadme un poco, por favor',
    '¿Cuál me conviene más?',
    'Busco un cambio profesional, ¿qué formación me iría mejor?',
    'Quiero cambiar de carrera, ¿por dónde empiezo?',
    'No sé qué hacer con mi vida laboral',
    'Quiero un cambio de sector',
  ];

  it('cada frase recibe la entrada de orientación y no se archiva como duda', async () => {
    const expected = APPROVED_CONTENT.faq.find((entry) => entry.id === 'orientacion')?.answer;

    for (const text of phrasings) {
      const agent = makeDemoAgent();
      const result = await agent.runTurn(text);

      expect(result.intent, text).toBe('general');
      expect(result.reply, text).toBe(expected);
      expect(result.registeredDoubts, text).toHaveLength(0);
      expect(guardReply(result.reply).ok, text).toBe(true);
    }
  });

  it('la orientación no roba las preguntas que la base de conocimiento sí responde', async () => {
    // "¿qué me recomendáis, Python o Full Stack?" is a labelled evaluation case
    // for kb-guia-recomendacion. The catalogue entry must not intercept it: the
    // knowledge base answers a comparison question better than a generic
    // orientation sentence, and the eval dataset locks that expectation.
    for (const text of ['¿Qué me recomendáis?', '¿Qué me recomendáis, Python o Full Stack?']) {
      const agent = makeDemoAgent();
      const result = await agent.runTurn(text);

      expect(result.intent, text).toBe('kb');
    }
  });

  it('la respuesta del lead al objetivo no la roba el catálogo de orientación', async () => {
    // "Quiero cambiar de sector" is BOTH a catalogue keyword (the lead opens
    // with it) and a valid answer to the goal question (the lead replies with
    // it). The pending ask has priority: the answer is captured, not answered
    // from the FAQ. Without that priority the turn returned the orientation
    // sentence and swallowed the lead's answer.
    const agent = makeDemoAgent();
    const id = armQualification(agent);

    const result = await agent.runTurn('Quiero cambiar de sector');

    expect(result.capturedAnswer).toEqual({ questionId: id, text: 'Quiero cambiar de sector' });
    expect(result.reply).not.toBe(APPROVED_CONTENT.faq.find((entry) => entry.id === 'orientacion')?.answer);
    expect(agent.qualificationAnswers).toEqual([{ id, text: 'Quiero cambiar de sector' }]);
  });
});
