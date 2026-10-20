// Tests for the pure chat view-model of the static UI (ui/chat.ts).
//
// DOM-free by design: the chat module only drives MuskAgent and returns plain
// data, so it can be asserted without a browser. Covers the opening placeholder
// (rule 4), turn diagnostics, reset, and the content-profile toggle.

import { describe, expect, it } from 'vitest';

import { MuskAgent } from '../src/agent';
import { APPROVED_CONTENT } from '../src/content';
import { DEMO_CONTENT } from '../src/content.demo';
import {
  CONTENT_BANNERS,
  DEFAULT_LEAD,
  HANDOFF_REPLY_PLACEHOLDER,
  OPENING_PLACEHOLDER,
  STOPPED_REPLY_PLACEHOLDER,
  createChat,
} from '../ui/chat';

function isPendingOpening(chatText: string): boolean {
  return chatText === OPENING_PLACEHOLDER;
}

describe('ui/chat view-model', () => {
  // Rule 4: a TODO(decisión) opening is never sent, it is reported as visible.
  it('shows the opening placeholder when the opening is empty (real profile)', async () => {
    const chat = createChat({ profile: 'real' });
    const state = chat.getState();

    // The real profile keeps the opening as a TODO(decisión): nothing to send.
    expect(APPROVED_CONTENT.initialMessage).toMatch(/^TODO\s*\(/);
    expect(isPendingOpening(state.messages[0].text)).toBe(true);
    expect(state.pendingDecisions).toContain('initialMessage');
    // The pending list must be surfaced as a visible message, not hidden.
    expect(state.messages.some((message) => message.text.startsWith('pending :'))).toBe(true);
    expect(state.banner).toBe(CONTENT_BANNERS.real);
  });

  it('defaults to the DEMO profile so the demo always has a greeting', () => {
    const state = createChat().getState();
    expect(state.profile).toBe('demo');
    expect(state.banner).toBe(CONTENT_BANNERS.demo);
    expect(state.messages[0].role).toBe('agent');
    expect(state.messages[0].text).toBe(DEMO_CONTENT.initialMessage);
    expect(state.pendingDecisions).toHaveLength(0);
  });

  it('a turn produces the reply, the diagnostic line and the qualification question', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('  ¿cuánto cuesta la formación?  ');

    expect(state.turnCount).toBe(1);

    const leadMessages = state.messages.filter((message) => message.role === 'lead');
    expect(leadMessages).toHaveLength(1);
    expect(leadMessages[0].text).toBe('¿cuánto cuesta la formación?');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    expect(diagnostics[0].text).toBe(
      'intent = price | action = none | suppressed = false | registered doubts = 0',
    );

    // After the turn the agent asks the first approved qualification question.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages[agentMessages.length - 1].text).toBe(
      DEMO_CONTENT.qualificationQuestions[0].text,
    );
    expect(state.stopped).toBe(false);
    expect(state.records.map((record) => record.kind)).toContain('reply');
  });

  // The visible half of the reception fix: answering a question sends no message
  // of its own, so no empty bubble is rendered next to the next question.
  it('adds no empty agent bubble when the lead answers a question', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Si');

    // Opening + the next qualification question, nothing in between.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages).toHaveLength(2);
    expect(agentMessages[1].text).toBe(DEMO_CONTENT.qualificationQuestions[0].text);
    expect(state.messages.every((message) => message.text.trim().length > 0)).toBe(true);
  });

  it('renders the handoff line after the lead accepts a call', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Sí, llámame cuando queráis');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    expect(diagnostics.some((message) => message.text.startsWith('handoff = '))).toBe(true);
    // Spec §3.3: the operator must see the commercial summary, not only the
    // routing line. It is a diagnostic, so no agent bubble is added.
    const summaryLine = diagnostics.find((message) =>
      message.text.startsWith('resumen para el comercial = '),
    );
    expect(summaryLine).toBeDefined();
    expect(summaryLine?.text).toContain(DEMO_CONTENT.formationName);
    expect(summaryLine?.text).toContain('aceptó la llamada');
    // Spec §8.2: the lot's loss reason travels with the lead, so the commercial
    // knows why it was lost before picking up the phone.
    expect(summaryLine?.text).toContain('no respondió a los intentos de llamada');
    expect(summaryLine?.text).toContain('Sí, llámame cuando queráis');
    expect(state.records.some((record) => record.kind === 'handoff')).toBe(true);
    // Rule 9: once handed off, no further qualification question is asked.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages[agentMessages.length - 1].role).toBe('agent');
    expect(agentMessages[agentMessages.length - 1].text).not.toBe(
      DEMO_CONTENT.qualificationQuestions[1].text,
    );
  });

  // D5: the agreed moment usually arrives AFTER the handoff ("mañana" and then
  // "mañana a las 9:00"). The agent stays silent (rule 9: the conversation is
  // with a person now) but the notice to the commercial is corrected, so the
  // operator panel shows the updated summary instead of losing the time.
  it('un turno posterior a la derivación muestra el resumen actualizado', async () => {
    const chat = createChat({ profile: 'demo' });
    await chat.send('Sí, llámame cuando queráis');

    const state = await chat.send('mañana a las 9:00');

    // The silence of rule 9 is untouched.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages[agentMessages.length - 1].text).toBe(HANDOFF_REPLY_PLACEHOLDER);

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const summaryLines = diagnostics.filter((message) =>
      message.text.startsWith('resumen para el comercial = '),
    );
    expect(summaryLines).toHaveLength(2);
    const updated = summaryLines[summaryLines.length - 1];
    expect(updated.text).toContain('9:00');
    expect(updated.text).toContain('mañana a las 9:00');
    // The handoff line is rendered again for the corrected notice.
    expect(diagnostics.filter((message) => message.text.startsWith('handoff = '))).toHaveLength(2);
  });

  // Rule 5 path through the UI. Uses the 'real' profile because the DEMO opening
  // arms the reception ask (constructor): while that ask is pending, an
  // unmatched message is RECEIVED as its answer (kind 'answer', no doubt), so
  // the rule-5 doubt path is exercised here with no ask pending. The real
  // profile keeps the opening as a TODO(decisión), so nothing is armed.
  it('registers a doubt for a question with no approved answer (rule 5)', async () => {
    const chat = createChat({ profile: 'real' });
    const state = await chat.send('¿hacéis envíos a Canarias?');
    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    expect(diagnostics[0].text).toBe(
      'intent = unknown | action = none | suppressed = false | registered doubts = 1',
    );
    expect(state.records.some((record) => record.kind === 'doubt')).toBe(true);
    expect(state.stopped).toBe(false);
  });

  it('stops the conversation when the lead asks to stop, with the CLI placeholder', async () => {
    const chat = createChat({ profile: 'demo' });
    const stopState = await chat.send('no me escribáis más');
    expect(stopState.stopped).toBe(true);

    const afterState = await chat.send('¿me seguís escuchando?');
    const lastAgent = afterState.messages
      .filter((message) => message.role === 'agent')
      .pop();
    expect(lastAgent?.text).toBe(STOPPED_REPLY_PLACEHOLDER);
    expect(afterState.stopped).toBe(true);
  });

  it('reset restarts the conversation cleanly', async () => {
    const chat = createChat({ profile: 'demo' });
    await chat.send('hola, ¿qué tal?');
    await chat.send('no me escribáis más');
    expect(chat.getState().stopped).toBe(true);

    const state = chat.reset();

    expect(state.turnCount).toBe(0);
    expect(state.stopped).toBe(false);
    expect(state.records).toHaveLength(0);
    expect(state.messages[0].text).toBe('conversation reset');
    expect(state.messages[1].text).toBe(DEMO_CONTENT.initialMessage);
    expect(state.profile).toBe('demo');
  });

  it('the content-profile toggle swaps the content and restarts the conversation', async () => {
    const chat = createChat({ profile: 'demo' });
    await chat.send('cuéntame más');

    const realState = chat.setProfile('real');
    expect(realState.profile).toBe('real');
    expect(realState.banner).toBe(CONTENT_BANNERS.real);
    expect(realState.messages[0].text).toBe(OPENING_PLACEHOLDER);
    expect(realState.turnCount).toBe(0);

    const demoState = chat.setProfile('demo');
    expect(demoState.profile).toBe('demo');
    expect(demoState.banner).toBe(CONTENT_BANNERS.demo);
    expect(demoState.messages[0].text).toBe(DEMO_CONTENT.initialMessage);
  });

  it('a real-profile turn reaches the approved answer with no LLM provider', async () => {
    const chat = createChat({ profile: 'real' });
    const state = await chat.send('¿qué es MUSK?');
    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    expect(diagnostics[0].text).toContain('intent = general');
    // No qualification question is askable in the real profile (all are TODO).
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages[agentMessages.length - 1].text).toBe(
      APPROVED_CONTENT.faq[0].answer,
    );
  });

  it('never builds an agent with an LLM provider (deterministic UI)', () => {
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null, lead: DEFAULT_LEAD });
    expect(agent.isStopped).toBe(false);
    expect(agent.records).toHaveLength(0);
  });

  // The knowledge-base provenance is operator-facing: the lead sees only the
  // answer, the operator sees which passage answered and with which score.
  it('a knowledge-base turn shows the provenance as a diagnostic line', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('¿me dan certificado de la UE?');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const provenance = diagnostics.find((message) => message.text.startsWith('kb = '));
    expect(provenance).toBeDefined();
    expect(provenance?.text).toMatch(/^kb = kb-certificacion-arp \(score \d+\.\d+, coverage \d+\.\d+\)$/);

    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages.some((message) => message.text.includes('ARP'))).toBe(true);
    // The lead-facing transcript never shows the score or the passage id.
    expect(agentMessages.some((message) => message.text.includes('score'))).toBe(false);
    expect(agentMessages.some((message) => message.text.includes('kb-certificacion-arp'))).toBe(false);
  });
});
