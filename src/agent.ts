// MuskAgent core: builds the system prompt from approved content + hard rules,
// runs one conversation turn, and applies the deterministic rules guard
// (intent classification + rules.guardReply) before any reply reaches the lead.
//
// Guarded intents (stop, human, price, temario, financiacion, decline) and the
// rule-5 doubt path are fully deterministic and never call the LLM. The LLM is
// only consulted for an approved FAQ answer, a matched knowledge-base passage,
// or the fear reassurance template. Its output is always validated by
// guardReply AND by the grounding check (src/entailment.ts): the model may only
// use the content it was SHOWN — the approved text plus the approved profile
// context (fallback: approved text, then registered doubt).

import type { ApprovedContent, FaqEntry, QualificationQuestion, QualificationReaction } from './content';
import { APPROVED_CONTENT, isPendingDecision } from './content';
import {
  checkEntailment,
  composeGroundingSource,
  composeGroundingSourceFromText,
  groundingProfileContext,
} from './entailment';
import type { LLMProvider } from './llm';
import {
  bareAcknowledgement,
  classify,
  findApprovedAnswer,
  isWholeMessageAnswer,
  normalizeEs,
  type Intent,
} from './intent';
import { retrieve } from './retrieval';
import { acceptanceConfirmed, ANSWER_TRIGGERS, buildReply, expressesFear, expressesInterest, extractSpanishPhone, FAREWELL_FRAMES, guardReply, isClosingRemark, momentConfirmed, RULES } from './rules';

export type LeadBucket = 'ilocalizable' | 'no_comprador';

export interface LeadContact {
  id: string;
  contact: string;
  bucket: LeadBucket;
  // Why this lead was lost in the original campaign, as recorded in the lot
  // (spec §2.5/§8.2: ghosting, unreachable, price, enrolled elsewhere...).
  lossReason?: string;
}

export type AgentAction = 'none' | 'handoff' | 'stop';
export type HandoffReason = 'human_requested' | 'call_accepted';

// Context handed to the commercial: enough to locate the contact in the CRM
// and understand why the handoff fired, plus the lead's own qualification
// answers and registered doubts so the commercial does not arrive cold
// (spec §3.3: summary of the conversation for the commercial team).
export interface HandoffContext {
  reason: HandoffReason;
  leadId: string;
  contact: string;
  bucket: LeadBucket;
  // Configured routing hint for the simulated notice only; no external message
  // is sent by this repository.
  recipient?: string;
  lastMessage: string;
  summary: string;
  // Approved formation name of the conversation (content.formationName).
  formation: string;
  // Copied from the lead when the pilot lot recorded a reason (spec §8.2).
  lossReason?: string;
  // Every received qualification answer, in arrival order. question is the
  // wording the lead actually saw, or the id when that wording is still a
  // TODO(decisión) placeholder.
  qualification: { question: string; answer: string }[];
  // The lead's messages registered as doubts, in arrival order, deduplicated.
  doubts: string[];
  // The lead's own messages that arrived AFTER the handoff, in arrival order.
  // The agreed moment usually comes late ("mañana" and then "mañana a las
  // 9:00"), and the commercial must learn it (spec §3.6: the notice carries
  // contact and context).
  afterHandoff?: string[];
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
  // Present on the handoff turn AND on post-handoff turns, where it carries
  // the UPDATED context: the agreed moment can arrive after the handoff.
  handoff?: HandoffContext;
  // Present when this turn was RECEIVED as the answer to the ask the agent had
  // just made. questionId is null for the opening message.
  capturedAnswer?: { questionId: string | null; text: string };
  // Grounding verdict of the optional LLM layer (Phase 1): ok = the model's
  // rephrase was accepted (output guard AND grounding check); unsupported = the
  // tokens the approved source does not support. Present on every turn where
  // the provider was consulted, INCLUDING the rejected ones: the operator must
  // see the attempt. Operator-facing only: the lead never sees it.
  grounding?: { ok: boolean; unsupported: string[] };
}

export type RecordKind =
  | 'reply'
  | 'doubt'
  | 'handoff'
  | 'stop'
  | 'question'
  | 'answer'
  | 'kb'
  // Grounding verdict of the LLM rephrase (Phase 1). Its own kind because the
  // outcome is NOT the reply: it is the provenance of the reply (a rephrase
  // that was accepted, or a rejected rephrase that fell back to the approved
  // text). Operator-facing only.
  | 'grounding';

export interface ConversationRecord {
  kind: RecordKind;
  // Optional: a record that did not come from a lead turn (e.g. a qualification
  // question) has no classified intent, and is left empty instead of faked.
  intent?: Intent;
  detail: string;
  timestamp: string;
  // Provenance of a knowledge-base turn (Phase 0): the passage that answered
  // (or the closest one when nothing cleared the thresholds), the score and
  // the coverage it reached, and the thresholds that were applied.
  // Operator-facing only: the lead never sees it.
  kb?: {
    passageId: string;
    score: number;
    coverage: number;
    minScore: number;
    minCoverage: number;
  };
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
  // The lead's own words for every registered doubt, in arrival order and
  // deduplicated. buildHandoff() reads this array instead of parsing the
  // record details: details are operator-facing text, this is data.
  private readonly doubtMessages: string[] = [];
  // Last lead-facing string handed out (a question or a reply). The engine never
  // sends the same message twice in a row: for the lead it is the clearest bot
  // tell, and for us it hides a turn that moved nothing.
  private lastOutbound = '';
  // The agent asked the rule-5 doubt question ("¿te viene bien que te
  // contacten?") and is waiting for its yes/no. It applies to the IMMEDIATELY
  // following message only: a bare "sí" there is a confirmed acceptance
  // (rule 9) and must reach the commercial, not be filed as the answer to the
  // pending qualification question.
  private awaitingDoubtAnswer = false;
  // The handoff context handed to the commercial. It is kept and amended in
  // place when the lead sends something after the handoff (the agreed moment
  // usually arrives late), so the notice always carries the latest message.
  private lastHandoffContext?: HandoffContext;

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

