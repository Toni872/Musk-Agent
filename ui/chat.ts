// Pure chat view-model for the MUSK simulation UI.
//
// Deliberately DOM-free: this module only drives MuskAgent and returns plain
// data, so it can be unit-tested without a browser and consumed by any
// renderer. The DOM layer (ui/main.ts) is a thin consumer of getState().
//
// Functional parity target: src/simulator.ts (banner, opening handling,
// per-turn line, handoff line, qualification question, /state records, reset).

import {
  MuskAgent,
  type ConversationRecord,
  type HandoffContext,
  type LeadContact,
  type TurnResult,
} from '../src/agent';
import { APPROVED_CONTENT, type ApprovedContent } from '../src/content';
import { DEMO_CONTENT } from '../src/content.demo';

export type ContentProfile = 'real' | 'demo';

export type ChatMessageRole = 'lead' | 'agent' | 'diagnostic' | 'info';

export interface ChatMessage {
  role: ChatMessageRole;
  text: string;
}

// Diagnostics of one turn: mirrors src/simulator.ts printTurn(). Operator-facing
// only, kept separate from the lead-facing agent message.
export interface TurnDiagnostic {
  intent: string;
  action: string;
  suppressed: boolean;
  registeredDoubts: number;
  ruleViolations: string[];
  // Present when the turn was RECEIVED as the answer to the ask the agent had
  // just made (questionId null for the opening). Mirrors src/simulator.ts.
  capturedAnswer?: { questionId: string | null };
}

export interface ChatState {
  profile: ContentProfile;
  banner: string;
  messages: ChatMessage[];
  stopped: boolean;
  records: ConversationRecord[];
  pendingDecisions: string[];
  turnCount: number;
}

export interface ChatOptions {
  profile?: ContentProfile;
  lead?: LeadContact;
}

// Mirrors src/simulator.ts printContentBanner().
export const CONTENT_BANNERS: Record<ContentProfile, string> = {
  real: 'Content: Curso de Desarrollo Full Stack (curated from MUSK dossier; final wording sign-off pending).',
  demo: 'Content: DEMO SAMPLE (not approved by MUSK) — for flow demonstration only.',
};

// Mirrors src/simulator.ts printOpening(): rule 4, a TODO(decisión) placeholder
// is never sent, it is reported instead so the gap stays visible.
export const OPENING_PLACEHOLDER =
  '(none: decision still open with MUSK — a TODO placeholder is never sent)';

// Mirrors src/simulator.ts printTurn() when the conversation is stopped.
export const STOPPED_REPLY_PLACEHOLDER = '(no message sent: conversation stopped)';

export const DEFAULT_LEAD: LeadContact = {
  id: 'ui-lead',
  contact: '+3460000000',
  bucket: 'ilocalizable',
};

// Content profile -> ApprovedContent. No environment access, no LLM: the UI is
// fully deterministic (provider: null everywhere).
export function contentFor(profile: ContentProfile): ApprovedContent {
  return profile === 'demo' ? DEMO_CONTENT : APPROVED_CONTENT;
}

export function formatDiagnostic(diagnostic: TurnDiagnostic): string {
  const base =
    `intent = ${diagnostic.intent} | action = ${diagnostic.action}` +
    ` | suppressed = ${diagnostic.suppressed}` +
    ` | registered doubts = ${diagnostic.registeredDoubts}`;
  if (!diagnostic.capturedAnswer) return base;
  return `${base} | received = answer to ${diagnostic.capturedAnswer.questionId ?? 'opening message'}`;
}

export function formatHandoff(handoff: HandoffContext): string {
  return (
    `handoff = reason=${handoff.reason} lead=${handoff.leadId}` +
    ` contact=${handoff.contact} bucket=${handoff.bucket}`
  );
}

export class Chat {
  private profile: ContentProfile;
  private readonly lead: LeadContact;
  private agent: MuskAgent;
  private messages: ChatMessage[] = [];
  private turnCount = 0;

  constructor(options: ChatOptions = {}) {
    // DEMO by default so the demo always has a greeting: src/content.ts keeps
    // the real opening as a TODO(decisión) until MUSK decides its wording.
    this.profile = options.profile ?? 'demo';
    this.lead = options.lead ?? DEFAULT_LEAD;
    this.agent = this.buildAgent();
    this.showOpening();
  }

  // Plain, serializable snapshot for the renderer and the tests.
  getState(): ChatState {
    return {
      profile: this.profile,
      banner: CONTENT_BANNERS[this.profile],
      messages: this.messages.map((message) => ({ ...message })),
      stopped: this.agent.isStopped,
      records: this.agent.records.map((record) => ({ ...record })),
      pendingDecisions: [...this.agent.pendingDecisions],
      turnCount: this.turnCount,
    };
  }

  // One turn: register the lead message, run the guard, render the reply plus
  // the diagnostics, then ask the next approved qualification question (if any).
  async send(text: string): Promise<ChatState> {
    const message = text.trim();
    if (!message) return this.getState();
    this.messages.push({ role: 'lead', text: message });
    const result = await this.agent.runTurn(message);
    this.turnCount += 1;
    this.pushTurn(result);
    const question = this.agent.nextQualificationQuestion();
    if (question) this.messages.push({ role: 'agent', text: question.text });
    return this.getState();
  }

  // Mirrors the CLI /reset: a brand-new MuskAgent and a fresh conversation.
  reset(): ChatState {
    this.restart('conversation reset');
    return this.getState();
  }

  // Switching the content profile restarts the conversation with the new
  // profile, exactly as running the CLI with/without --demo would.
  setProfile(profile: ContentProfile): ChatState {
    if (profile !== this.profile) {
      this.profile = profile;
      this.restart();
    }
    return this.getState();
  }

  private buildAgent(): MuskAgent {
    return new MuskAgent({ content: contentFor(this.profile), provider: null, lead: this.lead });
  }

  private restart(note?: string): void {
    this.agent = this.buildAgent();
    this.messages = [];
    this.turnCount = 0;
    if (note) this.messages.push({ role: 'info', text: note });
    this.showOpening();
  }

  private showOpening(): void {
    const opening = this.agent.opening();
    this.messages.push({ role: 'agent', text: opening ?? OPENING_PLACEHOLDER });
    const pending = this.agent.pendingDecisions;
    if (pending.length > 0) {
      this.messages.push({ role: 'info', text: `pending : ${pending.join(', ')}` });
    }
  }

  private pushTurn(result: TurnResult): void {
    // A received answer sends no message of its own: for that turn the agent's
    // message is the NEXT qualification question (pushed by send() right after).
    // Only a suppressed turn keeps a visible placeholder in its place.
    if (result.reply) {
      this.messages.push({ role: 'agent', text: result.reply });
    } else if (result.suppressed) {
      this.messages.push({ role: 'agent', text: STOPPED_REPLY_PLACEHOLDER });
    }
    this.messages.push({
      role: 'diagnostic',
      text: formatDiagnostic({
        intent: result.intent,
        action: result.action,
        suppressed: result.suppressed,
        registeredDoubts: result.registeredDoubts.length,
        ruleViolations: result.ruleViolations,
        capturedAnswer: result.capturedAnswer,
      }),
    });
    if (result.handoff) {
      this.messages.push({ role: 'diagnostic', text: formatHandoff(result.handoff) });
    }
    if (result.ruleViolations.length > 0) {
      this.messages.push({
        role: 'diagnostic',
        text: `guard = violations: ${result.ruleViolations.join(', ')}`,
      });
    }
  }
}

export function createChat(options: ChatOptions = {}): Chat {
  return new Chat(options);
}
