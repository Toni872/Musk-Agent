// Mandatory rule tests for the MUSK MVP agent (AGENTS.md):
// price, syllabus, financing, unknown answer, human request, stop request.
// All tests run offline: MockProvider only, no network, no API key.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MuskAgent, type LeadContact } from '../src/agent';
import { APPROVED_CONTENT } from '../src/content';
import { normalizeEs } from '../src/intent';
import { MockProvider } from '../src/llm';
import { ANSWER_TRIGGERS, acceptanceConfirmed, buildReply, expressesFear, extractSpanishPhone, guardReply, momentConfirmed, NEGATED_ACCEPTANCE, PHONE_CUE, REPLY_TEMPLATES, RULES, TRAILING_NEGATOR } from '../src/rules';

const lead: LeadContact = {
  id: 'lead-test-001',
  contact: '+3460000001',
  bucket: 'no_comprador',
};

function makeAgent() {
  const provider = new MockProvider('Respuesta genérica del proveedor que no debería usarse en rutas protegidas.');
  const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead });
  return { agent, provider };
}

// The unified profile carries no open copies, so the "a TODO(decisión) is never
// sent" behaviour is locked with an explicit fixture: it is a rule of the engine,
// not a property of today's copy.
const PENDING_COPY = 'TODO(decisión): pendiente de aprobación de MUSK.';

function pendingContent(): typeof APPROVED_CONTENT {
  return {
    ...APPROVED_CONTENT,
    initialMessage: PENDING_COPY,
    companyPresentation: PENDING_COPY,
    qualificationQuestions: [
      { id: 'starting-experience', text: PENDING_COPY, purpose: 'open decision', reactions: [] },
      { id: 'time-interest', text: PENDING_COPY, purpose: 'open decision', reactions: [] },
    ],
  };
}

