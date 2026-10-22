// Tests for the pure chat view-model of the static UI (ui/chat.ts).
//
// DOM-free by design: the chat module only drives MuskAgent and returns plain
// data, so it can be asserted without a browser. Covers the opening placeholder
// (rule 4), turn diagnostics, reset, and the content-profile toggle.

import { describe, expect, it } from 'vitest';

import { MuskAgent } from '../src/agent';
import { APPROVED_CONTENT } from '../src/content';
import { DEMO_CONTENT } from '../src/content.demo';
import { MockProvider } from '../src/llm';
import { buildReply, guardReply } from '../src/rules';
import {
  CONTENT_BANNERS,
  DEFAULT_LEAD,
  HANDOFF_REPLY_PLACEHOLDER,
  OPENING_PLACEHOLDER,
  STOPPED_REPLY_PLACEHOLDER,
createChat,
  formatDiagnostic,
  formatHandoff,
} from '../ui/chat';
import { at, first, last } from './helpers';

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
    expect(isPendingOpening(first(state.messages).text)).toBe(true);
    expect(state.pendingDecisions).toContain('initialMessage');
    // The pending list must be surfaced as a visible message, not hidden.
    expect(state.messages.some((message) => message.text.startsWith('pending :'))).toBe(true);
    expect(state.banner).toBe(CONTENT_BANNERS.real);
  });

  it('defaults to the DEMO profile so the demo always has a greeting', () => {
    const state = createChat().getState();
    expect(state.profile).toBe('demo');
    expect(state.banner).toBe(CONTENT_BANNERS.demo);
    expect(first(state.messages).role).toBe('agent');
    expect(first(state.messages).text).toBe(DEMO_CONTENT.initialMessage);
    expect(state.pendingDecisions).toHaveLength(0);
  });

  it('a turn produces ONE agent message, the diagnostic line and the ask inside that message', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('  ¿cuánto cuesta la formación?  ');

    expect(state.turnCount).toBe(1);

    const leadMessages = state.messages.filter((message) => message.role === 'lead');
    expect(leadMessages).toHaveLength(1);
    expect(first(leadMessages).text).toBe('¿cuánto cuesta la formación?');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    expect(first(diagnostics).text).toBe(
      'intent = price | action = none | suppressed = false | registered doubts = 0',
    );

    // The first approved qualification question is asked in the SAME message as
    // the answer: one outbound message per turn (src/outbound.ts).
    const question = first(DEMO_CONTENT.qualificationQuestions).text;
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages).toHaveLength(2); // opening + this turn
    expect(last(agentMessages).text).toBe(`${DEMO_CONTENT.priceReply} ${question}`);
    expect(state.stopped).toBe(false);
    expect(state.records.map((record) => record.kind)).toContain('reply');
  });

  // The reported defect: one lead message produced TWO agent bubbles — the
  // answer, then immediately the qualification question. The lead read the same
  // ask twice (the catalog answer used to invite exactly what `goal` asks).
  it('el turno de catálogo produce UN solo mensaje con la respuesta y la pregunta', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Sí, me interesa. Dame información sobre los cursos.');

    const answer = DEMO_CONTENT.faq.find((entry) => entry.id === 'catalogo-formaciones')!.answer;
    const question = first(DEMO_CONTENT.qualificationQuestions).text;

    // Opening + exactly ONE message for the turn.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages).toHaveLength(2);
    expect(at(agentMessages, 1).text).toBe(`${answer} ${question}`);
    // Reply first, then the ask — never the other way round.
    expect(at(agentMessages, 1).text.indexOf(answer)).toBe(0);
    expect(at(agentMessages, 1).text.endsWith(question)).toBe(true);
    // One question at a time, no digit, and it still passes the output guard.
    expect(at(agentMessages, 1).text.match(/\?/g)).toHaveLength(1);
    expect(at(agentMessages, 1).text.length).toBeLessThan(300);
    expect(at(agentMessages, 1).text).not.toMatch(/\d/);
    expect(guardReply(at(agentMessages, 1).text).ok).toBe(true);
    // The duplicated invitation is gone: the answer no longer asks what the
    // question asks.
    expect(answer).not.toContain('te oriento');
    expect(answer.endsWith('?')).toBe(false);
  });

  // The merge is a rendering decision only: the ask stays ARMED, so the lead's
  // next message is still RECEIVED as the answer to that question.
  it('tras el mensaje único, la siguiente respuesta del lead se captura igual', async () => {
    const chat = createChat({ profile: 'demo' });
    await chat.send('Sí, me interesa. Dame información sobre los cursos.');

    const state = await chat.send('el curso de full stack');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const turn = diagnostics.find((message) => message.text.includes('answer to goal'));
    expect(turn?.text).toContain('received = answer to goal (no doubt registered)');
    expect(turn?.text).toContain('registered doubts = 0');
    const answers = state.records.filter((record) => record.kind === 'answer');
    expect(answers).toHaveLength(1);
    expect(answers[0]?.detail).toBe('answer to goal: "el curso de full stack"');
  });

  // Single-question rule, as the engine already applies it on the rule-5 path:
  // the doubt reply asks the lead something, so no qualification question is
  // stacked on top of it (the ask is deferred, never lost). The real profile is
  // used because its questions are TODO(decisión): nothing else is askable.
  it('una respuesta que ya pregunta no recibe otra pregunta encima (regla 5)', async () => {
    const chat = createChat({ profile: 'real' });
    const state = await chat.send('¿hacéis envíos a Canarias?');

    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages).toHaveLength(2); // opening placeholder + the doubt
    expect(at(agentMessages, 1).text).toBe(buildReply('doubt'));
    expect(at(agentMessages, 1).text).not.toContain('¿Tienes ya alguna formación');
    expect(buildReply('doubt').endsWith('?')).toBe(true);
  });

  // The visible half of the reception fix: answering a question sends no message
  // of its own, so no empty bubble is rendered next to the next question.
  it('adds no empty agent bubble when the lead answers a question', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Si');

    // Opening + the next qualification question, nothing in between.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(agentMessages).toHaveLength(2);
    expect(at(agentMessages, 1).text).toBe(first(DEMO_CONTENT.qualificationQuestions).text);
    expect(state.messages.every((message) => message.text.trim().length > 0)).toBe(true);
  });

  it('renders the handoff line after the lead accepts a call', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Sí, llámame cuando queráis');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const handoffLine = diagnostics.find((message) => message.text.startsWith('aviso simulado = '));
    expect(handoffLine).toBeDefined();
    expect(handoffLine?.text).toContain('destinataria=Laura');
    expect(handoffLine?.text).toContain('contact=');
    expect(handoffLine?.text).toContain('bucket=ilocalizables');
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
    expect(last(agentMessages).role).toBe('agent');
    expect(agentMessages.some((message) => message.text === first(DEMO_CONTENT.qualificationQuestions).text)).toBe(false);
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
    expect(last(agentMessages).text).toBe(HANDOFF_REPLY_PLACEHOLDER);

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const summaryLines = diagnostics.filter((message) =>
      message.text.startsWith('resumen para el comercial = '),
    );
    expect(summaryLines).toHaveLength(2);
    const updated = last(summaryLines);
    expect(updated.text).toContain('9:00');
    expect(updated.text).toContain('mañana a las 9:00');
    // The handoff line is rendered again for the corrected notice.
    expect(diagnostics.filter((message) => message.text.startsWith('aviso simulado = '))).toHaveLength(2);
  });

  it('omite de forma limpia la destinataria si la configuración no la incluye', () => {
    const line = formatHandoff({
      reason: 'human_requested',
      leadId: 'test-lead',
      contact: '+3460000000',
      bucket: 'no_comprador',
      lastMessage: 'quiero hablar con una persona',
      summary: 'summary',
      formation: 'formation',
      qualification: [],
      doubts: [],
    });

    expect(line).toContain('aviso simulado =');
    expect(line).toContain('contact=+3460000000');
    expect(line).toContain('bucket=no compradores');
    expect(line).not.toContain('destinataria=');
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
    expect(first(diagnostics).text).toBe(
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
    expect(first(state.messages).text).toBe('conversation reset');
    expect(at(state.messages, 1).text).toBe(DEMO_CONTENT.initialMessage);
    expect(state.profile).toBe('demo');
  });

  it('the content-profile toggle swaps the content and restarts the conversation', async () => {
    const chat = createChat({ profile: 'demo' });
    await chat.send('cuéntame más');

    const realState = chat.setProfile('real');
    expect(realState.profile).toBe('real');
    expect(realState.banner).toBe(CONTENT_BANNERS.real);
    expect(first(realState.messages).text).toBe(OPENING_PLACEHOLDER);
    expect(realState.turnCount).toBe(0);

    const demoState = chat.setProfile('demo');
    expect(demoState.profile).toBe('demo');
    expect(demoState.banner).toBe(CONTENT_BANNERS.demo);
    expect(first(demoState.messages).text).toBe(DEMO_CONTENT.initialMessage);
  });

  it('a real-profile turn reaches the approved answer with no LLM provider', async () => {
    const chat = createChat({ profile: 'real' });
    const state = await chat.send('¿qué es MUSK?');
    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    expect(first(diagnostics).text).toContain('intent = general');
    // No qualification question is askable in the real profile (all are TODO).
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(last(agentMessages).text).toBe(
      first(APPROVED_CONTENT.faq).answer,
    );
  });

  it('never builds an agent with an LLM provider (deterministic UI)', () => {
    const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null, lead: DEFAULT_LEAD });
    expect(agent.isStopped).toBe(false);
    expect(agent.records).toHaveLength(0);
  });

  // The classifier label is not the disposition. A course name classifies as
  // 'kb' while NO passage is used: the message is RECEIVED as the answer to the
  // pending goal question. Leading the line with 'intent = kb' made the demo
  // look broken, so the effective disposition leads and the label follows.
  it('the diagnostic line leads with the disposition when an answer was received', async () => {
    const chat = createChat({ profile: 'demo' });
    // The UI asks the next question AFTER a turn, so the goal question is armed
    // by the second turn: this is the reproduced demo sequence.
    await chat.send('Si');
    const state = await chat.send('el curso de full stack');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const turn = diagnostics.find((message) => message.text.includes('answer to goal'));
    expect(turn?.text).toBe(
      'received = answer to goal (no doubt registered) | intent = kb | action = none' +
        ' | suppressed = false | registered doubts = 0',
    );
    // The classifier label is kept, but only as a secondary note.
    expect(turn?.text.indexOf('received = ')).toBeLessThan(turn?.text.indexOf('intent = ') ?? -1);
    // No passage was used, so no knowledge-base provenance line is rendered.
    expect(diagnostics.some((message) => message.text.startsWith('kb = '))).toBe(false);
    // The lead sees the approved acknowledgement plus the closing invitation.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    expect(last(agentMessages).text).toBe(
      'Entiendo, te interesa Full Stack: la parte visual y la lógica de una aplicación web.' +
        ` ${DEMO_CONTENT.closingInvitation}`,
    );
  });

  // Same rule for the opening: it is received as the answer to the opening
  // message (questionId null), which the line must say explicitly.
  it('an answer to the opening reads as the opening, not as a missing id', async () => {
    const chat = createChat({ profile: 'demo' });
    const state = await chat.send('Si');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const turn = diagnostics.find((message) => message.text.includes('received = '));
    expect(turn?.text).toContain('received = answer to opening message (no doubt registered)');
    expect(turn?.text).not.toContain('undefined');
  });

  // A turn with no pending ask keeps the bare classifier line: nothing was
  // received as an answer, so there is no disposition to report.
  it('a turn without a received answer keeps the bare classifier line', async () => {
    const line = formatDiagnostic({
      intent: 'general',
      action: 'reply',
      suppressed: false,
      registeredDoubts: 0,
      ruleViolations: [],
    });

    expect(line).toBe(
      'intent = general | action = reply | suppressed = false | registered doubts = 0',
    );
    expect(line).not.toContain('received');
  });

  // The call-proposal answer is a disposition too, and it keeps the same shape.
  it('an accepted call reads as the answer to the call proposal', () => {
    const line = formatDiagnostic({
      intent: 'afirmacion',
      action: 'handoff',
      suppressed: false,
      registeredDoubts: 0,
      ruleViolations: [],
      capturedAnswer: { questionId: 'call-proposal' },
    });

    expect(line.startsWith('received = answer to call-proposal (no doubt registered)')).toBe(true);
    expect(line).toContain('| intent = afirmacion');
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

  // The grounding verdict of the LLM rephrase is operator-facing too: a
  // rejected rephrase must be visible in the demo, and the lead must still
  // receive the approved text.
  it('a rejected rephrase shows the grounding verdict as a diagnostic line', async () => {
    const provider = new MockProvider('La formación es online, con clases en directo, y cuesta 500 euros.');
    const chat = createChat({ profile: 'real', provider });
    const state = await chat.send('¿la formación es online?');

    const diagnostics = state.messages.filter((message) => message.role === 'diagnostic');
    const grounding = diagnostics.find((message) => message.text.startsWith('grounding = '));
    expect(grounding).toBeDefined();
    expect(grounding?.text).toContain('rephrase rejected');
    expect(grounding?.text).toContain('used the approved text');

    // The lead-facing transcript only carries the approved answer.
    const agentMessages = state.messages.filter((message) => message.role === 'agent');
    const approved = APPROVED_CONTENT.faq.find((entry) => entry.id === 'modalidad')?.answer ?? '';
    expect(agentMessages.some((message) => message.text === approved)).toBe(true);
    expect(agentMessages.some((message) => message.text.includes('500'))).toBe(false);
  });
});
