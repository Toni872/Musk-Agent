// Pure chat view-model for the MUSK simulation UI.
//
// Deliberately DOM-free: this module only drives MuskAgent and returns plain
// data, so it can be unit-tested without a browser and consumed by any
// renderer. The DOM layer (ui/main.ts) is a thin consumer of getState().
//
// Functional parity target: src/simulator.ts (banner, opening handling,
// per-turn line, handoff line, /state records, reset).

import {
  MuskAgent,
  type ConversationRecord,
  type HandoffContext,
  type LeadContact,
  type TurnResult,
} from '../src/agent';
import { APPROVED_CONTENT, type ApprovedContent } from '../src/content';
import type { LLMProvider } from '../src/llm';

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
}

export interface ChatState {
  banner: string;
  messages: ChatMessage[];
  stopped: boolean;
  records: ConversationRecord[];
  // The lead's questions the agent could not answer, deduplicated (spec 6).
  doubts: string[];
  pendingDecisions: string[];
  turnCount: number;
}

export interface ChatOptions {
  // Content injection seam (tests and experiments only): the shipped UI always
  // uses APPROVED_CONTENT.
  content?: ApprovedContent;
  lead?: LeadContact;
  // Optional LLM provider that drives the conversation. Without it the UI falls
  // back to the closest approved passage.
  provider?: LLMProvider | null;
}

export const CONTENT_BANNER =
  'Content: perfil único de Escuela Musk (contenido curado; firma final de redacción pendiente).';

export const OPENING_PLACEHOLDER =
  '(none: decision still open with MUSK — a TODO placeholder is never sent)';

export const STOPPED_REPLY_PLACEHOLDER = '(no message sent: conversation stopped)';

export const HANDOFF_REPLY_PLACEHOLDER = '(no message sent: the conversation is with a person)';

export const DEFAULT_LEAD: LeadContact = {
  id: 'ui-lead',
  contact: '+3460000000',
  bucket: 'ilocalizable',
  lossReason: 'no respondió a los intentos de llamada',
};

export function formatDiagnostic(diagnostic: TurnDiagnostic): string {
  return (
    `intent = ${diagnostic.intent} | action = ${diagnostic.action}` +
    ` | suppressed = ${diagnostic.suppressed}` +
    ` | registered doubts = ${diagnostic.registeredDoubts}`
  );
}

export function formatHandoff(handoff: HandoffContext): string {
  const recipient = handoff.recipient ? ` destinataria=${handoff.recipient}` : '';
  const bucket = handoff.bucket === 'ilocalizable' ? 'ilocalizables' : 'no compradores';
  return (
    `aviso simulado = reason=${handoff.reason} lead=${handoff.leadId}` +
    ` contact=${handoff.contact} bucket=${bucket}${recipient}`
  );
}

export function formatHandoffSummary(handoff: HandoffContext, updated = false): string {
  return `resumen para el comercial${updated ? ' (actualizado)' : ''} = ${handoff.summary}`;
}

export class Chat {
  private readonly content: ApprovedContent;
  private readonly lead: LeadContact;
  private readonly provider: LLMProvider | null;
  private agent: MuskAgent;
  private messages: ChatMessage[] = [];
  private turnCount = 0;

  constructor(options: ChatOptions = {}) {
    this.content = options.content ?? APPROVED_CONTENT;
    this.lead = options.lead ?? DEFAULT_LEAD;
    this.provider = options.provider ?? null;
    this.agent = this.buildAgent();
    this.showOpening();
  }

  getState(): ChatState {
    return {
      banner: this.provider
        ? CONTENT_BANNER
        : `${CONTENT_BANNER} — modo determinista (sin modelo LLM: abre la URL con ?k=<token>)`,
      messages: this.messages.map((message) => ({ ...message })),
      stopped: this.agent.isStopped,
      records: this.agent.records.map((record) => ({ ...record })),
      doubts: this.agent.doubts,
      pendingDecisions: [...this.agent.pendingDecisions],
      turnCount: this.turnCount,
    };
  }

  get handoff(): HandoffContext | undefined {
    return this.agent.handoff;
  }

  get qualificationAnswers(): { id: string; text: string }[] {
    return this.agent.qualificationAnswers;
  }

  async send(text: string): Promise<ChatState> {
    const message = text.trim();
    if (!message) return this.getState();
    this.messages.push({ role: 'lead', text: message });
    const recordsBefore = this.agent.records.length;
    const result = await this.agent.runTurn(message);
    this.turnCount += 1;
    this.pushTurn(result);
    this.pushKbProvenance(recordsBefore);
    return this.getState();
  }

  reset(): ChatState {
    this.restart('conversation reset');
    return this.getState();
  }

  private buildAgent(): MuskAgent {
    return new MuskAgent({
      content: this.content,
      provider: this.provider,
      lead: this.lead,
    });
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
    this.messages.push({ role: opening ? 'agent' : 'info', text: opening ?? OPENING_PLACEHOLDER });
    const pending = this.agent.pendingDecisions;
    if (pending.length > 0) {
      this.messages.push({ role: 'info', text: `pending : ${pending.join(', ')}` });
    }
  }

  private pushKbProvenance(recordsBefore: number): void {
    const records = this.agent.records.slice(recordsBefore).filter((record) => record.kind === 'kb');
    for (const record of records) {
      this.messages.push({ role: 'diagnostic', text: record.detail });
    }
  }

  private pushTurn(result: TurnResult): void {
    if (result.reply !== '') {
      this.messages.push({ role: 'agent', text: result.reply });
    } else if (result.suppressed) {
      this.messages.push({
        role: 'agent',
        text: result.action === 'stop' ? STOPPED_REPLY_PLACEHOLDER : HANDOFF_REPLY_PLACEHOLDER,
      });
    }
    this.messages.push({
      role: 'diagnostic',
      text: formatDiagnostic({
        intent: result.intent,
        action: result.action,
        suppressed: result.suppressed,
        registeredDoubts: result.registeredDoubts.length,
        ruleViolations: result.ruleViolations,
      }),
    });
    if (result.handoff) {
      if (result.action === 'handoff') {
        this.messages.push({ role: 'diagnostic', text: formatHandoff(result.handoff) });
        this.messages.push({ role: 'diagnostic', text: formatHandoffSummary(result.handoff) });
      } else {
        this.messages.push({ role: 'diagnostic', text: formatHandoffSummary(result.handoff, true) });
      }
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