describe('mandatory rule tests', () => {
  // 1. Precio: no amount of any kind + invitation to the call.
  it('precio: nunca comunica importes e invita a la llamada', async () => {
    const { agent, provider } = makeAgent();
    const result = await agent.runTurn('¿cuánto cuesta la formación?');

    expect(result.intent).toBe('price');
    expect(result.reply).not.toMatch(/€/);
    expect(result.reply).not.toMatch(/euros/i);
    expect(result.reply).not.toMatch(/\d/); // no numeric amounts
    expect(result.reply).toMatch(/llamada|contacto/i);
    expect(result.ruleViolations).toHaveLength(0);
    // Deterministic path: the LLM is never consulted for guarded intents.
    expect(provider.calls).toHaveLength(0);
  });

  // 2. Temario: no detailed syllabus; general content + call redirect.
  it('temario: no revela el temario detallado y reconduce a la llamada', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('¿puedes pasarme el temario detallado?');

    expect(result.intent).toBe('temario');
    expect(result.reply).not.toMatch(/\b(m[oó]dulo|unidad|tema|semana|lecci[oó]n)\s+\d+\b/i);
    expect(result.reply).toMatch(/habilidades|contenido general|salidas/i);
    expect(result.reply).toMatch(/llamada/i);
    expect(result.ruleViolations).toHaveLength(0);
  });

  // 3. Financiación: generic (options exist) + refer to a person/call.
  it('financiacion: respuesta genérica sin condiciones, importes ni promesas', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('¿hay financiación?');

    expect(result.intent).toBe('financiacion');
    expect(result.reply).toBe(APPROVED_CONTENT.financingReply);
    expect(result.reply).toMatch(/opciones/i);
    expect(result.reply).toMatch(/dos años.*flexibilidad/i);
    expect(result.reply).toMatch(/llamada/i);
    expect(result.reply).not.toMatch(/\d|%|€/i); // no amounts, no percentages
    expect(result.reply).not.toMatch(/sin intereses|inter[eé]s cero|cuotas fijas|garantiz/i); // no conditions, no promises
    expect(result.ruleViolations).toHaveLength(0);
  });

  // 4. Respuesta desconocida: registers the doubt, proposes human contact,
  //    invents nothing about the topic.
  it('respuesta desconocida: registra la duda y propone contacto humano sin inventar', async () => {
    const { agent, provider } = makeAgent();
    const message = '¿dais un título oficial?';
    const result = await agent.runTurn(message);

    expect(result.intent).toBe('unknown');
    expect(result.registeredDoubts).toContain(message);
    expect(result.reply).toMatch(/duda/i);
    expect(result.reply).toMatch(/persona|equipo|contact/i);
    expect(result.reply).not.toMatch(/t[ií]tulo/i); // no invented answer about the topic
    expect(result.action).toBe('none'); // proposal only, not a confirmed trigger
    expect(provider.calls).toHaveLength(0);
  });

  // 5. Petición humano: confirmed handoff with contact context for the commercial.
  it('peticion humano: deriva con contexto de contacto suficiente', async () => {
    const { agent } = makeAgent();
    const message = 'prefiero hablar con una persona';
    const result = await agent.runTurn(message);

    expect(result.intent).toBe('human');
    expect(result.action).toBe('handoff');
    expect(result.handoff).toBeDefined();
    expect(result.handoff?.reason).toBe('human_requested');
    expect(result.handoff?.leadId).toBe(lead.id);
    expect(result.handoff?.contact).toBe(lead.contact);
    expect(result.handoff?.bucket).toBe(lead.bucket);
    expect(result.handoff?.lastMessage).toContain('persona');
    expect(result.handoff?.summary.length).toBeGreaterThan(0);
  });

  // 6. Petición parada: stops, registers "no continuar", and a subsequent
  //    turn in the same conversation generates no marketing follow-up.
  it('peticion parada: detiene, registra no continuar y suprime seguimiento', async () => {
    const { agent } = makeAgent();
    const first = await agent.runTurn('no me escribas más');

    expect(first.intent).toBe('stop');
    expect(first.action).toBe('stop');
    expect(first.registeredNoContinuar).toBe(true);
    expect(first.reply).toMatch(/no continuar/i);
    expect(agent.isStopped).toBe(true);
    expect(agent.records.some((record) => record.kind === 'stop')).toBe(true);

    const second = await agent.runTurn('gracias, lo miro y te digo');
    expect(second.suppressed).toBe(true);
    expect(second.reply).toBe('');
    expect(second.action).not.toBe('handoff');
    expect(second.registeredDoubts).toHaveLength(0);
    expect(second.ruleViolations).toHaveLength(0);
  });

  // 6b. Regresión (regla 7): las variantes naturales con pronombre final
  //     ("deja de escribirme") o sin "más" también deben detectarse como parada.
  it('peticion parada: detecta variantes naturales ("deja de escribirme")', async () => {
    const { agent } = makeAgent();
    const first = await agent.runTurn('mira, no me interesa, deja de escribirme');

    expect(first.intent).toBe('stop');
    expect(first.action).toBe('stop');
    expect(first.registeredNoContinuar).toBe(true);
    expect(agent.isStopped).toBe(true);

    const second = await agent.runTurn('bueno, entonces gracias');
    expect(second.suppressed).toBe(true);
    expect(second.reply).toBe('');
  });

  // 7a. Regresión (regla 7): variantes naturales de baja y cese de contacto.
  it('peticion parada: cubre variantes de baja y cese de contacto', async () => {
    const phrases = [
      'quiero darme de baja',
      'no me escribas más, por favor',
      'deja de escribirme',
      'no quiero que me contactes',
      'déjame en paz',
      'baja de la lista',
      'no vuelvas a contactarme',
      'no me escribáis más',
      'no me contactéis',
      'no me llaméis más',
      'no me mandéis más mensajes',
      'no me escribís más',
      'no quiero que me escribáis',
    ];
    for (const phrase of phrases) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(phrase);
      expect(result.intent, `"${phrase}" debería detectarse como parada`).toBe('stop');
      expect(result.action).toBe('stop');
      expect(result.registeredNoContinuar).toBe(true);
    }
  });

  // 7b. Precisión (reglas 7/8): las objeciones y negativas puntuales NO deben
  //     interpretarse como parada, para no matar conversaciones válidas.
  it('peticion parada: no confunde objeciones ni negativas con una parada', async () => {
    const notStops = [
      'no me mandes el temario, prefiero verlo en la llamada',
      'no tengo tiempo ahora mismo',
      'no me interesa el temario detallado',
    ];
    for (const phrase of notStops) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(phrase);
      expect(result.intent, `"${phrase}" NO debería ser parada`).not.toBe('stop');
      expect(result.registeredNoContinuar).toBe(false);
    }
  });

  // 7c. Regla 1: las objeciones de precio sin la palabra "precio" reconducen a
  //     la llamada sin dar importes ni consultar al LLM.
  it('objecion de precio ("me parece muy caro") reconduce sin importes', async () => {
    const { agent, provider } = makeAgent();
    const result = await agent.runTurn('me parece muy caro');
    expect(result.intent).toBe('price');
    expect(result.reply).not.toMatch(/\d|€|euros/i);
    expect(result.reply).toMatch(/llamada|contacto/i);
    expect(provider.calls).toHaveLength(0);
  });

  // 7d. Precisión: un "no ..." sustantivo (objeción de tiempo) no debe
  //     responderse con el saludo social. La objeción tiene pasaje aprobado, así
  //     que se contesta desde la base de conocimiento (regla 4) y no se registra
  //     como duda: el lead recibe el plazo aprobado y la vía de la llamada.
  it('un "no ..." sustantivo no se responde con el saludo social', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('no tengo tiempo ahora mismo');
    expect(result.intent).toBe('kb');
    expect(result.reply).toMatch(/dos años|flexibilidad/i);
    expect(result.reply).not.toMatch(/asistente de MUSK/i);
    expect(result.registeredDoubts).toHaveLength(0);
  });

  // 7e. Precisión: un mensaje sustantivo que EMPIEZA con "gracias" no debe
  //     caer en el saludo social ("gracias, no tengo tiempo" -> respuesta de la
  //     objeción, "gracias, no me interesa" -> decline).
  it('un mensaje que empieza con "gracias" mantiene su intent real', async () => {
    const { agent } = makeAgent();
    const time = await agent.runTurn('gracias, no tengo tiempo ahora mismo');
    expect(time.intent).toBe('kb');
    expect(time.reply).toMatch(/dos años|flexibilidad/i);
    expect(time.reply).not.toMatch(/asistente de MUSK/i);

    const decline = await agent.runTurn('gracias, no me interesa');
    expect(decline.intent).toBe('decline');
    expect(decline.reply).not.toMatch(/assistente de MUSK/i);
  });

  // 8 (regla 5, familia decline): un "no me interesa" seco es una negativa
  //    suave: NO es parada (regla 7) ni disparador confirmado (regla 9). Se
  //    responde con la plantilla dedicada (copy coherente, sin "Buena
  //    pregunta"), se registra la duda y la conversación sigue viva.
  it('rechazo amable: un "no me interesa" seco usa la plantilla dedicada y no para', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('no me interesa');

    expect(result.intent).toBe('decline');
    expect(result.action).toBe('none');
    expect(result.registeredNoContinuar).toBe(false);
    expect(agent.isStopped).toBe(false);
    expect(result.registeredDoubts).toContain('no me interesa');
    expect(result.reply).toMatch(/entendido|respeto/i);
    expect(result.reply).not.toMatch(/buena pregunta/i);
    expect(result.reply).not.toMatch(/\d|€|euros/i);
    expect(result.ruleViolations).toHaveLength(0);

    // La conversación sigue viva: un turno posterior NO está suprimido.
    const second = await agent.runTurn('¿y qué salidas tiene?');
    expect(second.suppressed).toBe(false);
  });

  // 8b. Rechazo amable: variantes del decline + precisión. Las frases con un
  //     topic específico ("el temario", "el precio", "la financiación") ganan
  //     su intent específico, y las de parada ganan a decline.
  it('rechazo amable: variantes y precisión sobre los otros intents', async () => {
    const declines = [
      'no me interesa',
      'no me interesa, gracias',
      'no me interesa ahora',
      'no me interesa en este momento',
      'no estoy interesado',
      'no estoy interesada, gracias',
      'gracias, no me interesa',
    ];
    for (const phrase of declines) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(phrase);
      expect(result.intent, `"${phrase}" debería ser decline`).toBe('decline');
      expect(result.action).toBe('none');
      expect(result.registeredNoContinuar).toBe(false);
    }

    const notDeclines: Array<[string, string]> = [
      ['no me interesa el temario detallado', 'temario'],
      ['no me interesa el precio', 'price'],
      ['no me interesa la financiación', 'financiacion'],
      ['no tengo tiempo ahora mismo', 'kb'],
      ['no me escribáis más', 'stop'],
      ['no me interesa seguir', 'stop'],
    ];
    for (const [phrase, expected] of notDeclines) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(phrase);
      expect(result.intent, `"${phrase}" debería ser ${expected}`).toBe(expected);
      expect(result.intent).not.toBe('decline');
    }
  });
});

