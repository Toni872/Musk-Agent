// MuskAgent: empathic, thread-following conversation engine.
//
// The LLM drives the reply; the deterministic knowledge base (src/kb.ts) is
// retrieved per turn (RAG) to ground the model in approved content. The only
// hard machinery left is the safety floor: the input triggers (stop, human
// request, call acceptance, phone handover) and the output guard (no prices,
// amounts, financing conditions, syllabus detail, promotions or job promises).
//
// Conversation memory is the raw message history (the model reads it to follow
// the thread) plus two counters that keep the call proposal from becoming a
// monotema: whether the last reply proposed a call, and how many times it has
// been proposed overall.

import type { ApprovedContent } from './content';
import { APPROVED_CONTENT, isPendingDecision } from './content';
import type { LLMChatMessage, LLMProvider } from './llm';
import { retrieve, retrieveTopK } from './retrieval';
import {
  acceptanceConfirmed,
  ANSWER_TRIGGERS,
  buildReply,
  extractSpanishPhone,
  guardReply,
  HANDOFF_TRIGGERS,
  momentConfirmed,
  STOP_TRIGGER,
} from './rules';
import { normalizeEs } from './text';

export type LeadBucket = 'ilocalizable' | 'no_comprador';

export interface LeadContact {
  id: string;
  contact: string;
  bucket: LeadBucket;
  // Why this lead was lost in the original campaign, as recorded in the lot.
  lossReason?: string;
}

export type AgentAction = 'none' | 'handoff' | 'stop';
export type HandoffReason = 'human_requested' | 'call_accepted';

// Context handed to the commercial: enough to locate the contact in the CRM and
// understand why the handoff fired (spec §3.3). The summary is composed from the
// recorded facts only, never from the model's output.
export interface HandoffContext {
  reason: HandoffReason;
  leadId: string;
  contact: string;
  bucket: LeadBucket;
  recipient?: string;
  lastMessage: string;
  summary: string;
  formation: string;
  lossReason?: string;
  // The lead's questions the agent could not answer, in arrival order.
  doubts: string[];
  // The lead's own messages that arrived AFTER the handoff, in arrival order.
  afterHandoff?: string[];
}

export interface TurnResult {
  // Operator-facing label of the turn: 'conversation' (RAG/LLM), 'stop' (rule 7)
  // or 'handoff' (rule 9). The lead only ever sees `reply`.
  intent: string;
  action: AgentAction;
  reply: string;
  suppressed: boolean;
  registeredDoubts: string[];
  registeredNoContinuar: boolean;
  ruleViolations: string[];
  handoff?: HandoffContext;
}

export type RecordKind = 'reply' | 'kb' | 'handoff' | 'stop' | 'doubt' | 'grounding';

export interface ConversationRecord {
  kind: RecordKind;
  intent?: string;
  detail: string;
  timestamp: string;
  // Provenance of a RAG turn: the passage ids that were retrieved, and their
  // score/coverage. Operator-facing only; the lead never sees it.
  kb?: {
    passageId: string;
    score: number;
    coverage: number;
  };
}

export interface MuskAgentOptions {
  content?: ApprovedContent;
  provider?: LLMProvider | null;
  lead?: LeadContact;
}

// Maximum turns of history the model reads to follow the thread.
const HISTORY_WINDOW = 20;
// Maximum number of knowledge-base passages retrieved per turn.
const RAG_TOP_K = 4;

// A safe, always-approved bridge for when the model produced nothing usable and
// the lead did not actually ask a question (e.g. "sí, cuéntame más"). It keeps
// the conversation going without inventing content and asks one thing.
const GENERIC_BRIDGE =
  'Te lo cuento con gusto. ¿Prefieres que siga contándote por aquí o que te lo explique una persona en una llamada para que te quede todo claro?';

// The single call-steering question used whenever a reply must end by pointing
// to the call (deterministic fallback and the chained-question backstop).
const CALL_QUESTION = '¿Quieres que te lo explique una persona en una llamada?';

