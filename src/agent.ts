// MuskAgent core: builds the system prompt from approved content + hard rules,
// runs one conversation turn, and applies the deterministic rules guard
// (intent classification + rules.guardReply) before any reply reaches the lead.
//
// Guarded intents (stop, human, price, temario, financiacion, unknown) are
// fully deterministic and never call the LLM. The LLM is only consulted for
// 'general' turns that match an approved FAQ entry, and its output is always
// validated by guardReply (fallback: approved text, then registered doubt).

import type { ApprovedContent, FaqEntry, QualificationQuestion } from './content';
import { APPROVED_CONTENT, isPendingDecision } from './content';
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
  // Lead-facing message for this turn. EMPTY when the turn deliberately sends
  // nothing: an answer to a question has no message of its own (the next
  // qualification question follows it) and a turn after a stop is suppressed.
  reply: string;
  suppressed: boolean;
  registeredDoubts: string[];
  registeredNoContinuar: boolean;
  ruleViolations: string[];
  handoff?: HandoffContext;
  // Present when this turn was RECEIVED as the answer to the ask the agent had
  // just made. questionId is null for the opening message.
  capturedAnswer?: { questionId: string | null; text: string };
}

export type RecordKind = 'reply' | 'doubt' | 'handoff' | 'stop' | 'question' | 'answer';

export interface ConversationRecord {
  kind: RecordKind;
  // Optional: a record that did not come from a lead turn (e.g. a qualification
  // question) has no classified intent, and is left empty instead of faked.
  intent?: Intent;
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
  private handoffFired = false;
  private readonly askedQuestions = new Set<string>();
  private readonly conversationRecords: ConversationRecord[] = [];
  // The ask the agent is still waiting to receive an answer for. Before this
  // existed, every incoming message was classified as a fresh query, so a lead
  // answering the question they had just been asked got the rule 5 "no approved
  // answer" reply — rule 5 applied to the WRONG KIND of message (an answer, not
  // a question).
  private pendingAsk: { kind: 'opening' } | { kind: 'qualification'; id: string } | null = null;
  private readonly qualificationAnswersById = new Map<string, string>();

  constructor(options: MuskAgentOptions = {}) {
    this.content = options.content ?? APPROVED_CONTENT;
    this.provider = options.provider ?? null;
    this.lead = options.lead ?? {
      id: 'sim-lead',
      contact: 'simulated-contact',
      bucket: 'ilocalizable',
    };
    this.systemPrompt = this.buildSystemPrompt();
    if (this.opening() !== null) this.pendingAsk = { kind: 'opening' };
  }

  get records(): ConversationRecord[] {
    return [...this.conversationRecords];
  }

