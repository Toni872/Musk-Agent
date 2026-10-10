// Mandatory rule tests for the MUSK MVP agent (AGENTS.md):
// price, syllabus, financing, unknown answer, human request, stop request.
// All tests run offline: MockProvider only, no network, no API key.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MuskAgent, type LeadContact } from '../src/agent';
import { APPROVED_CONTENT } from '../src/content';
import { MockProvider } from '../src/llm';
import { RULES } from '../src/rules';

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

  // Open decisions must stay visible as TODO(decisión) markers.
  it('src/content.ts keeps the TODO(decisión) markers for open decisions', () => {
    const source = readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8');
    const markers = source.match(/TODO\(decisión\)/g) ?? [];
    expect(markers.length).toBeGreaterThanOrEqual(3);
    expect(source).toMatch(/formación elegida/);
    expect(source).toMatch(/mensaje inicial/);
    expect(source).toMatch(/cualificación/);
  });
});
