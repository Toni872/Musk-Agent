// Tests for the LLM-driven empathic engine (src/agent.ts): the safety floor
// (stop, handoff, output guard), the RAG grounding (retrieved context reaches
// the model), the thread memory, and the deterministic fallback.

import { describe, expect, it } from 'vitest';

import { MuskAgent, type LeadContact } from '../src/agent';
import { APPROVED_CONTENT } from '../src/content';
import { KB_PASSAGES } from '../src/kb';
import { MockProvider } from '../src/llm';
import { buildReply, guardReply } from '../src/rules';

const LEAD: LeadContact = { id: 'lead-1', contact: '+34600000000', bucket: 'ilocalizable' };

function passage(id: string): string {
  const found = KB_PASSAGES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`passage not found: ${id}`);
  return found.answer;
}

describe('the output guard is the non-negotiable floor', () => {
  it('never ships a reply that invents a price, even when the model returns one', async () => {
    const provider = new MockProvider('Vale, la formación cuesta 500 euros al mes.');
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });
    const result = await agent.runTurn('¿cuánto cuesta?');

    expect(result.reply).not.toContain('500');
    expect(result.reply).not.toContain('euros');
    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.ruleViolations.length).toBeGreaterThan(0);
    expect(agent.doubts).toContain('¿cuánto cuesta?');
  });

  it('never ships a reply that promises a job', async () => {
    const provider = new MockProvider('Te garantizamos trabajo al terminar.');
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });
    const result = await agent.runTurn('¿me conseguiréis trabajo?');

    expect(result.reply).toBe(buildReply('doubt'));
    expect(result.reply).not.toMatch(/garantiz/i);
  });

  it('a clean reply passes through untouched', async () => {
    const provider = new MockProvider('Claro, te cuento. ¿Qué es lo que más te frena?');
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });
    const result = await agent.runTurn('tengo dudas');

    expect(result.reply).toBe('Claro, te cuento. ¿Qué es lo que más te frena?');
    expect(result.ruleViolations).toEqual([]);
  });
});

describe('rule 7: stop', () => {
  it('stops and registers "no continuar"', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const result = await agent.runTurn('no me escribas más, por favor');

    expect(result.action).toBe('stop');
    expect(result.registeredNoContinuar).toBe(true);
    expect(agent.isStopped).toBe(true);
    expect(result.reply).toContain('no continuar');
  });

  it('a later turn is suppressed', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    await agent.runTurn('para de escribirme');
    const result = await agent.runTurn('hola');
    expect(result.suppressed).toBe(true);
    expect(result.reply).toBe('');
  });
});

describe('rule 9: handoff', () => {
  it('fires human_requested when the lead asks for a person', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const result = await agent.runTurn('quiero hablar con una persona');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('human_requested');
    expect(result.handoff?.recipient).toBe('Laura');
  });

  it('fires call_accepted when the lead hands over a phone number', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const result = await agent.runTurn('llámame al 612 345 678');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
  });

  it('fires call_accepted only after the agent proposed a call', async () => {
    const provider = new MockProvider((request) =>
      request.messages.at(-1)?.content.includes('cuánto')
        ? 'Prefiero que te lo cuente una persona en una llamada. ¿Te va bien que te contacten?'
        : '¡Claro! ¿Te va mejor por la mañana o por la tarde?',
    );
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });

    await agent.runTurn('¿cuánto cuesta?');
    const result = await agent.runTurn('el martes a las 18:00 me viene bien');

    expect(result.action).toBe('handoff');
    expect(result.handoff?.reason).toBe('call_accepted');
  });

  it('does NOT fire a call handoff before any proposal', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const result = await agent.runTurn('me viene bien');
    expect(result.action).not.toBe('handoff');
  });
});

describe('RAG grounding', () => {
  it('the model receives the retrieved passage for the question', async () => {
    const provider = new MockProvider('Perfecto, te cuento. ¿Qué más te gustaría saber?');
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });
    await agent.runTurn('¿qué se aprende en python?');

    const system = provider.calls[0]?.system ?? '';
    expect(system).toContain('Django');
    expect(system).toContain('pandas');
    expect(agent.records.some((record) => record.kind === 'kb')).toBe(true);
  });

  it('the system prompt carries the safety rules and the one-question rule', async () => {
    const provider = new MockProvider('Claro. ¿Qué te gustaría saber?');
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });
    await agent.runTurn('hola');

    const system = provider.calls[0]?.system ?? '';
    expect(system).toMatch(/NUNCA des precios/i);
    expect(system).toMatch(/UNA sola pregunta/i);
    expect(system).toMatch(/No propongas la llamada en cada mensaje/i);
  });

  it('the model reads the thread: history messages are passed along', async () => {
    const provider = new MockProvider('Entiendo. ¿Y qué horario te encaja?');
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead: LEAD });
    await agent.runTurn('trabajo en administración');
    await agent.runTurn('me da miedo quedarme atrás');

    const messages = provider.calls[1]?.messages ?? [];
    expect(messages.some((m) => m.content === 'trabajo en administración')).toBe(true);
  });
});

describe('deterministic fallback (no provider)', () => {
  it('answers a knowledge-base question with the closest passage plus a question', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const result = await agent.runTurn('¿me dan certificado de la UE?');

    expect(result.intent).toBe('conversation');
    expect(result.reply).toContain(passage('kb-certificacion-arp'));
    expect(result.reply.trimEnd().endsWith('?')).toBe(true);
    expect(result.registeredDoubts).toEqual([]);
  });

  it('registers a doubt when nothing in the base answers the lead', async () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const result = await agent.runTurn('¿me mandáis un informe en pdf?');

    expect(result.reply).toBe(buildReply('doubt'));
    expect(agent.doubts.length).toBe(1);
  });
});

describe('the opening is warm and guarded', () => {
  it('sends the approved opening', () => {
    const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: null, lead: LEAD });
    const opening = agent.opening();
    expect(opening).toBeTruthy();
    expect(guardReply(opening ?? '').ok).toBe(true);
    expect((opening ?? '').trimEnd().endsWith('?')).toBe(true);
  });
});
