// MuskAgent core: builds the system prompt from approved content + hard rules,
// runs one conversation turn, and applies the deterministic rules guard
// (intent classification + rules.guardReply) before any reply reaches the lead.
//
// Guarded intents (stop, human, price, temario, financiacion, unknown) are
// fully deterministic and never call the LLM. The LLM is only consulted for
// 'general' turns that match an approved FAQ entry, and its output is always
// validated by guardReply (fallback: approved text, then registered doubt).

import type { ApprovedContent, FaqEntry } from './content';
import { APPROVED_CONTENT } from './content';
import type { LLMProvider } from './llm';
import { classify, findApprovedAnswer, normalizeEs, type Intent } from './intent';
import { buildReply, guardReply, HANDOFF_TRIGGERS, RULES } from './rules';

export type LeadBucket = 'ilocalizable' | 'no_comprador';

export interface LeadContact {
  id: string;
  contact: string;
  bucket: LeadBucket;
}

export type AgentAction = 'none' | 'handoff' | 'stop';
export type HandoffReason = 'human_requested' | 'call_accepted';

// Context handed to the commercial: enough to locate the contact in the CRM
// and understand why the handoff fired.
export interface HandoffContext {
  reason: HandoffReason;
  leadId: string;
  contact: string;
  bucket: LeadBucket;
  lastMessage: string;
  summary: string;
}

export interface TurnResult {
  intent: Intent;
  action: AgentAction;
  reply: string;
  suppressed: boolean;
  registeredDoubts: string[];
  registeredNoContinuar: boolean;
  ruleViolations: string[];
  handoff?: HandoffContext;
}

export type RecordKind = 'reply' | 'doubt' | 'handoff' | 'stop';

export interface ConversationRecord {
  kind: RecordKind;
  intent: Intent;
  detail: string;
}

export interface MuskAgentOptions {
  content?: ApprovedContent;
  provider?: LLMProvider | null;
  lead?: LeadContact;
}

export class MuskAgent {
  private readonly content: ApprovedContent;
  private readonly provider: LLMProvider | null;
  private readonly lead: LeadContact;
  private readonly systemPrompt: string;
  private stopped = false;
  private readonly conversationRecords: ConversationRecord[] = [];

  constructor(options: MuskAgentOptions = {}) {
    this.content = options.content ?? APPROVED_CONTENT;
    this.provider = options.provider ?? null;
    this.lead = options.lead ?? {
      id: 'sim-lead',
      contact: 'simulated-contact',
      bucket: 'ilocalizable',
    };
    this.systemPrompt = this.buildSystemPrompt();
  }