  // The commercial handoff fired in this session, if any. Public read-only
  // seam for the surfaces that export the notice (UI copy/JSON/report); the
  // object is amended in place when the lead sends a later message.
  get handoff(): HandoffContext | undefined {
    return this.lastHandoffContext;
  }

  // The lead's own words for every question the agent could not answer from
  // approved content, in arrival order and deduplicated. Supervision surface
  // only (spec 3.3 and 6, "dudas principales"): the demo has to make them
  // countable, because whether the knowledge base is missing content or
  // vocabulary is the one question that decides if retrieval has to grow.
  get doubts(): string[] {
    return [...this.doubtMessages];
  }

  reset(): void {
    this.stopped = false;
    this.handoffFired = false;
    this.askedQuestions.clear();
    this.conversationRecords.length = 0;
    this.pendingAsk = null;
    this.lastOutbound = '';
    this.qualificationAnswersById.clear();
    this.doubtMessages.length = 0;
    this.awaitingDoubtAnswer = false;
    this.lastHandoffContext = undefined;
    if (this.opening() !== null) this.pendingAsk = { kind: 'opening' };
  }

  // Opening message of the conversation: the first outbound touch of the flow
  // (MVP spec �3.2/�3.6). Returns null while MUSK's decision is still open,
  // because a pending decision is not lead-facing content (rule 4). The opening
  // is treated as a lead-facing message and passes through the guard (defense in
  // depth), even though it comes from approved content.
  opening(): string | null {
    const message = this.content.initialMessage;
    if (isPendingDecision(message) || !message.trim()) return null;
    const guard = guardReply(message);
    if (!guard.ok) return null;
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
  //
  // It also returns null while a qualification ask or the call proposal is
  // pending: asking here would overwrite it, and the pending question would be
  // lost. That is what happened when the lead asked for the price mid-
  // qualification (the price answer keeps the ask armed on purpose, rule 1): the
  // next question went out on top of the unanswered one, the lead's reply was
  // filed against the WRONG question and the flow closed with the rule 5 doubt.
  // Same invariant as keepListeningForCall: an armed ask is never stolen.
  //
  // The opening is the exception: it is armed by construction (and by reset) as
  // the very first touch, and it is consumed by the lead's first message. Every
  // production caller asks for the next question AFTER a turn, so it is never
  // stolen in practice; keeping it out of the guard is what lets a caller sit
  // at the qualification stage without replaying the opening first.
  nextQualificationQuestion(): QualificationQuestion | null {
    if (this.stopped || this.handoffFired) return null;
    // The agent just asked the rule-5 doubt question ("¿te viene bien que te
    // contacten?"): a second question on top of it would leave the lead unable
    // to answer either. The qualification question is DEFERRED, not lost: an
    // ask that was already made stays pending and its answer is still
    // received normally.
    if (this.awaitingDoubtAnswer) return null;
    if (this.pendingAsk !== null && this.pendingAsk.kind !== 'opening') return null;
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

    // The doubt-proposal flag applies to the IMMEDIATELY following message
    // only: it is read and cleared here, so it can never survive a turn.
    const awaitingDoubtAnswer = this.awaitingDoubtAnswer;
    this.awaitingDoubtAnswer = false;

    const classifiedIntent = classify(message, this.content);
    const protectedIntents: Intent[] = ['stop', 'human', 'price', 'temario', 'financiacion'];
    const intent =
      !protectedIntents.includes(classifiedIntent) && this.negatesPendingReaction(message)
        ? 'decline'
        : classifiedIntent;

    // Rule 7: if the lead asks to stop after handoff (or in general), we must
    // register it and stop. `stopped` is checked at the beginning of runTurn,
    // but classifying as stop here catches cases that might slip through; in
    // any case, rule 7 requires registering the request.
    if (intent === ('stop' as Intent)) {
      if (!this.stopped) {
        this.stopped = true;
        this.push({ kind: 'stop', intent, detail: `lead requested stop: "${message}"` });
      }
      return {
        intent: 'stop' as Intent,
        action: 'stop',
        reply: buildReply('stop'),
        suppressed: false,
        registeredDoubts: [],
        registeredNoContinuar: true,
        ruleViolations: [],
      };
    }
    // Rule 9: after the handoff the lead is with a person, so the agent stops
    // writing. One person talking is the point of the handoff; a second voice
    // here (a greeting, a doubt acknowledgement) is exactly what reads as a bot.
    // Nothing is sent either: the turn belongs to the commercial now.
    if (this.handoffFired) {
      // Bookkeeping only — nothing is sent. EVERY post-handoff message is
      // registered: the agreed moment usually arrives AFTER the handoff
      // ("mañana" and then "mañana a las 9:00"), and the notice to the
      // commercial must carry contact and context (spec §3.6). Only the phone
      // number used to be kept, so everything else was silently dropped and
      // the agreed time never reached the commercial. The agent's silence is
      // untouched: no reply, and the turn is still marked suppressed.
      if (extractSpanishPhone(message) !== null) {
        this.push({ kind: 'answer', intent, detail: `contact given after the handoff: "${message}"` });
      } else {
        this.push({ kind: 'answer', intent, detail: `after the handoff: "${message}"` });
      }
      // The stored context is amended IN PLACE (same instance the caller
      // holds) and returned, so the operator panel shows the corrected notice.
      const context = this.lastHandoffContext;
      if (context !== undefined) {
        context.lastMessage = message;
        context.afterHandoff = [...(context.afterHandoff ?? []), message];
        context.summary = this.buildHandoffSummary(context.reason, message);
      }
      const result: TurnResult = {
        intent,
        action: 'none',
        reply: '',
        suppressed: true,
        registeredDoubts: [],
        registeredNoContinuar: false,
        ruleViolations: [],
      };
      if (context !== undefined) result.handoff = context;
      return result;
    }

    // Rule 9 (doubt proposal): the agent asked "¿te viene bien que te
    // contacten?" and the lead answers "sí". A bare affirmative can only be
    // the answer to that question (the qualification questions are not yes/no
    // questions), so it must win over the reception path that would otherwise
    // file it as the answer to the pending qualification ask — a lead who
    // says "sí, contactadme" is a conversion and must reach the commercial.
    if (
      awaitingDoubtAnswer &&
      (intent === 'general' || intent === 'unknown') &&
      ANSWER_TRIGGERS.affirmative.test(normalizeEs(message))
    ) {
      return this.acceptCall(
        message,
        intent,
        undefined,
        'affirmative answer to the doubt contact proposal',
      );
    }

    // Reception: if the agent asked something and this message is not a query we
    // must answer, it is the ANSWER to that ask. A real question is never
    // swallowed — guarded intents (rules 1, 2, 3, 7, 9 and the soft decline) and
    // any approved-FAQ question take precedence and keep the ask pending.
    if (this.pendingAsk !== null && this.isReceivableAnswer(message, intent)) {
      return this.receiveAnswer(message, intent);
    }
    // The opening is a yes/no ask, so it only owns the turn that answers it. Once
    // the lead asks something else the agent answers that instead and the ask is
    // stale: kept armed, a later "sí" (answering the FAQ's call invitation) was
    // filed as the answer to the opening and swallowed in silence.
    if (this.pendingAsk !== null && this.pendingAsk.kind === 'opening') {
      this.pendingAsk = null;
    }

    let reply: string;
    let action: AgentAction = 'none';
    let handoff: HandoffContext | undefined;
    const registeredDoubts: string[] = [];
    let registeredNoContinuar = false;
    let localViolations: string[] = [];
    // Grounding verdict of the optional LLM rephrase (Phase 1). Set on the
    // turns where the provider was consulted, accepted or rejected.
    let grounding: { ok: boolean; unsupported: string[] } | undefined;
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
        this.lastHandoffContext = handoff;
        reply = buildReply('humanRequest');
        action = 'handoff';
        this.push({ kind: 'handoff', intent, detail: 'reason=human_requested' });
        break;
      }
      case 'price': {
        // Rule 1: profile-approved response when configured, never an amount.
        reply = this.content.priceReply ?? buildReply('price');
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
        // Rule 3: approved financing options and completion window only.
        reply = this.content.financingReply ?? buildReply('financing');
        answersLead = true;
        break;
      }
      case 'kb': {
        // Rule 9 (confirmed trigger): a CONFIRMED acceptance outranks the
        // knowledge-base answer. The lead is accepting the call, so the
        // handoff fires with the approved call-accepted copy — answering with
        // the passage would leave a conversion unanswered. Same check, same
        // copy and same handoff as the 'general' branch.
        if (acceptanceConfirmed(normalizeEs(message))) {
          handoff = this.buildHandoff('call_accepted', message);
          this.lastHandoffContext = handoff;
          reply = buildReply('callAccepted');
          action = 'handoff';
          this.push({ kind: 'handoff', intent, detail: 'reason=call_accepted' });
          break;
        }
        // Retrieval stays deterministic. Only a matched passage's approved
        // answer can be rephrased; a miss keeps the rule-5 doubt path and never
        // calls the provider.
        const outcome = retrieve(this.content.kb ?? [], message);
        if (outcome.match === null) {
          // Unreachable in practice (classify only returns 'kb' on a match),
          // but the branch is kept: without an answer there is nothing to
          // send, so the turn falls back to rule 5.
          registeredDoubts.push(message);
          reply = buildReply('doubt');
          this.recordDoubtMessage(message);
          this.push({ kind: 'doubt', intent, detail: `registered: "${message}"` });
          break;
        }
        const match = outcome.match;
        const fromKb = await this.rephraseApproved(
          message,
          match.passage.answer,
          composeGroundingSourceFromText(match.passage.answer, this.content),
          `kb/${match.passage.id}`,
          intent,
        );
        reply = fromKb.reply;
        localViolations = fromKb.violations;
        grounding = fromKb.grounding;
        // It answers the lead, so the anti-repeat mechanism must not replace
        // it with the invitation (see the tail of runTurn).
        answersLead = true;
        this.push({
          kind: 'kb',
          intent,
          detail: `kb = ${match.passage.id} (score ${match.score.toFixed(2)}, coverage ${match.coverage.toFixed(2)})`,
          kb: {
            passageId: match.passage.id,
            score: match.score,
            coverage: match.coverage,
            minScore: outcome.thresholds.minScore,
            minCoverage: outcome.thresholds.minCoverage,
          },
        });
        break;
      }
      case 'unknown': {
        // A fear is not an unanswered question: it gets the reassurance template
        // and stays out of the doubt register, which feeds the pilot metric.
        // Everything else keeps the rule 5 path: register it, propose a human.
        const feared = expressesFear(normalizeEs(message));
        if (feared) {
          const approvedText = buildReply('reassurance');
          const fromReassurance = await this.rephraseApproved(
            message,
            approvedText,
            composeGroundingSourceFromText(approvedText, this.content),
            'reassurance',
            intent,
          );
          reply = fromReassurance.reply;
          localViolations = fromReassurance.violations;
          grounding = fromReassurance.grounding;
        } else {
          registeredDoubts.push(message);
          this.recordDoubtMessage(message);
          this.push({ kind: 'doubt', intent, detail: `registered: "${message}"` });
          reply = buildReply('doubt');
        }
        // Escalation with context: what came closest in the knowledge base
        // and how far it was from the thresholds. The operator sees WHY the
        // knowledge base did not answer, without the lead ever seeing it.
        const outcome = retrieve(this.content.kb ?? [], message);
        if (outcome.best !== null) {
          this.push({
            kind: 'kb',
            intent,
            detail: `kb closest = ${outcome.best.passage.id} (score ${outcome.best.score.toFixed(2)}, coverage ${outcome.best.coverage.toFixed(2)}) — below thresholds (min score ${outcome.thresholds.minScore}, min coverage ${outcome.thresholds.minCoverage})`,
            kb: {
              passageId: outcome.best.passage.id,
              score: outcome.best.score,
              coverage: outcome.best.coverage,
              minScore: outcome.thresholds.minScore,
              minCoverage: outcome.thresholds.minCoverage,
            },
          });
        }
        break;
      }
      case 'decline': {
        // Rule 5 (soft decline): not a stop (rule 7), not a confirmed trigger
        // (rule 9). Acknowledge without pressure, register the signal, and
        // keep the conversation alive with a human option.
        registeredDoubts.push(message);
        reply = buildReply('decline');
        this.recordDoubtMessage(message);
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
          this.lastHandoffContext = handoff;
          reply = buildReply('callAccepted');
          action = 'handoff';
          this.push({ kind: 'handoff', intent, detail: 'reason=call_accepted' });
          break;
        }
        const faq = findApprovedAnswer(this.content, message);
        if (faq) {
          const fromFaq = await this.replyFromApprovedFaq(message, faq, intent);
          reply = fromFaq.reply;
          localViolations = fromFaq.violations;
          grounding = fromFaq.grounding;
          answersLead = true;
        } else {
          // A bare acknowledgement answers what the agent just offered. The
          // approved FAQ answer ends offering the call ("Si quieres, te lo
          // vemos con detalle en una llamada"), so a "si" right after it means
          // interest, not a fresh hello: greeting back ignored the lead and
          // reset the conversation to "Hola, soy el asistente de MUSK".
          // "si" advances to the call proposal (approved copy; the tail arms
          // the ask, so the next message is received as its answer), while a
          // bare "no" is a soft decline (rule 5): acknowledged without
          // pressure and registered, never answered with a greeting.
          const ack = bareAcknowledgement(message);
          if (ack === 'yes') {
            reply = buildReply('callProposal');
          } else if (ack === 'no') {
            registeredDoubts.push(message);
            this.recordDoubtMessage(message);
            reply = buildReply('decline');
            this.push({ kind: 'doubt', intent, detail: `bare decline registered: "${message}"` });
          } else if (isClosingRemark(normalizeEs(message))) {
            // The lead is wrapping up ("gracias", "hasta luego"). Re-answering
            // with the greeting opener re-opened a finished conversation.
            reply = buildReply('closing');
          } else if (expressesInterest(normalizeEs(message))) {
            // "Me interesa" is a statement, not a question: the approved next
            // step is the call invitation (same sentence the price answer
            // already uses). Its tail arms the ask, so the lead's next message
            // is received as the answer to it.
            reply = buildReply('callProposal');
          } else {
            // Social/small talk (classified as 'general').
            reply = buildReply('social');
          }
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
        this.recordDoubtMessage(message);
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
    // being classified as a brand-new message. These strings ask for
    // it — the doubt reply ("¿Te viene bien que te contacten para aclararlo?"),
    // the profile's own follow-up acknowledgement, the price answer (it ends
    // with the invitation) and the invitation itself
    // when it replaces a repeated message — and without arming, the lead's "sí"
    // was answered with the social greeting: the agent asked something and then
    // stopped listening. An ask that is ALREADY armed is never stolen (the
    // pending qualification question keeps priority, locked by tests).
    const asksForContact =
      reply === buildReply('doubt') ||
      (this.content.doubtFollowup !== undefined && reply === this.content.doubtFollowup) ||
      reply === buildReply('price') ||
      reply === buildReply('callProposal');
    if (asksForContact) this.keepListeningForCall();

    // The rule-5 doubt reply asks the lead whether a contact suits him, so the
    // NEXT message is the answer to that yes/no question. A bare "sí" there is
    // a confirmed acceptance (rule 9) and must not be filed as the answer to
    // the pending qualification question.
    if (this.isDoubtReply(reply)) this.awaitingDoubtAnswer = true;

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
    if (grounding) result.grounding = grounding;
    return result;
  }

  // Optional LLM phrasing for approved answers (Phase 1).
  //
  // The contract is narrow: the model may only WORD the approved source it was
  // given — the approved text plus the approved profile context — never add
  // content. Two checks decide whether its answer reaches the lead:
  //
  //   1. the output guard (rules.ts): no amounts, no promotions, no promises;
  //   2. the grounding check (src/entailment.ts): every content token of the
  //      model's answer must exist in that source. This is what stops
  //      the leak the guard could not see: a number, a price word, or a term
  //      copied from ANOTHER FAQ entry of the same profile.
  //
  // If EITHER check fails, the reply that reaches the lead is the approved
  // text. The verdict is recorded so the operator sees the attempt.
  private async replyFromApprovedFaq(
    question: string,
    entry: FaqEntry,
    intent: Intent,
  ): Promise<{
    reply: string;
    violations: string[];
    grounding?: { ok: boolean; unsupported: string[] };
  }> {
    return this.rephraseApproved(
      question,
      entry.answer,
      composeGroundingSource(entry, this.content),
      `faq/${entry.id}`,
      intent,
    );
  }

  private async rephraseApproved(
    question: string,
    approvedText: string,
    groundingSource: string,
    provenanceLabel: string,
    intent: Intent,
  ): Promise<{
    reply: string;
    violations: string[];
    grounding?: { ok: boolean; unsupported: string[] };
  }> {
    if (!this.provider) {
      return { reply: approvedText, violations: [] };
    }
    let raw: string;
    try {
      raw = (
        await this.provider.complete({
          system: this.buildRequestPrompt(approvedText),
          messages: [{ role: 'user', content: question }],
        })
      ).trim();
    } catch {
      // The provider failed: the approved text is sent, and the attempt stays
      // visible in the records.
      this.push({
        kind: 'grounding',
        intent,
        detail: `rephrase not produced (provider failed): used the approved text`,
      });
      return { reply: approvedText, violations: [], grounding: { ok: false, unsupported: [] } };
    }
    if (!raw) {
      this.push({
        kind: 'grounding',
        intent,
        detail: `rephrase not produced (empty answer): used the approved text`,
      });
      return { reply: approvedText, violations: [], grounding: { ok: false, unsupported: [] } };
    }
    if (raw.length <= 4) {
      this.push({
        kind: 'grounding',
        intent,
        detail: `rephrase not produced (too short/empty-like): used the approved text`,
      });
      return { reply: approvedText, violations: [], grounding: { ok: false, unsupported: [] } };
    }
    const guard = guardReply(raw);
    // The source is EVERYTHING the model was shown for this call: the approved
    // text PLUS the profile context (generalDescription + methodology). The
    // prompt is built from the same pieces (see buildRequestPrompt /
    // buildSystemPrompt), so the check and the prompt can never disagree about
    // what was allowed.
    const entailment = checkEntailment(raw, groundingSource);
    const guardViolations = guard.violations.map((v) => `${v.id}(rule ${v.rule})`);
    const accepted = guard.ok && entailment.ok;
    if (accepted) {
      this.push({
        kind: 'grounding',
        intent,
        detail: `grounded rephrase of ${provenanceLabel}`,
      });
      return { reply: raw, violations: [], grounding: { ok: true, unsupported: [] } };
    }
    const reasons: string[] = [];
    if (!entailment.ok) {
      reasons.push(`unsupported: ${entailment.unsupported.map((token) => `"${token}"`).join(', ')}`);
    }
    if (!guard.ok) reasons.push(`guard: ${guardViolations.join(', ')}`);
    this.push({
      kind: 'grounding',
      intent,
      detail: `rephrase rejected (${reasons.join('; ')}): used the approved text`,
    });
    return {
      reply: approvedText,
      violations: guardViolations,
      grounding: { ok: false, unsupported: entailment.unsupported },
    };
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
  // call-acceptance handoff, or question that matches approved FAQ content.
  // Those keep the ask pending.
  private isReceivableAnswer(message: string, intent: Intent): boolean {
    // The knowledge-base intent ('kb') means the message is a QUERY, exactly
    // like an approved-FAQ match: the approved answer is sent and the pending
    // ask stays armed. It is NOT receivable by default.
    //
    // BEFORE this rule the knowledge base matched 'kb' and the reception path
    // treated it like 'unknown' (receivable), so a query that matched a
    // passage was SWALLOWED: the agent sent nothing and filed the lead's own
    // message as the answer to the pending ask. The lead was left in silence.
    //
    // EXCEPTION: a message that is genuinely the ANSWER to the pending ask is
    // still received as that answer. The knowledge base decides WHAT may be
    // answered; the pending ask keeps priority over a bare token that is
    // clearly an answer, and the lead's own answer to our question is never
    // stolen by the knowledge base.
    if (intent === 'kb') return this.matchesPendingQuestionAnswer(message);
    if (intent !== 'unknown' && intent !== 'general') return false;
    // The lead's own answer to OUR question is never stolen by the approved
    // catalogue. This matters for the orientation entry: "quiero cambiar de
    // sector" is both a valid catalogue keyword (the lead opens with it) and a
    // valid answer to the goal question (the lead replies with it). Without
    // this line the FAQ branch below returned false and the reply was swallowed
    // as a catalogue match: the ask stayed armed and the lead got no answer.
    // The pending ask wins; classification for the OPENING message is
    // unaffected because there is no pending ask then.
    if (this.matchesPendingQuestionAnswer(message)) return true;
    // Rule 5 first: a question means the lead is ASKING, not answering.
    if (this.looksLikeQuestion(message)) return false;
    // The OPENING is a yes/no question ("¿sigue siendo algo que te interese?"),
    // so only an actual yes/no answer belongs to it. A greeting, a closing, an
    // interest statement or any other fresh message must be classified: while the
    // opening was armed, they were consumed as its answer and the lead got an
    // EMPTY reply (no reaction matches "hola, vi vuestro mensaje").
    if (
      this.pendingAsk !== null &&
      this.pendingAsk.kind === 'opening' &&
      !isWholeMessageAnswer(normalizeEs(message))
    ) {
      return false;
    }
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

  // True when the message is genuinely the ANSWER to the pending ask:
  //   a) it matches the approved reaction keywords of the PENDING
  //      qualification question (the same folding reactionFor uses);
  //   b) it is a bare affirmative ("sí", "vale", "perfecto") — the answer to a
  //      yes/no ask, not a query;
  //   c) it is a bare negative ("no", "paso").
  private matchesPendingQuestionAnswer(message: string): boolean {
    const folded = normalizeEs(message);
    const ask = this.pendingAsk;
    if (ask !== null && ask.kind === 'qualification') {
      const question = this.content.qualificationQuestions.find((item) => item.id === ask.id);
      for (const reaction of question?.reactions ?? []) {
        if (this.matchesReaction(reaction, folded)) return true;
      }
    }
    return isWholeMessageAnswer(folded);
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
  // pending ask, and ends the turn with a short reaction to what the lead just
  // said. The next qualification question is asked by the caller (it is the
  // agent's message for that turn), so the reaction and the question travel as
  // two short messages, the way a person writes.
  //
  // Why a reaction now, and why not before: an earlier version sent nothing,
  // because ONE fixed courtesy line repeated on every answer ("Gracias, lo
  // apunto.") is the tell that reads as a bot. The fix is not silence but
  // specificity: the reaction is matched against the lead's own words
  // (content.qualificationQuestions[].reactions), so two different answers
  // never produce the same line. When no reaction matches, the turn sends
  // nothing: silence still beats filler.
  //
  // The exception is the LAST answer: with no question left, the agent proposes
  // the call, which is the flow's objective (AGENTS.md). The close is
  // content.closingInvitation when the profile has its own wording; otherwise
  // it reuses the sentence already approved for that moment
  // (REPLY_TEMPLATES.callProposal), so no new lead-facing copy is invented at
  // runtime (rule 11).
  private receiveAnswer(message: string, intent: Intent): TurnResult {
    const ask = this.pendingAsk;
    this.pendingAsk = null;
    let reaction = '';
    if (ask && ask.kind === 'qualification') {
      this.qualificationAnswersById.set(ask.id, message);
      this.push({ kind: 'answer', intent, detail: `answer to ${ask.id}: "${message}"` });
      reaction = this.reactionFor(ask.id, message);
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
      const closing = this.closingReply();
      const text = reaction === '' ? closing : `${reaction} ${closing}`;
      const guard = guardReply(text);
      if (guard.ok) {
        reply = text;
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
    } else if (reaction !== '') {
      // A message of its own: the next question follows it.
      const guard = guardReply(reaction);
      if (guard.ok) {
        reply = reaction;
        this.lastOutbound = reply;
        this.push({ kind: 'reply', intent, detail: reply });
      } else {
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

  // Short reaction to the lead's answer, from approved content (rule 11). First
  // keyword match wins; no match means no reaction, never a generic filler.
  private reactionFor(questionId: string, message: string): string {
    const question = this.content.qualificationQuestions.find((item) => item.id === questionId);
    if (!question?.reactions?.length) return '';
    const folded = normalizeEs(message);
    for (const reaction of question.reactions) {
      if (this.matchesReaction(reaction, folded)) {
        return isPendingDecision(reaction.say) ? '' : reaction.say;
      }
    }
    return '';
  }

  // A course name inside a negation is not a positive selection. Keep this
  // check shared by answer reception and the emitted acknowledgement so the
  // two paths cannot disagree.
  private matchesReaction(
    reaction: QualificationReaction,
    foldedMessage: string,
  ): boolean {
    if (
      reaction.avoidKeywords?.some((keyword) => foldedMessage.includes(normalizeEs(keyword)))
    ) {
      return false;
    }
    return reaction.keywords.some((keyword) => foldedMessage.includes(normalizeEs(keyword)));
  }

  private negatesPendingReaction(message: string): boolean {
    const ask = this.pendingAsk;
    if (ask === null || ask.kind !== 'qualification') return false;
    const question = this.content.qualificationQuestions.find((item) => item.id === ask.id);
    const folded = normalizeEs(message);
    return (question?.reactions ?? []).some((reaction) => {
      const namesSelection = reaction.keywords.some((keyword) => folded.includes(normalizeEs(keyword)));
      const negatesSelection = reaction.avoidKeywords?.some((keyword) =>
        folded.includes(normalizeEs(keyword)),
      );
      return namesSelection && negatesSelection === true;
    });
  }

  // The close that asks for the call: the profile's own wording when it has one,
  // otherwise the sentence already approved for that moment. A TODO(decisión)
  // placeholder is never sent (rule 4).
  private closingReply(): string {
    const own = this.content.closingInvitation;
    if (own !== undefined && own.trim().length > 0 && !isPendingDecision(own)) return own;
    return buildReply('callProposal');
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
      this.recordDoubtMessage(message);
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

    // A statement of interest ("me interesa", "me interesa mucho") is not the
    // answer to the call ask, but it is not an unanswerable question either:
    // the rule 5 doubt reply would tell the lead "no tengo una respuesta
    // aprobada sobre eso" for a message that asked nothing, and would count a
    // FALSE doubt in the pilot's KPI. The already-approved invitation is
    // re-offered (rule 11: no new copy) and the ask stays armed, so the lead's
    // next message is still received as its answer.
    if (expressesInterest(normalizeEs(message))) {
      const proposal = buildReply('callProposal');
      this.lastOutbound = proposal;
      this.push({ kind: 'reply', intent, detail: proposal });
      return {
        intent,
        action: 'none',
        reply: proposal,
        suppressed: false,
        registeredDoubts: [],
        registeredNoContinuar: false,
        ruleViolations: [],
        capturedAnswer,
      };
    }

    // A pure thanks ("gracias", "muchas gracias") arriving as the reply to the
    // ask is acknowledged as a closing: it is not a failed answer and must not
    // be filed as a doubt. A FAREWELL is deliberately excluded: "hasta mañana"
    // carries a day and is the documented goodbye trap - a goodbye must never
    // arrange a call (rule 9), so it stays in the doubt path where it is
    // registered and the lead is offered a human (locked by tests).
    if (isClosingRemark(normalizeEs(message)) && !FAREWELL_FRAMES.test(normalizeEs(message))) {
      const closing = buildReply('closing');
      this.lastOutbound = closing;
      this.push({ kind: 'reply', intent, detail: closing });
      return {
        intent,
        action: 'none',
        reply: closing,
        suppressed: false,
        registeredDoubts: [],
        registeredNoContinuar: false,
        ruleViolations: [],
        capturedAnswer,
      };
    }

    // Anything else: the same rule 5 handling as any other message the agent
    // has no approved answer for.
    const doubt = this.neverRepeat(buildReply('doubt'));
    this.recordDoubtMessage(message);
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
    const context = this.buildHandoff('call_accepted', message);
    this.lastHandoffContext = context;
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
      handoff: context,
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

  // True when the reply the agent just sent is the rule-5 doubt proposal (the
  // bare approved doubt template or the profile's own follow-up variant).
  // That reply ends with a yes/no question ("¿te viene bien que te
  // contacten?"), so the next message is its answer.
  private isDoubtReply(reply: string): boolean {
    if (reply === '') return false;
    if (reply === buildReply('doubt')) return true;
    const followup = this.content.doubtFollowup;
    return followup !== undefined && followup.trim() !== '' && reply === followup;
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
    // A repeated rule-5 doubt acknowledgement swaps to the PROFILE's follow-up
    // variant: replacing the second doubt with the bare contact-ask left the
    // lead's question visibly unacknowledged — the exact bot tell this method
    // exists to avoid. The variant is profile-specific copy (content.
    // doubtFollowup), so a profile that does not ship it — every profile whose
    // copy is actually approved by MUSK — keeps the bare invitation fallback
    // below, and no unapproved wording is ever sent (rules 4 and 11).
    if (reply === buildReply('doubt')) {
      const followup = this.content.doubtFollowup;
      if (followup !== undefined && followup.trim() !== '' && followup !== this.lastOutbound) {
        this.lastOutbound = followup;
        return followup;
      }
    }
    const invitation = buildReply('callProposal');
    if (invitation === this.lastOutbound) return '';
    this.lastOutbound = invitation;
    return invitation;
  }

  private buildHandoff(reason: HandoffReason, lastMessage: string): HandoffContext {
    const handoff: HandoffContext = {
      reason,
      leadId: this.lead.id,
      contact: this.lead.contact,
      bucket: this.lead.bucket,
      lastMessage,
      summary: this.buildHandoffSummary(reason, lastMessage),
      formation: this.content.formationName,
      qualification: this.qualificationAnswers.map(({ id, text }) => ({
        question: this.qualificationQuestionLabel(id),
        answer: text,
      })),
      doubts: [...this.doubtMessages],
    };
    if (this.content.handoffRecipient?.trim()) {
      handoff.recipient = this.content.handoffRecipient.trim();
    }
    if (this.lead.lossReason !== undefined) handoff.lossReason = this.lead.lossReason;
    return handoff;
  }

  // Commercial-facing summary of the conversation (spec §3.3), Spanish (es-ES).
  // It only echoes facts the engine recorded — approved content, the lead's
  // answers and the lead's own words — so it can never introduce a price, a
  // syllabus detail or a promise (hard rules 1, 2 and 4). Doubts are bounded so
  // the notice stays readable on WhatsApp.
  private buildHandoffSummary(reason: HandoffReason, lastMessage: string): string {
    const reasonText =
      reason === 'human_requested' ? 'pidió hablar con una persona' : 'aceptó la llamada';
    const parts = [`${this.content.formationName}: el lead ${reasonText}.`];

    const bucketLabel = this.lead.bucket === 'ilocalizable' ? 'ilocalizables' : 'no compradores';
    parts.push(`Bolsa de origen: ${bucketLabel}.`);

    // Why the lead was lost in the original campaign (spec §8.2: the lot carries
    // the loss reason). It is MUSK's own recorded data, not new copy, and it is
    // what lets the commercial segment the call before picking up the phone.
    if (this.lead.lossReason !== undefined && this.lead.lossReason.trim() !== '') {
      parts.push(`Motivo por el que se perdió en la campaña: ${this.lead.lossReason}.`);
    }

    const answers = this.qualificationAnswers.map(
      ({ id, text }) => `${this.qualificationQuestionLabel(id)} → ${text}`,
    );
    parts.push(
      answers.length > 0
        ? `Cualificación: ${answers.join('; ')}.`
        : 'Cualificación: sin respuestas registradas.',
    );

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

  // The question wording the lead actually saw, or its id while MUSK has not
  // approved that wording yet (a TODO(decisión) is never quoted, rule 4).
  private qualificationQuestionLabel(id: string): string {
    const question = this.content.qualificationQuestions.find((item) => item.id === id);
    if (!question || isPendingDecision(question.text) || question.text.trim() === '') return id;
    return question.text;
  }

  // One entry per registered doubt, in arrival order and deduplicated. Called
  // next to every kind 'doubt' record, so buildHandoff() never has to parse the
  // operator-facing detail strings.
  private recordDoubtMessage(message: string): void {
    if (!this.doubtMessages.includes(message)) this.doubtMessages.push(message);
  }

  private push(record: Omit<ConversationRecord, 'timestamp'>): void {
    this.conversationRecords.push({ ...record, timestamp: new Date().toISOString() } as ConversationRecord);
  }

  // STABLE part of the LLM request: the role, the tone, the eleven hard
  // rules and the approved PROFILE CONTEXT (general description + methodology).
  // It does not change between calls, so it can be cached by the provider.
  //
  // The FAQ answers are NOT here anymore (Phase 1). The prompt used to carry
  // EVERY answer of the profile, so the model could copy one entry's content
  // into another entry's answer, and the whole FAQ was re-sent on every call.
  // Now the request carries the ONE approved answer of the matched entry (see
  // buildRequestPrompt) plus the profile context, and the grounding check
  // verifies the model stayed inside exactly that source.
  //
  // The profile context is part of the source ON PURPOSE: the rule is that the
  // model may only use content it was SHOWN, so the words of the context are
  // legitimate in a rephrase ("formación", "metodología"...). The formation
  // NAME is deliberately NOT here: it is an internal marker (in the demo
  // profile it says "muestra de demo") and must never reach the lead.
  private buildSystemPrompt(): string {
    const hardRules = RULES.map((rule) => `${rule.id}. ${rule.summary}`).join('\n');
    const spanishRules = [
      '1. Nunca comuniques precios ni importes: solo la respuesta aprobada y la invitación a la llamada.',
      '2. Nunca comuniques el detallado del temario: sí contenido general, habilidades y salidas.',
      '3. Financiación: puedes indicar que hay opciones y que la formación se completa en dos años con flexibilidad; nunca des precios, importes, intereses, condiciones de cuotas ni otras condiciones de pago no aprobadas.',
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
      'Reglas duras (nunca incumplir):',
      spanishRules,
      'Referencia técnica de reglas (inglés):',
      hardRules,
      'Contexto aprobado de la formación (puedes usar sus palabras al reformular, pero no añadir nada que no esté aquí):',
      groundingProfileContext(this.content),
    ].join('\n');
  }

  // VOLATILE part of the LLM request: the per-call instruction plus the ONE
  // approved answer for this turn. The other approved answers of the profile
  // are deliberately absent: the model must not be able to copy them.
  //
  // The instruction is written to the MODEL (not to the lead), in Spanish, as
  // the rest of the prompt.
  private buildRequestPrompt(approvedAnswer: string): string {
    return [
      this.systemPrompt,
      'Instrucción de esta llamada: reformula la respuesta aprobada usando solo la información de la fuente.',
      'No añadas números, precios, porcentajes, fechas, promesas ni hechos nuevos.',
      'Si la fuente no responde a la pregunta, dilo claramente sin inventar nada.',
      `Respuesta aprobada de esta pregunta (la única de la FAQ que puedes usar): ${approvedAnswer}`,
    ].join('\n');
  }
}