describe('respuestas de precio y financiación configuradas en el perfil', () => {
  it('usa el copy autorizado y protegido, incluido el precio y la objeción «es caro»', async () => {
    const content = APPROVED_CONTENT;

    const priceAgent = new MuskAgent({ content, provider: null, lead });
    for (const message of ['¿cuánto cuesta?', 'es caro']) {
      const price = await priceAgent.runTurn(message);
      expect(price.intent).toBe('price');
      expect(price.reply).toBe(content.priceReply);
      expect(price.reply).not.toMatch(/\d|€|\beuros?\b|intereses|cuotas/i);
      expect(guardReply(price.reply).ok).toBe(true);
      expect(price.ruleViolations).toEqual([]);
    }

    const financingAgent = new MuskAgent({ content, provider: null, lead });
    const financing = await financingAgent.runTurn('¿hay financiación?');
    expect(financing.intent).toBe('financiacion');
    expect(financing.reply).toBe(content.financingReply);
    expect(financing.reply).toContain('dos años');
    expect(financing.reply).not.toMatch(/\d|€|\beuros?\b|intereses|cuotas/i);
    expect(guardReply(financing.reply).ok).toBe(true);
    expect(financing.ruleViolations).toEqual([]);
  });


  it('conserva las plantillas anteriores como fallback de un perfil sin copy específico', async () => {
    const content = { ...APPROVED_CONTENT, priceReply: undefined, financingReply: undefined };
    const agent = new MuskAgent({ content, provider: null, lead });

    expect((await agent.runTurn('¿cuánto cuesta?')).reply).toBe(buildReply('price'));
    expect((await agent.runTurn('¿hay financiación?')).reply).toBe(buildReply('financing'));
  });
});

