// Mandatory rule tests for the MUSK MVP agent (AGENTS.md):
// price, syllabus, financing, unknown answer, human request, stop request.
// All tests run offline: MockProvider only, no network, no API key.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MuskAgent, type LeadContact } from '../src/agent';
import { APPROVED_CONTENT } from '../src/content';
import { DEMO_CONTENT } from '../src/content.demo';
import { MockProvider } from '../src/llm';
import { guardReply, RULES } from '../src/rules';

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
    expect(result.reply).toMatch(/opciones/i);
    expect(result.reply).toMatch(/llamada|persona|equipo/i);
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
  //     responderse con el saludo social; se registra como duda (regla 5).
  it('un "no ..." sustantivo no se responde con el saludo social', async () => {
    const { agent } = makeAgent();
    const result = await agent.runTurn('no tengo tiempo ahora mismo');
    expect(result.intent).toBe('unknown');
    expect(result.reply).toMatch(/duda/i);
    expect(result.registeredDoubts).toContain('no tengo tiempo ahora mismo');
  });

  // 7e. Precisión: un mensaje sustantivo que EMPIEZA con "gracias" no debe
  //     caer en el saludo social ("gracias, no tengo tiempo" -> duda,
  //     "gracias, no me interesa" -> decline).
  it('un mensaje que empieza con "gracias" mantiene su intent real', async () => {
    const { agent } = makeAgent();
    const time = await agent.runTurn('gracias, no tengo tiempo ahora mismo');
    expect(time.intent).toBe('unknown');
    expect(time.reply).toMatch(/duda/i);

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
      ['no tengo tiempo ahora mismo', 'unknown'],
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

describe('structural guards', () => {
  // Content schema: no price/amount fields, no syllabus field, no money text.
  it('content.ts schema has no price/temario fields nor money text', () => {
    const keys = Object.keys(APPROVED_CONTENT);
    expect(keys.some((key) => /price|precio|amount|importe|cost|fee|budget|temario|syllabus|curriculum|financ/i.test(key))).toBe(
      false,
    );
    const json = JSON.stringify(APPROVED_CONTENT);
    expect(json).not.toMatch(/€/);
    expect(json).not.toMatch(/\beuros?\b/i);
    // Rule data in rules.ts must cover all 11 hard rules from AGENTS.md.
    expect(RULES).toHaveLength(11);
  });

  // The pilot formation is now chosen (Curso de Desarrollo Full Stack), so the
  // "formación elegida" decision is closed. The still-open decisions (initial
  // message text and the final qualification questions) must stay visible as
  // TODO(decisión) markers and never be presented as agreed with MUSK.
  it('src/content.ts keeps the still-open decisions marked as TODO(decisión)', () => {
    const source = readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8');
    const markers = source.match(/TODO\(decisión\)/g) ?? [];
    expect(markers.length).toBeGreaterThanOrEqual(3);
    expect(source).toMatch(/mensaje inicial/);
    expect(source).toMatch(/cualificación/);
  });

  // Approved FAQ answers are lead-facing: they must pass the output guard, so a
  // question routed to an approved answer can never leak a forbidden response.
  it('APPROVED_CONTENT: sin importes y respuestas FAQ válidas para el guard', () => {
    const json = JSON.stringify(APPROVED_CONTENT);
    expect(json).not.toMatch(/€/);
    expect(json).not.toMatch(/\beuros?\b/i);
    for (const entry of APPROVED_CONTENT.faq) {
      const result = guardReply(entry.answer);
      expect(result.ok, `FAQ "${entry.id}" no debe violar el guard: ${JSON.stringify(result.violations)}`).toBe(true);
    }
  });

  // The DEMO sample profile (src/content.demo.ts) must never carry money text
  // and every FAQ answer must pass the output guard, so the sample can be shown
  // without leaking forbidden content.
  it('DEMO_CONTENT: sin importes y respuestas FAQ válidas para el guard', () => {
    const json = JSON.stringify(DEMO_CONTENT);
    expect(json).not.toMatch(/€/);
    expect(json).not.toMatch(/\beuros?\b/i);
    for (const entry of DEMO_CONTENT.faq) {
      const result = guardReply(entry.answer);
      expect(result.ok, `FAQ "${entry.id}" no debe violar el guard: ${JSON.stringify(result.violations)}`).toBe(true);
    }
  });
});
