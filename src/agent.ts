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
import { acceptanceConfirmed, ANSWER_TRIGGERS, buildReply, extractSpanishPhone, guardReply, momentConfirmed, RULES } from './rules';

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
  //
  // The call proposal is one of these asks: it is a yes/no question, so the
  // message that follows it is its ANSWER. While it was not tracked, a bare
  // "sI" read as a fresh greeting and the agent answered the lead with the
  // social line twice in a row.
  private pendingAsk:
    | { kind: 'opening' }
    | { kind: 'qualification'; id: string }
    | { kind: 'callProposal' }
    | null = null;
  private readonly qualificationAnswersById = new Map<string, string>();
  // Last lead-facing string handed out (a question or a reply). The engine never
  // sends the same message twice in a row: for the lead it is the clearest bot
  // tell, and for us it hides a turn that moved nothing.
  private lastOutbound = '';

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
    this.lastOutbound = '';
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
      this.lastOutbound = question.text;
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

    // Rule 9: after the handoff the lead is with a person, so the agent stops
    // writing. One person talking is the point of the handoff; a second voice
    // here (a greeting, a doubt acknowledgement) is exactly what reads as a bot.
    // Nothing is registered either: the turn belongs to the commercial now.
    if (this.handoffFired) {
      // One exception, and it is bookkeeping only — nothing is sent: the lead
      // hands over his phone AFTER the handoff. The humanRequest copy explicitly
      // asks for it and the notice to the commercial must carry the contact so
      // he can find the lead in the CRM (AGENTS.md), so dropping it silently
      // would lose the one piece of data the handoff is for. The agent's silence
      // is untouched: no reply, and the turn is still marked suppressed.
      if (extractSpanishPhone(message) !== null) {
        this.push({ kind: 'answer', intent, detail: `contact given after the handoff: "${message}"` });
      }
      return {
        intent,
        action: 'none',
        reply: '',
        suppressed: true,
        registeredDoubts: [],
        registeredNoContinuar: false,
        ruleViolations: [],
      };
    }

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
    // True when the reply ANSWERS what the lead asked (an approved answer to a
    // question, guarded rules 1-3 included). Such a reply is never replaced by
    // the repeat-avoiding invitation: leaving the question unanswered to avoid
    // repeating a sentence is worse than repeating it (see the tail).
    let answersLead = false;

    // Rule 9 (fresh-message path): the lead hands over a contact. The phone
    // number is the strongest acceptance signal there is — it is literally what
    // the call needs — and it used to be recognised ONLY as the answer to the
    // call proposal (receiveCallAnswer). So the moment no ask was armed the
    // number fell through to the rule 5 doubt path and was registered as a
    // QUESTION the lead never asked: the lead typed his mobile, the agent
    // answered "no tengo una respuesta aprobada sobre eso", and no handoff
    // fired. Reachable without an ask being armed: after a doubt answer to the
    // call proposal, after an invitation, or in any turn where nothing is
    // pending. Same acceptance, same copy, recognised here too.
    //
    // DECISION — precedence, kept identical to the answer path where it can be:
    // the informational intents keep their approved answer, because a price,
    // temario or financiación question is mandatory copy (rules 1-3) and
    // swapping it for the acceptance copy would leave the question unanswered.
    // 'stop' keeps rule 7 (respecting the rejection outranks the contact) and
    // 'human' keeps its own trigger (rule 9, human_requested). Everything else —
    // including a soft decline — closes on the contact, exactly as decided in
    // receiveCallAnswer ("no, mi número es 612 345 678" closes as call_accepted).
    const keepsItsOwnAnswer: Intent[] = ['stop', 'human', 'price', 'temario', 'financiacion'];
    if (!keepsItsOwnAnswer.includes(intent) && extractSpanishPhone(message) !== null) {
      return this.acceptCall(message, intent, undefined, 'contact handed over (no ask pending)');
    }

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
        answersLead = true;
        break;
      }
      case 'temario': {
        // Rule 2: no detailed syllabus, general content + call redirect.
        reply = buildReply('syllabus');
        answersLead = true;
        break;
      }
      case 'financiacion': {
        // Rule 3: options exist, refer to the call, no conditions.
        reply = buildReply('financing');
        answersLead = true;
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
        if (acceptanceConfirmed(normalizeEs(message))) {
          // Rule 9 (confirmed trigger): lead accepts/agrees to a call. Only a
          // CONFIRMED acceptance closes: acceptanceConfirmed rejects an
          // acceptance scoped by a bare negator ("no me viene bien", "nunca
          // me viene bien") or trailing one ("me viene bien, no"), which
          // classify() now sends to 'unknown' — and if an FAQ/greeting still
          // classifies it 'general', it fails this test and never handoffs.
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
          answersLead = true;
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

    // A reply identical to the previous message is replaced by the approved
    // call sentence (or withheld): see neverRepeat(). The exception is a reply
    // that ANSWERS what the lead asked: replacing an approved answer with the
    // invitation left the question unanswered — "cuéntame más, ¿qué cursos
    // tienes?" received the request for a contact instead of the answer, which
    // is exactly what reads as a bot. Repeating the answer (as a person would)
    // beats ignoring the question.
    reply = answersLead ? reply : this.neverRepeat(reply);
    if (answersLead) this.lastOutbound = reply;

    // The ask invariant: a message that asks the lead for the contact or a
    // moment must leave the ask armed, so the answer is RECEIVED instead of
    // being classified as a brand-new message. Three approved strings ask for
    // it — the doubt reply ("¿Te viene bien que te contacten para aclararlo?"),
    // the price answer (it ends with the invitation) and the invitation itself
    // when it replaces a repeated message — and without arming, the lead's "sí"
    // was answered with the social greeting: the agent asked something and then
    // stopped listening. An ask that is ALREADY armed is never stolen (the
    // pending qualification question keeps priority, locked by tests).
    const asksForContact =
      reply === buildReply('doubt') ||
      reply === buildReply('price') ||
      reply === buildReply('callProposal');
    if (asksForContact) this.keepListeningForCall();

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

  // True when the lead's message is ASKING rather than answering the question
  // the agent just made. A real question must never be captured as the pending
  // answer: swallowing it would skip the rule 5 reply (register the doubt and
  // offer a human contact) and would let a guarded question (rules 1, 2, 3, 7, 9)
  // pass as a qualification answer. The ask stays pending either way, so the
  // lead's next message is still received as the answer.
  //
  // Precision over recall, deliberately. In order of strength:
  //   1. an explicit '?' — the lead is unambiguously asking;
  //   2. an approved FAQ answer — the message is provably a query;
  //   3. a CLOSED list of question frames ("cuentame", "quiero saber",
  //      "en que consiste"...) that never appear in a plain answer.
  // A free answer that merely reads as 'unknown' ("de cero", "no tengo
  // experiencia", "me viene bien el martes") is still received as an answer.
  private looksLikeQuestion(message: string): boolean {
    if (message.includes('?')) return true;
    const folded = normalizeEs(message);
    if (findApprovedAnswer(this.content, folded) !== null) return true;
    const questionFrames =
      /\b(cuentame|me puedes decir|puedes decirme|quiero saber|me gustaria saber|hablame de|dime mas|informacion sobre|que es|quienes sois|como funciona|en que consiste|donde puedo|cuanto dura)\b/;
    return questionFrames.test(folded);
  }

  // A message is receivable as the pending answer unless it is something the
  // agent must ANSWER instead: a guarded intent, an explicit question, a
  // call-acceptance handoff, or a question that matches approved FAQ content.
  // Those keep the ask pending.
  private isReceivableAnswer(message: string, intent: Intent): boolean {
    if (intent !== 'unknown' && intent !== 'general') return false;
    // Rule 5 first: a question means the lead is ASKING, not answering.
    if (this.looksLikeQuestion(message)) return false;
    if (intent === 'general') {
      // Only a CONFIRMED acceptance is kept out of the answer path: a negated
      // acceptance ("no me viene bien") fails acceptanceConfirmed, IS
      // receivable, and reaches receiveCallAnswer, where nonAvailability
      // turns it into the rule 5 doubt instead of a handoff (rule 9).
      if (acceptanceConfirmed(normalizeEs(message))) return false;
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
    } else if (ask && ask.kind === 'callProposal') {
      // The ask was the call proposal (a yes/no question): its answer decides
      // whether rule 9 fires, so it never goes through the generic path.
      this.push({ kind: 'answer', intent, detail: `answer to the call: "${message}"` });
      return this.receiveCallAnswer(message, intent);
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
        // The closing asks for the call, so it leaves the ask armed: the lead's
        // next message is RECEIVED as its answer instead of being classified as
        // a brand-new message (which is what produced "¡Hola! Soy el asistente"
        // twice in a row).
        this.pendingAsk = { kind: 'callProposal' };
        this.lastOutbound = reply;
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

  // The lead's answer to the call question. A confirmed handoff (rule 9) needs
  // the lead to have ACCEPTED the call, and to a yes/no question a plain "si" is
  // exactly that: the answer the agent asked for. A bare yes/no is NOT enough,
  // though: leads answer a call proposal with a moment ("por las tardes",
  // "sobre las seis") or hand over their phone number — both are an acceptance
  // too and now close the handoff with the already-approved callAccepted copy.
  // An explicit non-availability ("no puedo por la tarde") and anything else
  // ambiguous deliberately do NOT close: rule 9 only counts a CONFIRMED
  // acceptance, so they stay in the rule 5 doubt family. Decision order is
  // what decides when one message carries several signals: the first matching
  // branch wins, so non-availability is tested BEFORE availability.
  private receiveCallAnswer(message: string, intent: Intent): TurnResult {
    const folded = normalizeEs(message);
    const capturedAnswer = { questionId: 'call-proposal', text: message };

    if (ANSWER_TRIGGERS.affirmative.test(folded)) {
      return this.acceptCall(message, intent, capturedAnswer, 'answer to the call');
    }

    if (ANSWER_TRIGGERS.negative.test(folded)) {
      // A no to the call is not a stop (rule 7) and gets no pressure (rule 8).
      const no = buildReply('decline');
      this.lastOutbound = no;
      this.push({ kind: 'reply', intent, detail: no });
      return {
        intent,
        action: 'none',
        reply: no,
        suppressed: false,
        registeredDoubts: [],
        registeredNoContinuar: false,
        ruleViolations: [],
        capturedAnswer,
      };
    }

    // Explicit non-availability must NEVER close the deal (rule 9): "no puedo
    // por la tarde" names a moment but refuses it, so it is registered as a
    // doubt (rule 5), never a handoff.
    if (ANSWER_TRIGGERS.nonAvailability.test(folded)) {
      // The doubt reply asks the lead whether a contact suits him, so the agent
      // stays listening for that answer (keepListeningForCall) — and the copy
      // goes through neverRepeat, because this path returns before runTurn's
      // tail: without it, two identical doubt replies in a row could be sent.
      const doubt = this.neverRepeat(buildReply('doubt'));
      this.push({ kind: 'doubt', intent, detail: `registered (non-availability in the answer): "${message}"` });
      this.lastOutbound = doubt;
      this.push({ kind: 'reply', intent, detail: doubt });
      this.keepListeningForCall();
      return {
        intent,
        action: 'none',
        reply: doubt,
        suppressed: false,
        registeredDoubts: [message],
        registeredNoContinuar: false,
        ruleViolations: [],
        capturedAnswer,
      };
    }

    // An explicit moment answers the call proposal with WHEN, which is an
    // acceptance (rule 9) — but ONLY when the moment is not negated
    // (momentConfirmed). DECISION: when in doubt we do NOT close.
    // "Perfecto, dejo anotado que te va bien la llamada" promises a real
    // person a call, and wrongly promising that call breaks rule 9 (the
    // trigger counts a CONFIRMED acceptance only), whereas the doubt path
    // registers the doubt and offers a human contact — the product's actual
    // goal: the close is always human (AGENTS.md). So "no por las tardes",
    // "no el jueves", "sí, pero no el jueves" and "no, mejor a las seis" all
    // go to the rule 5 doubt reply. This SUPERSEDES the earlier decision that
    // "no, mejor a las seis" closes with the acceptance copy. The lead's raw
    // text reaches the commercial through buildHandoff() when it does close.
    if (momentConfirmed(folded)) {
      return this.acceptCall(message, intent, capturedAnswer, 'answer to the call (moment given)');
    }

    // A handed-over phone number is an acceptance too (rule 9): the contact is
    // what the call needs. extractSpanishPhone is strict (rule 9): only a real
    // Spanish mobile with a contact cue, or a message that is nothing but the
    // number — so a date ("el 12/03/2027") never closes the deal.
    //
    // DECISION (explicitly NOT a defect — do not "fix" this): handing over the
    // contact, or asking to be called ("llámame"), IS the lead arranging the
    // call (rule 9: the contact is what the call needs) and it OVERRIDES a
    // moment objection. "no, mi número es 612 345 678", "no el jueves, te
    // dejo mi número 612 345 678" and "no por las tardes, llámame al 612 345
    // 678" all close as call_accepted even though each carries a negation:
    // the negation guards (NEGATED_ACCEPTANCE / TRAILING_NEGATOR) protect the
    // moment and acceptance branches only — the contact IS the call, so it
    // wins. Locked by tests; do not route these to the doubt path.
    if (extractSpanishPhone(message) !== null) {
      return this.acceptCall(message, intent, capturedAnswer, 'answer to the call (phone number given)');
    }

    // No branch here for a human request or a CONFIRMED call-acceptance
    // phrase: those never reach this method. classify() maps a human request
    // to 'human' and a confirmed call acceptance to 'general';
    // isReceivableAnswer() rejects any intent that is neither 'unknown' nor
    // 'general' and rejects a 'general' message where acceptanceConfirmed
    // holds, so both are handled by the fresh-message path (runTurn's
    // switch), not as an answer. A NEGATED acceptance is exactly the opposite:
    // it fails acceptanceConfirmed, IS receivable, and lands HERE — caught by
    // the nonAvailability branch ("no me viene bien"), the negated-moment
    // guard above, or the rule 5 doubt fallback below. Do NOT re-add
    // confirmed acceptances here.

    // Anything else: the same rule 5 handling as any other message the agent
    // has no approved answer for.
    const doubt = this.neverRepeat(buildReply('doubt'));
    this.push({ kind: 'doubt', intent, detail: `registered (no yes/no in the answer): "${message}"` });
    this.lastOutbound = doubt;
    this.push({ kind: 'reply', intent, detail: doubt });
    // Same as the non-availability branch: the doubt reply asks a question, so
    // the agent keeps listening (never stealing an ask that is already armed).
    this.keepListeningForCall();
    return {
      intent,
      action: 'none',
      reply: doubt,
      suppressed: false,
      registeredDoubts: [message],
      registeredNoContinuar: false,
      ruleViolations: [],
      capturedAnswer,
    };
  }

  // One place for the rule 9 call_accepted close (bare affirmative answer,
  // moment given, phone handed over): the already-approved callAccepted copy,
  // the handoff record carrying the lead's raw text, and the output guard as
  // defense in depth. No new lead-facing string is produced here (rule 11).
  // capturedAnswer is undefined when the close did not come from a pending ask
  // (the fresh-message path): there was no question to answer, so there is
  // nothing to capture and the field is left out of the result.
  private acceptCall(
    message: string,
    intent: Intent,
    capturedAnswer: { questionId: string | null; text: string } | undefined,
    reasonDetail: string,
  ): TurnResult {
    const accepted = buildReply('callAccepted');
    const guard = guardReply(accepted);
    this.handoffFired = true;
    this.push({ kind: 'handoff', intent, detail: `reason=call_accepted (${reasonDetail})` });
    this.lastOutbound = accepted;
    this.push({ kind: 'reply', intent, detail: accepted });
    const result: TurnResult = {
      intent,
      action: 'handoff',
      reply: accepted,
      suppressed: false,
      registeredDoubts: [],
      registeredNoContinuar: false,
      ruleViolations: guard.ok
        ? []
        : guard.violations.map((violation) => `${violation.id}(rule ${violation.rule})`),
      handoff: this.buildHandoff('call_accepted', message),
    };
    if (capturedAnswer) result.capturedAnswer = capturedAnswer;
    return result;
  }

  // The engine never sends the SAME message twice in a row: for the lead it is
  // the clearest bot tell ("¡Hola! Soy el asistente de MUSK." twice), and for us
  // it hides a turn that moved nothing. The replacement is the call sentence,
  // already approved, reused verbatim (rule 11); if even that would repeat, the
  // turn sends nothing and the conversation is left to the operator.
  // The ask invariant, in one place (see the tail of runTurn and the two doubt
  // branches of receiveCallAnswer): a message that asks the lead for the contact
  // or a moment leaves the ask armed, so the lead's next message is RECEIVED as
  // its answer instead of being classified as brand-new. Without it, "sí" after
  // a doubt reply got the social greeting — the agent asked a question and then
  // stopped listening to the answer.
  //
  // Only when nothing is armed: an ask that is ALREADY pending is never stolen.
  // The pending qualification question keeps priority (locked by tests: a price
  // question asked while a qualification question is pending must not steal it),
  // and the same guard keeps the doubt reply from overwriting the ask it was
  // answering.
  private keepListeningForCall(): void {
    if (this.pendingAsk !== null) return;
    if (this.stopped || this.handoffFired) return;
    this.pendingAsk = { kind: 'callProposal' };
  }

  // The lead is never sent the same line twice in a row: an identical message
  // reads as a bot, so it is replaced by the approved invitation (or withheld
  // when that too would repeat — the operator takes over). Callers must NOT
  // route an APPROVED ANSWER through here: repeating the answer is what a
  // person does, while swapping in the invitation leaves the question
  // unanswered (see the tail of runTurn).
  private neverRepeat(reply: string): string {
    if (reply === '') return '';
    if (reply !== this.lastOutbound) {
      this.lastOutbound = reply;
      return reply;
    }
    const invitation = buildReply('callProposal');
    if (invitation === this.lastOutbound) return '';
    this.lastOutbound = invitation;
    return invitation;
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
      'Eres el asistente de WhatsApp de Escuela Musk. Hablas en español de España, con tú, cercano y profesional.',
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