describe('structural guards', () => {
  // Content schema: no price/amount fields, no syllabus field, no money text.
  it('content.ts schema has no price/temario fields nor money text', () => {
    const keys = Object.keys(APPROVED_CONTENT);
    expect(keys.some((key) =>
      /price|precio|amount|importe|cost|fee|budget|temario|syllabus|curriculum|financ/i.test(key) &&
      !['priceReply', 'financingReply'].includes(key),
    )).toBe(
      false,
    );
    const json = JSON.stringify(APPROVED_CONTENT);
    expect(json).not.toMatch(/€/);
    expect(json).not.toMatch(/\beuros?\b/i);
    // Rule data in rules.ts must cover all 11 hard rules from AGENTS.md.
    expect(RULES).toHaveLength(11);
  });

  // The profile was unified: every lead-facing copy item is now written, so no
  // open decision is left in the file. A new TODO(decisión) resurrects the
  // "never sent" behaviour, so the invariant is: the profile ships none.
  it('src/content.ts leaves no open copy marked as TODO(decisión)', () => {
    // The comment that documents the marker itself is fine; what must never
    // exists is a TODO marker reaching a lead-facing string value.
    expect(JSON.stringify(APPROVED_CONTENT)).not.toMatch(/TODO\(decisi/i);
  });

  // Approved FAQ answers are lead-facing: they must pass the output guard, so a
  // question routed to an approved answer can never leak a forbidden response.
  // This is the single profile now, so it also locks what DEMO used to lock.
  it('APPROVED_CONTENT: sin importes y respuestas FAQ válidas para el guard', () => {
    const json = JSON.stringify(APPROVED_CONTENT);
    expect(json).not.toMatch(/€/);
    expect(json).not.toMatch(/\beuros?\b/i);
    for (const entry of APPROVED_CONTENT.faq) {
      const result = guardReply(entry.answer);
      expect(result.ok, `FAQ "${entry.id}" no debe violar el guard: ${JSON.stringify(result.violations)}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Apertura y cualificación del flujo mínimo (spec §3.2 y §4)
// ---------------------------------------------------------------------------

describe('apertura y cualificación (MVP spec §4)', () => {
  // §3.2: the conversation is opened by the initial message ("contacto WhatsApp
  // sobre la formación de interés"). The DEMO sample carries a real one, so
  // there the flow is complete end to end.
  it('apertura: con contenido real (DEMO) se envía el mensaje inicial', () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, lead });
    const opening = agent.opening();

    expect(opening).toBe(APPROVED_CONTENT.initialMessage);
    expect(guardReply(opening as string).ok).toBe(true);
    expect(agent.pendingDecisions).toHaveLength(0);
    // WhatsApp opening: brief enough to read on a phone, and one ask only.
    expect((opening as string).length).toBeLessThan(300);
    expect(((opening as string).match(/\?/g) ?? [])).toHaveLength(1);
  });

  // The fear detector is the door of the reassurance path, so its boundaries are
  // part of the contract: identity forms in, the comparative "mayor" out ("el
  // mayor problema" is an objection, not a fear about oneself).
  it('expressesFear reconoce las formas de identidad y descarta el comparativo', () => {
    expect(expressesFear(normalizeEs('no sé si sirvo'))).toBe(true);
    expect(expressesFear(normalizeEs('no tengo base técnica'))).toBe(true);
    expect(expressesFear(normalizeEs('soy mayor para estudiar'))).toBe(true);
    expect(expressesFear(normalizeEs('me da miedo programar'))).toBe(true);
    expect(expressesFear(normalizeEs('el mayor problema es el horario'))).toBe(false);
    expect(expressesFear(normalizeEs('quiero cambiar de sector'))).toBe(false);
  });

  // Reassurance states only approved facts (starts from scratch, personal tutor),
  // so it must pass the same guard as every other lead-facing template, and keep
  // the one-question-per-message rule.
  it('la plantilla de reassurance cumple el guardián y hace una sola pregunta', () => {
    const reassurance = buildReply('reassurance');

    expect(guardReply(reassurance).ok).toBe(true);
    expect((reassurance.match(/\?/g) ?? [])).toHaveLength(1);
    expect(reassurance).not.toMatch(/\d/);
  });

  it('la pregunta y el cierre son breves, configurables y plantean una pregunta cada vez', () => {
    const question = APPROVED_CONTENT.qualificationQuestions[0]?.text ?? '';
    const closing = APPROVED_CONTENT.closingInvitation ?? '';

    expect(APPROVED_CONTENT.qualificationQuestions).toHaveLength(1);
    expect(APPROVED_CONTENT.qualificationQuestions[0]?.id).toBe('goal');
    expect(question).toBe('Primero cuéntame qué buscas: si no encaja, te lo digo yo. ¿Tienes algo en mente?');
    expect(closing).toBe('¿Qué día y a qué hora te viene bien que el equipo te llame?');
    expect(closing.length).toBeLessThanOrEqual(200);
    expect((question.match(/\?/g) ?? [])).toHaveLength(1);
    expect((closing.match(/\?/g) ?? [])).toHaveLength(1);
    expect(guardReply(question).ok).toBe(true);
    expect(guardReply(closing).ok).toBe(true);
  });

  // Rule 4: a TODO(decisión) placeholder is not lead-facing content. While the
  // initial message is still open with MUSK, nothing is sent and the item stays
  // visible as a pending decision instead of being invented.
  it('apertura: un TODO(decisión) no se envía y queda como decisión abierta', () => {
    const agent = new MuskAgent({ content: pendingContent(), provider: null, lead });

    expect(agent.opening()).toBeNull();
    expect(agent.pendingDecisions).toContain('initialMessage');
  });

  // Same rule for qualification: never asked while the text is a placeholder,
  // and never replaced by a made-up question.
  it('cualificación: un texto TODO(decisión) no se pregunta', () => {
    const agent = new MuskAgent({ content: pendingContent(), provider: null, lead });

    expect(agent.nextQualificationQuestion()).toBeNull();
    expect(agent.pendingDecisions).toEqual([
      'initialMessage',
      'companyPresentation',
      'qualificationQuestions/starting-experience',
      'qualificationQuestions/time-interest',
    ]);
  });

  // §4: pocas preguntas, una cada vez, sin examen, sin puntuación y sin
  // exclusión automática — el arnés no descarta a nadie.
  it('cualificación: una pregunta cada vez, en orden y sin excluir', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, lead });

    expect(agent.nextQualificationQuestion()?.id).toBe('goal');
    // Una cada vez: con un ask armado no se pregunta otra cosa, porque la
    // respuesta del lead acabaría archivada contra la pregunta equivocada.
    expect(agent.nextQualificationQuestion()).toBeNull();

    const goal = await agent.runTurn('Quiero cambiar de sector');
    expect(goal.capturedAnswer?.questionId).toBe('goal');
    expect(goal.reply).toBe(
      `Entiendo: buscas prepararte para cambiar de sector. ${APPROVED_CONTENT.closingInvitation}`,
    );
    // Sin preguntas aprobadas pendientes: el flujo pasa a la llamada.
    expect(agent.nextQualificationQuestion()).toBeNull();

    expect(agent.records.filter((record) => record.kind === 'question')).toHaveLength(1);
    expect(agent.isStopped).toBe(false);
  });

  // Rules 7 and 9: once the lead stops, or is handed to a person, the agent
  // asks nothing else.
  it('cualificación: no pregunta tras una parada ni tras un handoff', async () => {
    const stopped = new MuskAgent({ content: APPROVED_CONTENT, lead });
    await stopped.runTurn('no me escribas más');
    expect(stopped.isStopped).toBe(true);
    expect(stopped.nextQualificationQuestion()).toBeNull();

    const handedOff = new MuskAgent({ content: APPROVED_CONTENT, lead });
    const result = await handedOff.runTurn('bueno, me va bien una llamada');
    expect(result.action).toBe('handoff');
    expect(handedOff.nextQualificationQuestion()).toBeNull();
  });

  // Structural: everything the agent can open with or ask is lead-facing, so it
  // must pass the output guard — and no path may ever return a raw TODO stub.
  it('estructural: apertura y preguntas pasan el guard y nunca devuelven un TODO', async () => {
    const demo = new MuskAgent({ content: APPROVED_CONTENT, lead });
    const opening = demo.opening();

    expect(opening).toBe(APPROVED_CONTENT.initialMessage);
    expect(guardReply(opening as string).ok).toBe(true);

    let question = demo.nextQualificationQuestion();
    let asked = 0;
    while (question) {
      expect(question.text).not.toMatch(/TODO/);
      const result = guardReply(question.text);
      expect(
        result.ok,
        `pregunta "${question.id}" no debe violar el guard: ${JSON.stringify(result.violations)}`,
      ).toBe(true);
      asked += 1;
      // Se responde para poder armar la siguiente: un ask armado no se roba.
      await demo.runTurn('sí');
      question = demo.nextQualificationQuestion();
    }
    expect(asked).toBe(1);

    // The approved profile ships both items: nothing is left open, so the flow
    // is complete end to end without a single made-up sentence.
    const approved = new MuskAgent({ content: APPROVED_CONTENT, lead });
    expect(approved.opening()).toBe(APPROVED_CONTENT.initialMessage);
    expect(approved.pendingDecisions).toHaveLength(0);
    expect(approved.nextQualificationQuestion()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cobertura de información aprobada (sin inventar): las preguntas más
// frecuentes de un lead reactivado deben alcanzar contenido YA aprobado en vez
// de caer en la regla 5, y nunca deben poder sacar precio, temario ni promesas.
// ---------------------------------------------------------------------------

describe('cobertura de información (routing a contenido aprobado)', () => {
  // No provider: the raw approved FAQ answer is what the lead receives on the
  // deterministic path (the simulator without MUSK_LLM_* configured).
  function makePlainAgent() {
    return new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead });
  }

  it('"dame información sobre Musk" responde en vez de caer en la regla 5', async () => {
    const agent = makePlainAgent();
    const result = await agent.runTurn('hola, dame información sobre Musk');

    expect(result.intent).toBe('general');
    expect(result.registeredDoubts).toHaveLength(0);
    expect(result.reply).toMatch(/MUSK/i);
    expect(result.reply).toMatch(/formación|Full Stack/i);
    expect(result.reply).not.toMatch(/no tengo una respuesta aprobada/i);
    expect(result.ruleViolations).toHaveLength(0);
  });

  const routed: Array<{ message: string; expected: RegExp }> = [
    { message: '¿de qué va el curso?', expected: /online y prácticas|programación, videojuegos e IA/i },
    { message: 'quiero más información', expected: /online y prácticas|programación, videojuegos e IA/i },
    { message: '¿qué voy a aprender?', expected: /fundamentos sólidos|metodologías ágiles/i },
    { message: '¿qué salidas tiene?', expected: /perfiles junior|portafolio/i },
    { message: '¿cómo son las clases?', expected: /proyectos guiados|clases en directo|tutorías/i },
    { message: '¿cómo funciona la metodología?', expected: /proyectos guiados|clases en directo|tutorías/i },
    { message: '¿me contáis los requisitos?', expected: /conocimientos previos|desde la base/i },
    { message: '¿cuánto dura el curso?', expected: /dos años|flexibilidad/i },
  ];

  for (const { message, expected } of routed) {
    it(`routing: "${message}" usa contenido aprobado`, async () => {
      const agent = makePlainAgent();
      const result = await agent.runTurn(message);

      expect(result.intent).toBe('general');
      expect(result.reply).toMatch(expected);
      expect(result.registeredDoubts).toHaveLength(0);
      expect(result.ruleViolations).toHaveLength(0);
      // No amount, percentage or digit of any kind can slip through.
      expect(result.reply).not.toMatch(/€|\beuros?\b|\d/i);
    });
  }


  // Precision: the broad 'informacion' entry must never steal a forbidden topic —
  // forbidden topics are classified BEFORE the FAQ is consulted, so asking about
  // prices *with* the word "información" is still a price question.
  it('precisión: "información sobre los precios" sigue siendo precio', async () => {
    const agent = makePlainAgent();
    const result = await agent.runTurn('quiero información sobre los precios');

    expect(result.intent).toBe('price');
    expect(result.reply).not.toMatch(/€|\beuros?\b|\d/i);
  });

  // Regression: the positive keywords added for routing must not capture the
  // soft decline (rule 5 family), which is classified after the FAQ.
  it('precisión: "no me interesa" sigue siendo decline', async () => {
    const agent = makePlainAgent();
    const result = await agent.runTurn('no me interesa');

    expect(result.intent).toBe('decline');
    expect(result.registeredNoContinuar).toBe(false);
  });

  // Rule 4: the company presentation is a minimum content item (spec §3.6). The
  // unified profile carries approved copy, so it is delivered — and it must never
  // leak the placeholder marker nor an unapproved claim.
  it('la presentación de MUSK se envía con copy aprobado y sin marcadores', async () => {
    const agent = makePlainAgent();

    expect(agent.pendingDecisions).not.toContain('companyPresentation');
    expect(guardReply(APPROVED_CONTENT.companyPresentation).ok).toBe(true);
    const result = await agent.runTurn('¿qué es MUSK?');
    // The placeholder marker ("TODO(decisión)…") is never sent. (Matched
    // precisely, so the ordinary Spanish word "todo" cannot produce a false
    // positive.)
    expect(result.reply).not.toMatch(/TODO\(decisi/i);
    expect(result.reply).toMatch(/Escuela Musk|formación/i);
    expect(result.registeredDoubts).toHaveLength(0);
    expect(result.ruleViolations).toHaveLength(0);
  });

  // Structural: every FAQ answer is guard-clean and carries no amounts/digits,
  // so the routing above can never leak a forbidden response.
  it('todas las respuestas FAQ pasan el guard y no llevan importes', () => {
    for (const entry of APPROVED_CONTENT.faq) {
      expect(guardReply(entry.answer).ok, `FAQ ${entry.id} debe pasar el guard`).toBe(true);
      expect(entry.answer, `FAQ ${entry.id} sin importes ni cifras`).not.toMatch(/€|\beuros?\b|\d/i);
      expect(entry.keywords.length, `FAQ ${entry.id} necesita keywords`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Answer vocabulary for the call proposal (rule 9): an explicit moment closes
// the handoff, an explicit non-availability never does, and a phone number
// counts only when it is a real Spanish mobile handed over on purpose.
// Trigger patterns run against folded text (normalizeEs: lowercase, accents
// stripped), so the unit tests fold the same way the engine does.
// ---------------------------------------------------------------------------

describe('vocabulario de respuesta a la propuesta de llamada (regla 9)', () => {
  it('availability: un momento explícito sí, un saludo jamás', () => {
    // "buenas tardes" alone is a greeting, not a moment: no availability
    // context ("por", "esta", "a las ..."), so it must never close (rule 9).
    expect(ANSWER_TRIGGERS.availability.test(normalizeEs('buenas tardes'))).toBe(false);
    expect(ANSWER_TRIGGERS.availability.test(normalizeEs('por las tardes'))).toBe(true);
    expect(ANSWER_TRIGGERS.availability.test(normalizeEs('sí, sobre las seis'))).toBe(true);
    expect(ANSWER_TRIGGERS.availability.test(normalizeEs('lo antes posible'))).toBe(false);
  });

  it('nonAvailability: la indisponibilidad explícita se detecta siempre', () => {
    expect(ANSWER_TRIGGERS.nonAvailability.test(normalizeEs('no puedo'))).toBe(true);
    // Evaluated BEFORE availability: a refusal that names a moment still wins.
    expect(ANSWER_TRIGGERS.nonAvailability.test(normalizeEs('no puedo por la tarde'))).toBe(true);
  });

  it('extractSpanishPhone: solo un móvil real entregado a propósito', () => {
    // Digits of two dates, concatenated, hide a 9-digit window starting with
    // 6/7/9: no cue, not a whole-message number → null, never a handoff.
    expect(extractSpanishPhone('el 12/03/2027 y el 15/06/2027')).toBeNull();
    // Country code glued on is not a 9-digit mobile: null.
    expect(extractSpanishPhone('34612345678')).toBeNull();
    // A handed-over number returns the 9 digits, separators removed.
    expect(extractSpanishPhone('mi número es 612 345 678')).toBe('612345678');
    expect(extractSpanishPhone('+34 612 345 678')).toBe('612345678');
    // The cue is what authorises a number embedded in a longer message.
    expect(PHONE_CUE.test(normalizeEs('te dejo mi número'))).toBe(true);
    expect(PHONE_CUE.test(normalizeEs('buenas tardes'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Aceptación negada (regla 9): un "no" que scopes la frase de aceptación es
// una negación, nunca un disparador confirmado. Antes de esto,
// "no me viene bien" clasificaba como 'general' y el camino de mensaje nuevo
// cerraba la conversación como call_accepted con "Perfecto, dejo anotado que
// te va bien la llamada" — un lead que acaba de decir que la llamada NO le
// convenía. Todos los caminos nuevos reutilizan plantillas EXISTENTES de
// REPLY_TEMPLATES (ningún copy nuevo para el lead, regla 11).
// ---------------------------------------------------------------------------

describe('aceptación negada (regla 9): el "no" anula la aceptación', () => {
  // F1, fresh-message path: classify() now returns 'unknown' for a negated
  // acceptance, so runTurn replies with the existing rule 5 doubt — the doubt
  // is registered, no handoff fires, no stop fires (rule 7 does not apply
  // here) and no rule violation is produced.
  it('una aceptación negada NUNCA dispara el handoff como mensaje nuevo', async () => {
    const negated = [
      'no me viene bien',
      'no me va bien',
      'no, no me viene bien',
      'no acepto la llamada',
      'no, no acepto',
      'nunca me viene bien',
      'tampoco me viene bien',
      'jamás me viene bien',
      'nunca por las tardes',
      'para nada me viene bien',
      'me viene bien, no',
      'me viene bien pero no',
    ];
    for (const message of negated) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(message);

      expect(result.intent, `"${message}" debería clasificarse como unknown`).toBe('unknown');
      expect(result.action, `"${message}" no debe derivar`).toBe('none');
      expect(result.handoff).toBeUndefined();
      expect(result.reply, `"${message}" debe reutilizar la plantilla de duda`).toBe(buildReply('doubt'));
      expect(result.registeredDoubts).toContain(message);
      expect(result.ruleViolations).toHaveLength(0);
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
      expect(agent.isStopped).toBe(false);
    }
  });

  // F1, the safe direction must NOT eat real acceptances: these close exactly
  // as before, with the approved callAccepted copy and no rule violations.
  it('las aceptaciones sin negar siguen cerrando con el copy aprobado', async () => {
    const confirmed = ['acepto la llamada', 'me viene bien', 'sí, me viene bien'];
    for (const message of confirmed) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(message);

      expect(result.intent, `"${message}" debería clasificarse como general`).toBe('general');
      expect(result.action, `"${message}" debe derivar`).toBe('handoff');
      expect(result.handoff?.reason).toBe('call_accepted');
      expect(result.reply).toBe(buildReply('callAccepted'));
      expect(result.ruleViolations).toHaveLength(0);
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
    }
  });

  // F3, fresh message: "cuando puedas" (the tuteo form) is a confirmed
  // acceptance (rule 9) and closes with the already-approved copy.
  it('"cuando puedas" (mensaje nuevo) → handoff con el copy aprobado', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('cuando puedas');

    expect(result.intent).toBe('general');
    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
    expect(result.reply).toBe(buildReply('callAccepted'));
    expect(result.ruleViolations).toHaveLength(0);
    expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
  });

  // F3 + rule 7: adding "llamame/llamadme" to the acceptance trigger must NOT
  // catch a request to stop — "no me llames" is a rule 7 stop through
  // STOP_TRIGGER (which classify() tests first), so it can never handoff.
  it('regla 7: "no me llames" es parada y jamás un handoff (aunque "llamame" acepta)', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('no me llames');

    expect(result.intent).toBe('stop');
    expect(result.action).toBe('stop');
    expect(result.handoff).toBeUndefined();
    expect(result.registeredNoContinuar).toBe(true);
    expect(result.ruleViolations).toHaveLength(0);
    expect(agent.isStopped).toBe(true);
  });

  // F4 (rule 9): the "que me ..." paradigm only covered "llame"/"llamen", so a
  // lead explicitly asking to be called in tuteo or vosotros ("quiero que me
  // llameis", "quiero que me llames") got the rule 5 doubt reply with NO
  // handoff at all. An explicit request to be called IS the rule 9 trigger.
  it('regla 9: "quiero que me llameis" deriva; no se queda en duda', async () => {
    const requests = [
      'quiero que me llameis',
      'quiero que me llames',
      'me podeis llamar?',
      '¿me puedes llamar?',
    ];
    for (const message of requests) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(message);

      expect(result.intent, `"${message}" debería clasificarse como general`).toBe('general');
      expect(result.action, `"${message}" debe derivar (regla 9)`).toBe('handoff');
      expect(result.handoff?.reason).toBe('call_accepted');
      expect(result.reply).toBe(buildReply('callAccepted'));
      expect(result.registeredDoubts).toHaveLength(0);
      expect(result.ruleViolations).toHaveLength(0);
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
    }
  });

  // F4 + rule 7: the widened trigger must not swallow a request to stop.
  it('regla 7: "no quiero que me llameis" es parada, nunca handoff', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('no quiero que me llameis');

    expect(result.intent).toBe('stop');
    expect(result.action).toBe('stop');
    expect(result.handoff).toBeUndefined();
    expect(result.registeredNoContinuar).toBe(true);
    expect(agent.isStopped).toBe(true);
  });

  // Coherence: a greeting with a neutral preamble asks nothing, so it must be
  // answered as social small talk and must NOT be filed as a doubt.
  it('un saludo con contexto no registra una duda falsa', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('hola, vi vuestro mensaje');

    expect(result.intent).toBe('general');
    expect(result.reply).toBe(buildReply('social'));
    expect(result.registeredDoubts).toHaveLength(0);
    expect(agent.doubts).toHaveLength(0);
    expect(result.ruleViolations).toHaveLength(0);
  });

  // Coherence: a greeting that DOES ask something still reaches the doubt path
  // when no approved passage answers it (the leading-greeting rule asks for a
  // question-free message, so this never suppresses a real question).
  it('un saludo con una pregunta real sigue yendo a la duda (no se traga)', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('hola, ¿cuánto cobran en las prácticas?');

    expect(result.registeredDoubts).toContain('hola, ¿cuánto cobran en las prácticas?');
  });

  // Coherence: "gracias" is a closing, not a greeting. Replying with the
  // greeting opener re-opened a conversation that was ending.
  it('"gracias" cierra la conversación en lugar de saludar de nuevo', async () => {
    const closings = ['gracias', 'muchas gracias', 'hasta luego', 'adiós'];
    for (const message of closings) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(message);

      expect(result.intent, `"${message}"`).toBe('general');
      expect(result.reply, `"${message}" debe cerrar`).toBe(buildReply('closing'));
      expect(result.registeredDoubts).toHaveLength(0);
      expect(result.ruleViolations).toHaveLength(0);
      expect(Object.values(REPLY_TEMPLATES)).toContain(result.reply);
    }
  });

  // Coherence: "me interesa" is a statement, not a question. It must advance to
  // the approved call proposal instead of the rule 5 doubt and must not be
  // counted as a doubt (the pilot KPI measures real doubts).
  it('una declaración de interés avanza a la propuesta de llamada sin duda', async () => {
    const statements = ['me interesa', 'me interesa mucho', 'estoy interesado'];
    for (const message of statements) {
      const { agent } = makeAgent();
      const result = await agent.runTurn(message);

      expect(result.intent, `"${message}"`).toBe('general');
      expect(result.reply, `"${message}"`).toBe(buildReply('callProposal'));
      expect(result.registeredDoubts).toHaveLength(0);
      expect(agent.doubts).toHaveLength(0);
      expect(result.ruleViolations).toHaveLength(0);
    }
  });

  // The interest trigger must never catch the soft decline (rule 5 family).
  it('"no me interesa" sigue siendo decline, no interés', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('no me interesa');

    expect(result.intent).toBe('decline');
    expect(result.reply).toBe(buildReply('decline'));
  });

  // The predicates themselves: the trigger must match AND the negation guard
  // must not scope it. NEGATED_ACCEPTANCE tests the TAIL of the text that
  // PRECEDES the trigger match (the predicates slice it), never a whole
  // message — one narrow guard, not a negation engine.
  it('acceptanceConfirmed: el disparador coincide y el "no" no lo scopes', () => {
    expect(acceptanceConfirmed(normalizeEs('acepto la llamada'))).toBe(true);
    expect(acceptanceConfirmed(normalizeEs('sí, me viene bien'))).toBe(true);
    expect(acceptanceConfirmed(normalizeEs('cuando puedas'))).toBe(true);
    expect(acceptanceConfirmed(normalizeEs('no me viene bien'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('no, no acepto la llamada'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('me gusta el cine'))).toBe(false);
    // F4: the wider negator set (nunca/tampoco/jamas/nada) blocks, and so does
    // a bare negator TRAILING the trigger — but only bare, not "no hay
    // problema".
    expect(acceptanceConfirmed(normalizeEs('nunca me viene bien'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('tampoco me viene bien'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('jamás me viene bien'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('para nada me viene bien'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('me viene bien, no'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('me viene bien pero no'))).toBe(false);
    expect(acceptanceConfirmed(normalizeEs('sí, me viene bien, no hay problema'))).toBe(true);
  });

  it('momentConfirmed: un momento negado no cierra, uno afirmativo sí', () => {
    expect(momentConfirmed(normalizeEs('por las tardes'))).toBe(true);
    expect(momentConfirmed(normalizeEs('sí, sobre las seis'))).toBe(true);
    expect(momentConfirmed(normalizeEs('no por las tardes'))).toBe(false);
    expect(momentConfirmed(normalizeEs('sí, pero no el jueves'))).toBe(false);
    expect(momentConfirmed(normalizeEs('no, mejor a las seis'))).toBe(false);
    // F4: the wider negator set blocks the moment too, so both predicates stay
    // in lockstep (same guard, same suffix check).
    expect(momentConfirmed(normalizeEs('nunca por las tardes'))).toBe(false);
    expect(momentConfirmed(normalizeEs('tampoco el jueves'))).toBe(false);
    // A greeting is not a moment, so there is nothing to confirm.
    expect(momentConfirmed(normalizeEs('buenas tardes'))).toBe(false);
  });

  // Bare "manana" is a WHEN and not a greeting (the Spanish greeting is
  // "buenas tardes"/"buenos dias"), so it IS a moment — the customer's own word
  // — while the farewell that carries it is not: a goodbye must never arrange a
  // call, and the rule 5 doubt path keeps the safe direction.
  it('momentConfirmed: "mañana" suelto es un momento, la despedida no', () => {
    expect(momentConfirmed(normalizeEs('mañana'))).toBe(true);
    expect(momentConfirmed(normalizeEs('mañana por la tarde'))).toBe(true);
    expect(momentConfirmed(normalizeEs('hasta mañana'))).toBe(false);
    expect(momentConfirmed(normalizeEs('nos vemos mañana'))).toBe(false);
    // "hasta el lunes" collides with the day-name form; the farewell wins.
    expect(momentConfirmed(normalizeEs('hasta el lunes'))).toBe(false);
    // The day answer itself is still an acceptance.
    expect(momentConfirmed(normalizeEs('el lunes'))).toBe(true);
  });

  it('NEGATED_ACCEPTANCE: cualquier negador al final del prefijo, con es2022 sin lookbehind', () => {
    expect(NEGATED_ACCEPTANCE.test('no ')).toBe(true);
    expect(NEGATED_ACCEPTANCE.test('no no ')).toBe(true);
    expect(NEGATED_ACCEPTANCE.test('si pero no ')).toBe(true);
    // F4: the negators that actually negate a Spanish acceptance, not only "no".
    expect(NEGATED_ACCEPTANCE.test('nunca ')).toBe(true);
    expect(NEGATED_ACCEPTANCE.test('tampoco ')).toBe(true);
    expect(NEGATED_ACCEPTANCE.test('jamas ')).toBe(true);
    expect(NEGATED_ACCEPTANCE.test('para nada ')).toBe(true);
    expect(NEGATED_ACCEPTANCE.test('bueno ')).toBe(false);
    expect(NEGATED_ACCEPTANCE.test('si ')).toBe(false);
    expect(NEGATED_ACCEPTANCE.test('')).toBe(false);
    // Hard constraint: no lookbehind anywhere (Safari 15.4-16.3 parses
    // es2022 but throws on it at load time, killing the whole page).
    expect(NEGATED_ACCEPTANCE.source).not.toContain('(?<');
  });

  // F4 trailing check: a BARE negator at the very END of the text after a
  // trigger match is the ONLY trailing case that blocks — no filler-word
  // allowance, so "no hay problema" never blocks. es2022-safe, no lookbehind.
  it('TRAILING_NEGATOR: solo un negador suelto al final bloquea', () => {
    expect(TRAILING_NEGATOR.test(' no')).toBe(true);
    expect(TRAILING_NEGATOR.test(' pero no')).toBe(true);
    expect(TRAILING_NEGATOR.test(' nunca')).toBe(true);
    expect(TRAILING_NEGATOR.test(' tampoco')).toBe(true);
    expect(TRAILING_NEGATOR.test(' jamas')).toBe(true);
    expect(TRAILING_NEGATOR.test(' nada')).toBe(true);
    expect(TRAILING_NEGATOR.test(' no hay problema')).toBe(false);
    expect(TRAILING_NEGATOR.test(' bien')).toBe(false);
    expect(TRAILING_NEGATOR.test('')).toBe(false);
    expect(TRAILING_NEGATOR.source).not.toContain('(?<');
  });
});