  get records(): ConversationRecord[] {
    return [...this.conversationRecords];
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  reset(): void {
    this.stopped = false;
    this.conversationRecords.length = 0;
  }

  async runTurn(message: string): Promise<TurnResult> {
    // Rule 7: once the lead asked to stop, no further message is generated.
    if (this.stopped) {
      return {
        intent: 'general',
        action: 'stop',
        reply: '',
        suppressed: true,
        registeredDoubts: [],
        registeredNoContinuar: false,
        ruleViolations: [],
      };
    }

    const intent = classify(message, this.content);
    let reply: string;
    let action: AgentAction = 'none';
    let handoff: HandoffContext | undefined;
    const registeredDoubts: string[] = [];
    let registeredNoContinuar = false;
    let localViolations: string[] = [];

    switch (intent) {
      case 'stop': {
        // Rule 7: stop follow-up, register "no continuar".
        this.stopped = true;
        registeredNoContinuar = true;
        reply = buildReply('stop');
        action = 'stop';
        this.push({ kind: 'stop', intent, detail: `lead requested stop: "${message}"` });
        break;
      }
      case 'human': {
        // Rule 9 (confirmed trigger): lead asks for a person.
        handoff = this.buildHandoff('human_requested', message);
        reply = buildReply('humanRequest');
        action = 'handoff';
        this.push({ kind: 'handoff', intent, detail: 'reason=human_requested' });
        break;
      }
      case 'price': {
        // Rule 1: approved reply + call invitation, never an amount.
        reply = buildReply('price');
        break;
      }
      case 'temario': {
        // Rule 2: no detailed syllabus, general content + call redirect.
        reply = buildReply('syllabus');
        break;
      }
      case 'financiacion': {
        // Rule 3: options exist, refer to the call, no conditions.
        reply = buildReply('financing');
        break;
      }
      case 'unknown': {
        // Rule 5: register the doubt, propose human contact, invent nothing.
        registeredDoubts.push(message);
        reply = buildReply('doubt');
        this.push({ kind: 'doubt', intent, detail: `registered: "${message}"` });
        break;
      }
      case 'general': {
        if (HANDOFF_TRIGGERS.callAccepted.test(normalizeEs(message))) {
          // Rule 9 (confirmed trigger): lead accepts/agrees to a call.
          handoff = this.buildHandoff('call_accepted', message);
          reply = buildReply('callAccepted');
          action = 'handoff';
          this.push({ kind: 'handoff', intent, detail: 'reason=call_accepted' });
          break;
        }
        const faq = findApprovedAnswer(this.content, message);
        if (faq) {
          const fromFaq = await this.replyFromApprovedFaq(message, faq);
          reply = fromFaq.reply;
          localViolations = fromFaq.violations;
        } else {
          // Social/small talk (classified as 'general').
          reply = buildReply('social');
        }
        break;
      }
    }

    // Rules guard: final validation of every reply (defense in depth).
    const guard = guardReply(reply);
    const ruleViolations = [...localViolations, ...guard.violations.map((v) => `${v.id}(rule ${v.rule})`)];
    if (!guard.ok) {
      // Rule 5 fallback: never ship a violating reply.
      reply = buildReply('doubt');
      if (!registeredDoubts.includes(message)) {
        registeredDoubts.push(message);
        this.push({ kind: 'doubt', intent, detail: `guard fallback for: "${message}"` });
      }
    }

    this.push({ kind: 'reply', intent, detail: reply });

    const result: TurnResult = {
      intent,
      action,
      reply,
      suppressed: false,
      registeredDoubts,
      registeredNoContinuar,
      ruleViolations,
    };
    if (handoff) result.handoff = handoff;
    return result;
  }

  // Optional LLM phrasing for approved FAQ answers. The provider output is
  // guarded; on violation, error, or empty output the approved text is used.
  private async replyFromApprovedFaq(
    question: string,
    entry: FaqEntry,
  ): Promise<{ reply: string; violations: string[] }> {
    if (!this.provider) {
      return { reply: entry.answer, violations: [] };
    }
    try {
      const raw = (
        await this.provider.complete({
          system: this.systemPrompt,
          messages: [{ role: 'user', content: question }],
        })
      ).trim();
      if (!raw) return { reply: entry.answer, violations: [] };
      const guard = guardReply(raw);
      if (!guard.ok) {
        return {
          reply: entry.answer,
          violations: guard.violations.map((v) => `${v.id}(rule ${v.rule})`),
        };
      }
      return { reply: raw, violations: [] };
    } catch {
      return { reply: entry.answer, violations: [] };
    }
  }

  private buildHandoff(reason: HandoffReason, lastMessage: string): HandoffContext {
    return {
      reason,
      leadId: this.lead.id,
      contact: this.lead.contact,
      bucket: this.lead.bucket,
      lastMessage,
      summary: `${this.conversationRecords.length} registered event(s) before handoff. Last lead message: "${lastMessage}"`,
    };
  }

  private push(record: ConversationRecord): void {
    this.conversationRecords.push(record);
  }

  // System prompt: lead-facing agent strings, Spanish (es-ES), tuteo.
  private buildSystemPrompt(): string {
    const faqLines = this.content.faq.map((entry) => `- ${entry.id}: ${entry.answer}`).join('\n');
    const hardRules = RULES.map((rule) => `${rule.id}. ${rule.summary}`).join('\n');
    const spanishRules = [
      '1. Nunca comuniques precios ni importes: solo la respuesta aprobada y la invitación a la llamada.',
      '2. Nunca comuniques el detallado del temario: sí contenido general, habilidades y salidas.',
      '3. Financiación: solo indica que existen opciones y remite a la llamada; no des condiciones.',
      '4. Responde solo con información aprobada por MUSK; no inventes condiciones, promociones, garantías ni promesas de empleo.',
      '5. Si no hay respuesta aprobada: registra la duda y propón contacto humano.',
      '6. Ninguna oferta para no compradores salvo mensaje aprobado por Nicolas; pedir precio no autoriza a dar importes.',
      '7. Si la persona pide parar, detén el seguimiento y regístralo.',
      '8. Sin presión artificial y sin prometer atención inmediata.',
      '9. Deriva a humano cuando pida hablar con una persona o acepte una llamada.',
      '10. Una guía como fuente de conocimiento no autoriza enviarla entera.',
      '11. No aprendas políticas comerciales nuevas: las respuestas nuevas se revisan antes de usarlas.',
    ].join('\n');
    return [
      'Eres el asistente de WhatsApp de MUSK Technologies. Hablas en español de España, con tú, cercano y profesional.',
      'Tu único objetivo es resolver dudas con información aprobada y conducir la conversación hacia una llamada con el equipo comercial. Nunca cierras una venta por WhatsApp.',
      `Formación: ${this.content.formationName}`,
      `Descripción general: ${this.content.generalDescription}`,
      `Habilidades: ${this.content.skills.join('; ')}`,
      `Salidas: ${this.content.outcomes.join('; ')}`,
      `Metodología: ${this.content.methodology}`,
      'Contenido aprobado (FAQ):',
      faqLines,
      'Reglas duras (nunca incumplir):',
      spanishRules,
      'Referencia técnica de reglas (inglés):',
      hardRules,
    ].join('\n');
  }
}