  // Answers received to asked qualification questions, in arrival order.
  // Supervision surface only: nothing here is scored or used to exclude a lead.
  get qualificationAnswers(): { id: string; text: string }[] {
    return [...this.qualificationAnswersById.entries()].map(([id, text]) => ({ id, text }));
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  reset(): void {
    this.stopped = false;
    this.handoffFired = false;
    this.askedQuestions.clear();
    this.conversationRecords.length = 0;
    this.pendingAsk = null;
    this.qualificationAnswersById.clear();
    if (this.opening() !== null) this.pendingAsk = { kind: 'opening' };
  }

  // Opening message of the conversation: the first outbound touch of the flow
  // (MVP spec §3.2/§3.6). Returns null while MUSK's decision is still open,
  // because a pending decision is not lead-facing content (rule 4).
  opening(): string | null {
    const message = this.content.initialMessage;
    if (isPendingDecision(message) || !message.trim()) return null;
    return message;
  }

  // Items of the content profile that are still waiting for a MUSK decision
  // (AGENTS.md "Decisiones abiertas"). They are REPORTED, never invented and
  // never sent: a contract surface for the simulation.
  get pendingDecisions(): string[] {
    const pending: string[] = [];
    if (this.opening() === null) pending.push('initialMessage');
    // The presentation of MUSK (company) is a minimum content item (spec §3.6)
    // that MUSK has not provided yet (§8.1). While it is a TODO(decisión) it is
    // reported here — never invented and never sent to the lead (rule 4).
    if (isPendingDecision(this.content.companyPresentation) || !this.content.companyPresentation.trim()) {
      pending.push('companyPresentation');
    }
    for (const question of this.content.qualificationQuestions) {
      if (!this.isAskable(question)) pending.push(`qualificationQuestions/${question.id}`);
    }
    return pending;
  }

  // Brief qualification, one question at a time (MVP spec §4 / AGENTS.md):
  // no exam, no scoring, no automatic exclusion — the answer is never
  // evaluated here. Returns null when the profile has no approved question,
  // when they have all been asked, or after the conversation stopped or
  // handoff fired (that is how the human takes over).
  nextQualificationQuestion(): QualificationQuestion | null {
    if (this.stopped || this.handoffFired) return null;
    for (const question of this.content.qualificationQuestions) {
      if (this.askedQuestions.has(question.id) || !this.isAskable(question)) continue;
      this.askedQuestions.add(question.id);
      const guard = guardReply(question.text);
      if (!guard.ok) {
        // Defense in depth: a lead-facing string that violates the guard is
        // never asked, and the skip is left visible in the records.
        this.push({
          kind: 'question',
          detail: `skipped (guard): ${question.id} [${guard.violations.map((violation) => violation.id).join(', ')}]`,
        });
        continue;
      }
      this.push({ kind: 'question', detail: `asked ${question.id}: ${question.text}` });
      this.pendingAsk = { kind: 'qualification', id: question.id };
      return question;
    }
    return null;
  }

  // Askable = real approved text. A TODO(decisión) placeholder is a decision
  // still open with MUSK, so it is never asked as if it were agreed.
  private isAskable(question: QualificationQuestion): boolean {
    return !isPendingDecision(question.text) && question.text.trim().length > 0;
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

    // Reception: if the agent asked something and this message is not a query we
    // must answer, it is the ANSWER to that ask. A real question is never
    // swallowed — guarded intents (rules 1, 2, 3, 7, 9 and the soft decline) and
    // any approved-FAQ question take precedence and keep the ask pending.
    if (this.pendingAsk !== null && this.isReceivableAnswer(message, intent)) {
      return this.receiveAnswer(message, intent);
    }

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
      case 'decline': {
        // Rule 5 (soft decline): not a stop (rule 7), not a confirmed trigger
        // (rule 9). Acknowledge without pressure, register the signal, and
        // keep the conversation alive with a human option.
        registeredDoubts.push(message);
        reply = buildReply('decline');
        this.push({ kind: 'doubt', intent, detail: `decline registered: "${message}"` });
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

    // Rule 9: once the lead is with a person, the agent stops qualifying.
    if (action === 'handoff') this.handoffFired = true;

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

  // A message is receivable as the pending answer unless it is something the
  // agent must ANSWER instead: a guarded intent, an explicit question, a
  // call-acceptance handoff, or a question that matches approved FAQ content.
  // Those keep the ask pending.
  private isReceivableAnswer(message: string, intent: Intent): boolean {
    if (intent !== 'unknown' && intent !== 'general') return false;
    // Rule 5 first: an explicit question mark means the lead is ASKING, not
    // answering. Capturing it would swallow the doubt (no "no approved answer"
    // reply, no human-contact proposal) and acknowledge a question with
    // courtesy copy. High precision by design: only '?' triggers it, so a free
    // answer that merely reads as 'unknown' is still received.
    if (message.includes('?')) return false;
    if (intent === 'general') {
      if (HANDOFF_TRIGGERS.callAccepted.test(normalizeEs(message))) return false;
      if (findApprovedAnswer(this.content, message) !== null) return false;
    }
    return true;
  }

  // True while the profile still has a question to ask: approved text, not asked
  // yet, and nobody else has taken over. Read-only — unlike
  // nextQualificationQuestion() it does not consume a question.
  private hasQualificationLeft(): boolean {
    if (this.stopped || this.handoffFired) return false;
    return this.content.qualificationQuestions.some(
      (question) => !this.askedQuestions.has(question.id) && this.isAskable(question),
    );
  }

  // Receives the lead's answer: registers it (never as a doubt), clears the
  // pending ask, and sends nothing of its own — the next qualification question
  // (asked by the caller) is the agent's message for that turn.
  //
  // Why no acknowledgement: a courtesy line here would be one fixed string, sent
  // as its own message, on EVERY answer — the same "Gracias, lo apunto." three
  // times in a row. That repetition is what reads as a bot, and "lo apunto" is
  // operator-speak about our own bookkeeping. The questions already open
  // naturally ("Para orientarte mejor, ¿...?"), so silence beats filler; any
  // acknowledgement worth sending is MUSK copy and needs its sign-off (rule 11).
  //
  // The exception is the LAST answer: with no question left, the agent proposes
  // the call, which is the flow's objective (AGENTS.md). That closing reuses the
  // wording already approved for the price answer instead of phrasing a new one.
  private receiveAnswer(message: string, intent: Intent): TurnResult {
    const ask = this.pendingAsk;
    this.pendingAsk = null;
    if (ask && ask.kind === 'qualification') {
      this.qualificationAnswersById.set(ask.id, message);
      this.push({ kind: 'answer', intent, detail: `answer to ${ask.id}: "${message}"` });
    } else {
      this.push({ kind: 'answer', intent, detail: `answer to opening: "${message}"` });
    }

    let reply = '';
    let ruleViolations: string[] = [];
    if (!this.hasQualificationLeft()) {
      const closing = buildReply('callProposal');
      const guard = guardReply(closing);
      if (guard.ok) {
        reply = closing;
        this.push({ kind: 'reply', intent, detail: reply });
      } else {
        // Defense in depth: a lead-facing string that violates the guard is
        // never sent. The skip stays visible in the records.
        ruleViolations = guard.violations.map((violation) => `${violation.id}(rule ${violation.rule})`);
      }
    }

    return {
      intent,
      action: 'none',
      reply,
      suppressed: false,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations,
      capturedAnswer: { questionId: ask && ask.kind === 'qualification' ? ask.id : null, text: message },
    };
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