// Keep rejected model output readable in the operator log without flooding it.
function truncate(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// Closed, lead-facing catalogue. Grounded on the approved passages
// (kb-escuela, kb-otros-programas and the per-programme entries): naming the
// list here is what stops the model from inventing a programme when the lead
// asks "¿qué formación tenéis?".
const CATALOGUE =
  'Python, Front End, Back End, Full Stack, el máster de videojuegos, Python con IA Engineering, y los másteres de Inteligencia Artificial, Machine Learning y Deep Learning';

export class MuskAgent {
  private readonly content: ApprovedContent;
  private readonly provider: LLMProvider | null;
  private readonly lead: LeadContact;
  private readonly systemPrompt: string;
  private stopped = false;
  private handoffFired = false;
  private lastHandoffContext?: HandoffContext;
  private readonly conversationRecords: ConversationRecord[] = [];
  private readonly doubtMessages: string[] = [];
  // Raw conversation history, the model's thread memory.
  private readonly history: { role: 'lead' | 'assistant'; text: string }[] = [];
  // The opening is the first outbound turn: once it is shown it becomes part of
  // the thread, so the model knows what it already asked when the lead replies.
  private openingSeeded = false;
  // Call-proposal guardrails: the model is told not to propose the call every
  // message; these counters are the deterministic backstop.
  private callProposedLastTurn = false;
  private callProposalCount = 0;

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

  get handoff(): HandoffContext | undefined {
    return this.lastHandoffContext;
  }

  // The lead's own words for every question the agent could not answer, in
  // arrival order and deduplicated. Supervision surface only.
  get doubts(): string[] {
    return [...this.doubtMessages];
  }

  // Qualification answers are gone with the deterministic engine: the model
  // reads the thread directly. Kept for the surface that still lists them.
  get qualificationAnswers(): { id: string; text: string }[] {
    return [];
  }

  // Items of the content profile that are still waiting for a MUSK decision.
  get pendingDecisions(): string[] {
    const pending: string[] = [];
    if (isPendingDecision(this.content.initialMessage) || !this.content.initialMessage.trim()) {
      pending.push('initialMessage');
    }
    if (isPendingDecision(this.content.companyPresentation) || !this.content.companyPresentation.trim()) {
      pending.push('companyPresentation');
    }
    return pending;
  }

  reset(): void {
    this.stopped = false;
    this.handoffFired = false;
    this.lastHandoffContext = undefined;
    this.conversationRecords.length = 0;
    this.doubtMessages.length = 0;
    this.history.length = 0;
    this.openingSeeded = false;
    this.callProposedLastTurn = false;
    this.callProposalCount = 0;
  }

  // Opening message of the conversation: the first outbound touch. Returns null
  // while MUSK's decision is still open (a pending decision is never sent).
  opening(): string | null {
    const message = this.content.initialMessage;
    if (isPendingDecision(message) || !message.trim()) return null;
    if (!guardReply(message).ok) return null;
    if (!this.openingSeeded) {
      this.history.push({ role: 'assistant', text: message });
      this.openingSeeded = true;
    }
    return message;
  }

  async runTurn(message: string): Promise<TurnResult> {
    const doubtsBefore = this.doubtMessages.length;
    const result = await this.runTurnInner(message);
    // Report the doubts registered DURING this turn, so the operator panel does
    // not lie when a question falls back to the human (rule 5).
    result.registeredDoubts = this.doubtMessages.slice(doubtsBefore);
    return result;
  }

  private async runTurnInner(message: string): Promise<TurnResult> {
    if (this.stopped) {
      return this.suppressedResult();
    }

    // After the handoff the lead is with a person: the agent stays silent and
    // only keeps registering anything the lead sends (the agreed moment often
    // arrives late).
    if (this.handoffFired) {
      return this.afterHandoff(message);
    }

    const folded = normalizeEs(message);

    // Rule 7: stop the follow-up.
    if (STOP_TRIGGER.test(folded)) {
      this.stopped = true;
      this.push({ kind: 'stop', intent: 'stop', detail: `lead requested stop: "${message}"` });
      return {
        intent: 'stop',
        action: 'stop',
        reply: buildReply('stop'),
        suppressed: false,
        registeredDoubts: [],
        registeredNoContinuar: true,
        ruleViolations: [],
      };
    }

    // Rule 9 (human request): explicit ask for a person.
    if (HANDOFF_TRIGGERS.humanRequested.test(folded)) {
      return this.fireHandoff('human_requested', message);
    }

    // Rule 9 (contact handed over): the phone number is what the call needs.
    if (extractSpanishPhone(message) !== null) {
      return this.fireHandoff('call_accepted', message);
    }

    // Rule 9 (confirmed call acceptance): only counts when the agent just
    // proposed a call in the previous turn.
    if (
      this.callProposedLastTurn &&
      (acceptanceConfirmed(folded) ||
        momentConfirmed(folded) ||
        ANSWER_TRIGGERS.affirmative.test(folded))
    ) {
      return this.fireHandoff('call_accepted', message);
    }

    return this.converse(message);
  }

  private suppressedResult(): TurnResult {
    return {
      intent: 'suppressed',
      action: 'none',
      reply: '',
      suppressed: true,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations: [],
    };
  }

  private afterHandoff(message: string): TurnResult {
    this.push({ kind: 'reply', intent: 'handoff', detail: `after the handoff: "${message}"` });
    const context = this.lastHandoffContext;
    if (context !== undefined) {
      context.lastMessage = message;
      context.afterHandoff = [...(context.afterHandoff ?? []), message];
      context.summary = this.buildHandoffSummary(context.reason, message);
    }
    const result = this.suppressedResult();
    result.intent = 'handoff';
    if (context !== undefined) result.handoff = context;
    return result;
  }

  private fireHandoff(reason: HandoffReason, message: string): TurnResult {
    this.handoffFired = true;
    const reply = reason === 'human_requested' ? buildReply('humanRequest') : buildReply('callAccepted');
    const context = this.buildHandoff(reason, message);
    this.lastHandoffContext = context;
    this.push({ kind: 'handoff', intent: 'handoff', detail: `reason=${reason}` });
    this.push({ kind: 'reply', intent: 'handoff', detail: reply });
    return {
      intent: 'handoff',
      action: 'handoff',
      reply,
      suppressed: false,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations: [],
      handoff: context,
    };
  }

  // The core turn: retrieve the closest approved passages, ask the model to
  // compose an empathic reply ending in one question, then check the output
  // against the safety floor.
  private async converse(message: string): Promise<TurnResult> {
    const ranked = retrieveTopK(this.content.kb ?? [], message, RAG_TOP_K);
    // The school overview is always offered to the model as context: without it,
    // a short query like "¿qué formación?" is answered with whatever single
    // passage the lexical score picked ("no es el momento") instead of the real
    // offer. It is context only: the deterministic fallback below still decides
    // from `ranked`, so a genuine unknown question keeps escalating (rule 5).
    const context = this.withOverview(ranked);
    if (context.length > 0) {
      this.push({
        kind: 'kb',
        intent: 'conversation',
        detail: `kb top: ${context.map((entry) => entry.passage.id).join(', ')}`,
      });
    }

    this.history.push({ role: 'lead', text: message });

    if (!this.provider) {
      return this.deterministicReply(message);
    }

    let raw: string;
    try {
      raw = (
        await this.provider.complete({
          system: this.buildTurnPrompt(context),
          messages: this.buildHistoryMessages(),
        })
      ).trim();
    } catch {
      this.push({ kind: 'grounding', intent: 'conversation', detail: 'provider failed: used fallback' });
      return this.deterministicReply(message);
    }

    raw = this.cleanReply(raw);
    if (!raw) {
      this.push({ kind: 'grounding', intent: 'conversation', detail: 'empty reply: used fallback' });
      return this.deterministicReply(message);
    }

    // Nicolás's directive: never chain questions. When the model emitted two or
    // more interrogations (an interest question plus the call question), keep
    // the answer part and end with the single call question.
    if (this.hasChainedQuestions(raw)) {
      this.push({
        kind: 'grounding',
        intent: 'conversation',
        detail: `chained questions collapsed: "${truncate(raw)}"`,
      });
      raw = this.collapseToCallQuestion(raw);
    }

    const guard = guardReply(raw);
    if (!guard.ok) {
      const violations = guard.violations.map((v) => `${v.id}(rule ${v.rule})`);
      this.push({
        kind: 'grounding',
        intent: 'conversation',
        detail: `reply rejected (${violations.join(', ')}): "${truncate(raw)}"`,
      });
      return this.safeFallback(message, violations);
    }

    this.callProposedLastTurn = this.proposesCall(raw);
    if (this.callProposedLastTurn) this.callProposalCount += 1;
    this.history.push({ role: 'assistant', text: raw });
    this.push({ kind: 'reply', intent: 'conversation', detail: raw });
    return {
      intent: 'conversation',
      action: 'none',
      reply: raw,
      suppressed: false,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations: [],
    };
  }

  // The school overview passage, prepended when the retrieved set lacks it. The
  // anchor keeps the model oriented on what the school actually offers.
  private withOverview(ranked: ReturnType<typeof retrieveTopK>): ReturnType<typeof retrieveTopK> {
    if (ranked.some((entry) => entry.passage.id === 'kb-escuela')) return ranked;
    const overview = (this.content.kb ?? []).find((passage) => passage.id === 'kb-escuela');
    if (overview === undefined) return ranked;
    return [{ passage: overview, score: 0, coverage: 0 }, ...ranked];
  }

  // No provider (or the model produced nothing): answer only from the GATED
  // retrieval — a passage that clears the thresholds and is not a forbidden
  // topic. That is the honest degraded mode: it never echoes a weakly-matched
  // passage (like "no es el momento" for "¿cómo funciona la formación?") and
  // keeps escalating real unknowns (rule 5) while bridging casual remarks.
  private deterministicReply(message: string): TurnResult {
    const match = retrieve(this.content.kb ?? [], message).match;
    const best = match?.passage.answer;
    const reply = best ? `${best} ${CALL_QUESTION}` : this.fallbackReply(message);
    this.history.push({ role: 'assistant', text: reply });
    this.push({ kind: 'reply', intent: 'conversation', detail: reply });
    return {
      intent: 'conversation',
      action: 'none',
      reply,
      suppressed: false,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations: [],
    };
  }

  // Nothing approved to say and no model: if the lead asked a real question it
  // becomes a doubt for the human; if it was just an invitation to keep talking,
  // bridge safely instead of telling them "lo dejo anotado".
  private fallbackReply(message: string): string {
    if (this.looksLikeQuestion(message)) return this.registerDoubt(message);
    return GENERIC_BRIDGE;
  }

  private looksLikeQuestion(message: string): boolean {
    if (message.includes('?')) return true;
    const folded = normalizeEs(message);
    return (
      folded.split(/\s+/).length <= 12 &&
      /\b(que|como|cuanto|cuanta|cuantos|cuantas|donde|cuando|cual|cuales|quien|quienes|sirve|vale|merece)\b/.test(
        folded,
      )
    );
  }

  // The model invented something unsafe: never ship it. Register the doubt and
  // propose a human (rule 5).
  private safeFallback(message: string, violations: string[]): TurnResult {
    this.registerDoubt(message);
    const reply = buildReply('doubt');
    this.push({ kind: 'reply', intent: 'conversation', detail: reply });
    return {
      intent: 'conversation',
      action: 'none',
      reply,
      suppressed: false,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations: violations,
    };
  }

  private registerDoubt(message: string): string {
    if (!this.doubtMessages.includes(message)) this.doubtMessages.push(message);
    this.push({ kind: 'doubt', intent: 'conversation', detail: `registered: "${message}"` });
    return buildReply('doubt');
  }

  // Strip common model artifacts: markdown fences, formatting, leading labels,
  // quotes. WhatsApp renders none of it, so bold markers, bullets, headers and
  // backticks would ship as literal noise to the lead.
  private cleanReply(raw: string): string {
    let value = raw.trim();
    value = value.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```$/, '').trim();
    value = value.replace(/^(respuesta|agente|asistente)\s*:\s*/i, '').trim();
    value = value
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[ \t]*[-*•]\s+/gm, '')
      .replace(/^[ \t]*\d+[.)]\s+/gm, '');
    value = value.replace(/\n{2,}/g, '\n').replace(/\n+/g, ' ').replace(/ {2,}/g, ' ').trim();
    value = value.replace(/^["']|["']$/g, '').trim();
    return value;
  }

  // Nicolás's directive: never chain questions. Detects a reply that ends two
  // or more interrogations (an interest question plus the call question).
  private hasChainedQuestions(text: string): boolean {
    return (text.match(/\?/g)?.length ?? 0) >= 2;
  }

  // Keeps the answer part (everything before the first question) and ends it with
  // the single call question, dropping the question cascade the model produced.
  // A Spanish question opens with "¿" and closes with "?", so the cut is at the
  // opening mark when present (falling back to "?" when the model skipped it).
  private collapseToCallQuestion(text: string): string {
    let idx = text.indexOf('¿');
    if (idx < 0) idx = text.indexOf('?');
    const answer = (idx >= 0 ? text.slice(0, idx) : text).replace(/[,;:.\s]+$/, '').trim();
    return answer.length > 0 ? `${answer}. ${CALL_QUESTION}` : CALL_QUESTION;
  }

  // True when the reply just proposed the call. Deliberately a heuristic: it is
  // the backstop for the call-acceptance handoff, not a business decision.
  private proposesCall(reply: string): boolean {
    if (!reply.trimEnd().endsWith('?')) return false;
    const folded = normalizeEs(reply);
    return /\b(llam|contact|telefon|movil|mañana o|tarde o|dia y hora|a que hora|mejor momento)/.test(
      folded,
    );
  }

  private buildHistoryMessages(): LLMChatMessage[] {
    return this.history
      .slice(-HISTORY_WINDOW)
      .map((entry) => ({ role: entry.role === 'lead' ? 'user' : 'assistant', content: entry.text }));
  }

  // -------------------------------------------------------------------------
  // Prompt building
  // -------------------------------------------------------------------------

  private buildSystemPrompt(): string {
    const faq = this.content.faq
      .map((entry) => `- ${entry.answer}`)
      .join('\n');
    return [
      'Eres el asistente de WhatsApp de Escuela Musk, una escuela online de programación, videojuegos e inteligencia artificial. Hablas en español de España, con tuteo, de forma cercana, cálida y profesional, como una persona que escucha de verdad.',
      '',
      'Tu objetivo es ayudar a la persona a decidir con calma y, sobre todo, llevarla a una llamada con el equipo: ahí es donde le explican el detalle (precio, financiación, calendario) que tú no puedes dar. Conversa y aclara sus dudas, pero en cada mensaje hazle entender que lo mejor para ella es hablar con una persona por teléfono. Nunca vendas ni presiones.',
      '',
      'CÓMO CONVERSAR (reglas de comportamiento, muy importantes):',
      '0. Responde PRIMERO a lo que la persona acaba de preguntar, de forma directa y en una o dos frases. Si pregunta qué formación o qué cursos ofrecemos, nómbralos todos en una sola frase con el catálogo de abajo; NO describas cada programa salvo que te pida uno concreto. La empatía va después, en una frase, no en lugar de la respuesta.',
      '1. Sigue el hilo. Usa lo que la persona ya te ha contado: su situación, su tiempo, sus miedos, lo que busca. No repitas preguntas ya respondidas. No saltes de tema sin enlazar con lo anterior.',
      '2. Empatiza, pero no en vez de responder. Valida lo que ha dicho con sus propias palabras y luego contesta a lo que preguntó.',
      '3. Mensajes cortos, como de WhatsApp, en texto plano. Máximo dos o tres frases en un solo párrafo. Nada de negritas (**), asteriscos, viñetas, listas numeradas ni encabezados. Nada de folletos.',
      '4. Termina SIEMPRE con UNA sola pregunta (un solo signo de interrogación, nunca dos), orientada a cerrar la llamada: propón hablar con una persona para que se lo explique todo bien (por ejemplo «¿te paso con el equipo?», «¿agendamos una llamada?», «¿te va bien que te contacten?»). No encadenes dos preguntas, no conviertas cada mensaje en un interrogatorio sobre sus intereses y no repitas la misma pregunta.',
      '5. Lleva la conversación hacia la llamada en casi todos tus mensajes: después de aclarar una duda, vuelve a ofrecer la llamada como el siguiente paso natural. Hazle entender que lo que más le conviene es hablar por teléfono con una persona que se lo explique todo. Varía la forma de proponerla para no sonar repetitivo.',
      '6. No mientas. Si algo no está en la información aprobada que tienes abajo, no lo inventes: dilo con naturalidad y ofrece confirmarlo con el equipo.',
      '7. No copies ni repitas frases de los pasajes si no responden a lo que preguntó. Los pasajes son tu fuente, no un guion que haya que recitar.',
      '',
      'REGLAS DE SEGURIDAD (nunca las incumplas, bajo ninguna circunstancia):',
      '- NUNCA des precios, importes, cifras de dinero, porcentajes, cuotas, intereses ni condiciones de pago. Ante una pregunta de precio o pago: dile que prefieres que se lo explique una persona, que SÍ hay opciones de financiación y dos años flexibles para completarla, y propón la llamada.',
      '- NUNCA prometas empleo, garantías, becas ni promociones que no estén en la información aprobada. Puedes decir con honestidad que no se garantiza un puesto de trabajo.',
      '- NUNCA envíes el temario detallado (módulo a módulo). Sí puedes hablar del contenido general, las habilidades y las salidas.',
      '- Si la persona pide parar, deja de insistir y despídete con respeto.',
      '',
      'INFORMACIÓN APROBADA DE LA ESCUELA (tu única fuente; no inventes nada fuera de ella):',
      `Catálogo oficial (no hay otros programas): ${CATALOGUE}.`,
      `Descripción: ${this.content.generalDescription}`,
      `Metodología: ${this.content.methodology}`,
      `Sobre la escuela: ${this.content.companyPresentation}`,
      `Respuesta aprobada para preguntas de precio: ${this.content.priceReply ?? ''}`,
      `Respuesta aprobada para preguntas de financiación: ${this.content.financingReply ?? ''}`,
      '',
      'Preguntas frecuentes (respuestas aprobadas):',
      faq,
    ].join('\n');
  }

  // The volatile, per-turn part: the retrieved passages only.
  private buildTurnPrompt(ranked: ReturnType<typeof retrieveTopK>): string {
    const passages =
      ranked.length > 0
        ? ranked.map((entry) => `- ${entry.passage.answer}`).join('\n')
        : '(ninguno)';
    return [
      this.systemPrompt,
      '',
      'Pasajes de la base de conocimiento relevantes a lo que acaba de preguntar:',
      passages,
      '',
      'Ahora escribe TU respuesta: contesta primero a lo que preguntó, en texto plano y breve (dos o tres frases), y termina con una sola pregunta orientada a agendar una llamada con el equipo.',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Handoff summary
  // -------------------------------------------------------------------------

  private buildHandoff(reason: HandoffReason, lastMessage: string): HandoffContext {
    const handoff: HandoffContext = {
      reason,
      leadId: this.lead.id,
      contact: this.lead.contact,
      bucket: this.lead.bucket,
      lastMessage,
      summary: this.buildHandoffSummary(reason, lastMessage),
      formation: this.content.formationName,
      doubts: [...this.doubtMessages],
    };
    if (this.content.handoffRecipient?.trim()) {
      handoff.recipient = this.content.handoffRecipient.trim();
    }
    if (this.lead.lossReason !== undefined) handoff.lossReason = this.lead.lossReason;
    return handoff;
  }

  // Commercial-facing summary (spec §3.3), Spanish (es-ES). Echoes only the
  // recorded facts, never the model's output.
  private buildHandoffSummary(reason: HandoffReason, lastMessage: string): string {
    const reasonText =
      reason === 'human_requested' ? 'pidió hablar con una persona' : 'aceptó la llamada';
    const parts = [`${this.content.formationName}: el lead ${reasonText}.`];
    const bucketLabel = this.lead.bucket === 'ilocalizable' ? 'ilocalizables' : 'no compradores';
    parts.push(`Bolsa de origen: ${bucketLabel}.`);
    if (this.lead.lossReason !== undefined && this.lead.lossReason.trim() !== '') {
      parts.push(`Motivo por el que se perdió en la campaña: ${this.lead.lossReason}.`);
    }
    if (this.doubtMessages.length === 0) {
      parts.push('Dudas registradas: ninguna.');
    } else {
      const visible = this.doubtMessages.slice(0, 5);
      const remaining = this.doubtMessages.length - visible.length;
      const listed = visible.map((doubt) => `"${doubt}"`).join('; ');
      parts.push(
        remaining > 0
          ? `Dudas registradas: ${listed}; … y ${remaining} más.`
          : `Dudas registradas: ${listed}.`,
      );
    }
    parts.push(`Último mensaje del lead: ${lastMessage}`);
    return parts.join(' ');
  }

  private push(record: Omit<ConversationRecord, 'timestamp'>): void {
    this.conversationRecords.push({ ...record, timestamp: new Date().toISOString() } as ConversationRecord);
  }
}
