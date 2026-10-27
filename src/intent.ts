// Deterministic intent classifier for lead messages (Spanish, es-ES).
// Classification is keyword/trigger based and never calls an LLM, which makes
// the mandatory rule tests deterministic and fully offline.

import type { ApprovedContent, FaqEntry } from './content';
import { mentionsProgramme } from './content';
import {
  acceptanceConfirmed,
  ANSWER_TRIGGERS,
  expressesInterest,
  HANDOFF_TRIGGERS,
  isClosingRemark,
  matchesWholeMessage,
  STOP_TRIGGER,
} from './rules';
import { isProgrammePassage } from './kb';
import { FORBIDDEN_TOPIC_PATTERNS, retrieve, type RetrievalMode } from './retrieval';
import { normalizeEs } from './text';

// The normalizer lives in its own leaf module (src/text.ts) so that the
// trigger layer (src/rules.ts) and this intent layer can share it without an
// import cycle. It is re-exported here so the existing importers
// (src/agent.ts, src/entailment.ts, src/eval.ts, tests/rules.test.ts) keep
// working unchanged.
export { normalizeEs } from './text';

export type Intent =
  | 'price'
  | 'temario'
  | 'financiacion'
  | 'unknown'
  | 'human'
  | 'stop'
  | 'decline'
  | 'general'
  // The lead's question is answered by the knowledge base (src/kb.ts) through
  // the deterministic retrieval layer (src/retrieval.ts). It is the LAST
  // resort before rule 5: the hand-written FAQ always keeps priority.
  | 'kb';

// Input-side topic patterns. Stop and human come from the shared rule triggers
// (rules.ts) so classification and the guard layer can never drift apart.
export const INPUT_PATTERNS: Record<Exclude<Intent, 'general' | 'unknown' | 'kb'>, RegExp> = {
  stop: STOP_TRIGGER,
  human: HANDOFF_TRIGGERS.humanRequested,
  price:
    /cuanto (cuesta|vale|es|esta|son)|\b(precios?|coste|costo|importes?|tarifas?|euros?)\b|€|\bcar[oa]s?\b|\bcarisim\w*|\bcostos\w*|\bdescuentos?\b|\bpromocion\w*|no me lo puedo permitir|fuera de (mi )?presupuesto|no (?:me )?(?:lo )?puedo pagar|no tengo (?:dinero|presupuesto)/,
  temario:
    /\btemario\b|\b(programa|plan) de estudios\b|\bprograma (detallado|completo)\b|\bcontenido (detallado|completo)\b|\bmodulos\b|\bsyllabus\b|\bque se (da|estudia|imparte)\b/,
  // Financing phrasings a real lead uses without ever saying "financiación":
  // "pagarlo poco a poco", "en cuotas", "mensualidades". Rule 3: we only ever
  // say options exist and refer to the call, so a wider net here is SAFER, not
  // riskier. Note `price` is still evaluated first (see classify), so a mixed
  // message ("cuánto cuesta y se puede financiar") keeps resolving to `price`.
  // The `\bfinancia\w*` stem also covers reflexive/enclitic forms ("financiarse",
  // "financiarlo") that `\bfinanciar\b` missed (regression coverage:
  // tests/reception.test.ts, financing reflexive case).
  // Narrow typo alias for the observed transposition "finanaciar" /
  // "finanaciarse"; do not generalize this to fuzzy matching.
  financiacion:
    /\bfinancia\w*\b|\bfinanaciar(?:se)?\b|\bpago (en|a) plazos\b|\bpagar a plazos\b|\bpagar\w* poco a poco\b|\bcuotas?\b|\bmensualidades?\b|\bbecas?\b|\bsubvencion\w*\b|\bprestamos?\b/,
  // Soft decline (rule 5 family): a bare "no me interesa" / "no estoy
  // interesado" is NOT a stop (rule 7) and NOT a confirmed handoff trigger
  // (rule 9). Only the bare/near-bare form is caught, so topic-specific
  // messages ("no me interesa el temario", "no me interesa el precio") keep
  // their specific intent because those are classified earlier.
  decline:
    /no (?:me )?interes\w*(?: (?:por ahora|ahora|en este momento|en estos momentos|mucho|gracias))?\b|no (?:estoy|estamos) interesad\w*\b/,
};

// Social/small talk: conversational turns that carry no substantive question.
// Greetings/acknowledgements count only when they form the WHOLE message (with
// at most a trailing filler like "ok" or "que tal"); otherwise a substantive
// message that merely starts with "gracias" or "hola" ("gracias, no me
// interesa", "gracias, no tengo tiempo") would be misfired as a greeting and
// never reach its real intent (decline/unknown).
const SOCIAL_GREETING =
  /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|como estas|adios|hasta luego|gracias)(?:\s+(ok|vale|perfecto|genial|claro|gracias|adios|hasta luego|que tal|como estas))?$/;

// Check-ins and sympathy remarks carry no question either, but they are NOT
// greetings: answering them with the knowledge base produced the worst possible
// reply in the demo ("¿sigues ahí?" -> a passage about AI and jobs). They are
// matched as WHOLE messages only, so "sigues ahi, no me interesa" keeps its
// decline intent and a substantive question that starts the same way still
// reaches its own answer.
const SOCIAL_CHECK_IN = /^(sigues (?:por )?ahi|estas (?:por )?ahi|que pena|vaya|uf|lo siento)$/;
const SOCIAL_ACK = /^(ok|vale|perfecto|entendido|genial|claro|si|no)$/;

// A message that OPENS with a greeting. Used only as the last resort in
// classify(), after every guarded intent, the FAQ and the knowledge base, to
// keep a greeting-with-context ("hola, vi vuestro mensaje") out of the rule 5
// doubt path when it asks nothing. It is deliberately not a whole-message
// pattern: the point is a preamble the social trigger above cannot accept.
const LEADING_GREETING =
  /^(?:hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/;

// Interrogative shape: a question mark or an interrogative word. Kept small and
// Spanish-centric on purpose; a false "question" only means the message stays
// 'unknown' (the safe direction: rule 5 registers the doubt).
const INTERROGATIVE_SHAPE =
  /\?|\b(?:que|cual|cuales|como|cuanto|cuanta|cuantos|cuantas|cuando|donde|quien|quienes|hay|teneis|tienen|tienes|haceis|hacen|podeis|podemos|puedo|puedes|sabeis|sabes|sirve|sirven|vale la pena|se puede)\b/;

function looksLikeQuestion(folded: string): boolean {
  return INTERROGATIVE_SHAPE.test(folded);
}

// A bare acknowledgement ("si", "vale", "ok", "no") carries no question of its
// own: it answers whatever the agent just offered. The engine has to tell it
// apart from a real greeting, because answering a "si" with the social greeting
// ignores the lead and resets the conversation. Kept here so the list of
// acknowledgements lives in one place (see SOCIAL_ACK).
export function bareAcknowledgement(input: string): 'yes' | 'no' | null {
  const folded = normalizeEs(input);
  if (!SOCIAL_ACK.test(folded)) return null;
  return folded === 'no' ? 'no' : 'yes';
}

// Resolves a message against the approved FAQ. Returns the entry whose
// keyword appears in the folded message, or null when nothing is approved.
export function findApprovedAnswer(content: ApprovedContent, message: string): FaqEntry | null {
  const folded = normalizeEs(message);
  for (const entry of content.faq) {
    // A specific programme name changes who must answer: the generic "salidas"
    // line is vetoed so the knowledge base can answer about THAT course. The
    // veto is checked first, or first-match-wins would never reach it.
    if (entry.avoidKeywords?.some((keyword) => folded.includes(normalizeEs(keyword)))) continue;
    if (entry.keywords.some((keyword) => folded.includes(normalizeEs(keyword)))) {
      return entry;
    }
  }
  return null;
}

// A message that IS the answer to the agent's pending ask (a bare yes/no) is
// not a query, so the knowledge base must never answer it.
//
// Verified problem: the bare token "paso" matched the passage
// 'kb-metodo-demostracion' (score 4.99) and was answered with the method
// passage when the lead meant "paso de ti" (a decline). "vale", "perfecto",
// "si", "ok", "claro" and "de acuerdo" do not match today, but the same rule
// protects them.
//
// The knowledge base decides WHAT may be answered, not WHETHER the message is
// an answer: a bare yes/no is the answer to a yes/no ask, never a query.
export function isWholeMessageAnswer(folded: string): boolean {
  return (
    matchesWholeMessage(ANSWER_TRIGGERS.affirmative, folded) ||
    matchesWholeMessage(ANSWER_TRIGGERS.negative, folded)
  );
}

// Forbidden-topic ids from the retrieval layer that must intercept BEFORE the
// hand-written FAQ, so the gate applies to every profile, with or without a
// knowledge base. Only "compensation" is gated here: no profile has an
// approved answer for what the lead is paid, so rule 5 must register the doubt
// and propose a human instead of replying with the nearest approved content.
// Internship agreement conditions ("condiciones del convenio") and technical
// requirements are separate topics and stay out of this gate.
export const PROTECTED_TOPIC_IDS: readonly string[] = ['compensation'];

function asksProtectedTopic(folded: string): boolean {
  return FORBIDDEN_TOPIC_PATTERNS.some(
    (entry) => PROTECTED_TOPIC_IDS.includes(entry.id) && entry.pattern.test(folded),
  );
}

// Classification order matters: stop beats everything (rule 7), then the
// confirmed human-handoff request (rule 9), then the forbidden topics, then
// call acceptance (rule 9 — a CONFIRMED one: acceptanceConfirmed rejects a
// bare "no" scoping the phrase, so a negated acceptance such as
// "no me viene bien" falls through to 'unknown' and gets the rule 5 doubt
// reply instead of classifying as 'general', which used to close the deal),
// approved content, soft decline (rule 5 family) and social small talk.
// Anything else is 'unknown' and is handled by rule 5 (register doubt),
// UNLESS the content profile carries a knowledge base and the deterministic
// retrieval layer finds a passage that clears its thresholds (intent 'kb').
export function classify(
  message: string,
  content: ApprovedContent,
  retrievalMode?: RetrievalMode,
): Intent {
  const folded = normalizeEs(message);
  if (INPUT_PATTERNS.stop.test(folded)) return 'stop';
  if (INPUT_PATTERNS.human.test(folded)) return 'human';
  if (INPUT_PATTERNS.price.test(folded)) return 'price';
  if (INPUT_PATTERNS.temario.test(folded)) return 'temario';
  if (INPUT_PATTERNS.financiacion.test(folded)) return 'financiacion';
  if (acceptanceConfirmed(folded)) return 'general';
  // Anaphoric questions like "¿Y esa certificación?" have no antecedent in this
  // turn and should not be answered by a knowledge base passage (it produced a
  // confident false positive in the demo). Route them to the doubt/escalation
  // path unless the profile has an approved FAQ entry that already covers it.
  if (/^(y\s+)?(esa|este|esta|ese|eso|esto|aquel|aquella)\b.*\b(certific|titul|diplom|acredit)/.test(folded)) {
    if (findApprovedAnswer(content, folded)) return 'general';
    return 'unknown';
  }
  // Runs before the FAQ on purpose: a profile WITHOUT a knowledge base would
  // otherwise let an unrelated FAQ keyword answer the question (for example
  // "¿cuánto cobran en las prácticas?" matching the methodology entry).
  // 'unknown' is the existing rule 5 path (register the doubt, propose a
  // human), so no new intent is introduced.
  if (asksProtectedTopic(folded)) return 'unknown';
  // The knowledge base is resolved once and reused below.
  const kbOutcome =
    content.kb !== undefined && content.kb.length > 0 && !isWholeMessageAnswer(folded)
      ? retrieve(content.kb, message, retrievalMode)
      : null;
  // A passage that belongs to a specific programme outranks the generic FAQ,
  // but ONLY when the lead actually named that kind of programme. The generic
  // `informacion` line exists for questions that name NOTHING ("¿en qué
  // consiste?", "¿de qué va el curso?"); when the lead names a course the same
  // shape is asking about THAT course and the base holds the exact passage, so
  // the brief explanation comes from the course and not from the school-wide
  // blurb. The `mentionsProgramme` guard is what keeps "¿de qué trata el de
  // programación?" in the curated catalogue answer: "programación" is a family,
  // not a programme, and without the guard the base answered it with the video
  // games master. Placed after asksProtectedTopic, so price, payment conditions
  // and the other protected topics still escalate (rule 5), and before
  // findApprovedAnswer, which would otherwise take it.
  if (
    mentionsProgramme(folded) &&
    kbOutcome !== null &&
    kbOutcome.match !== null &&
    isProgrammePassage(kbOutcome.match.passage)
  ) {
    return 'kb';
  }
  if (findApprovedAnswer(content, folded)) return 'general';
  if (INPUT_PATTERNS.decline.test(folded)) return 'decline';
  // A positive interest statement is not a question: it advances to the call
  // proposal (approved copy) instead of being registered as a false doubt.
  // Checked AFTER decline, so "no me interesa" never reaches this line.
  if (expressesInterest(folded)) return 'general';
  // A closing remark ("gracias", "muchas gracias", "hasta luego") is social,
  // not an unanswerable question: it must reach the closing template instead of
  // the rule 5 doubt path.
  if (isClosingRemark(folded)) return 'general';
  if (SOCIAL_GREETING.test(folded) || SOCIAL_CHECK_IN.test(folded) || SOCIAL_ACK.test(folded)) {
    return 'general';
  }
  // Knowledge base (Phase 0): the deterministic retrieval layer over the
  // approved knowledge base (src/kb.ts). Its first chance is above, BEFORE the
  // FAQ, and it only takes it when the lead named a programme: there the base
  // answers about that course while the generic FAQ would answer about the
  // school. Here it is consulted LAST, right before the rule-5 fallback, so NO
  // other classification changes: the guarded intents win, the hand-written FAQ
  // keeps priority over the knowledge base for everything that names nothing,
  // and a soft decline or a greeting is never answered from it.
  //
  // Only a profile that HAS a knowledge base can reach this branch
  // (ApprovedContent.kb); without one the behaviour is exactly as before.
  //
  // A whole-message answer to the pending ask is skipped on purpose: it is
  // the lead's ANSWER, not a query, and the knowledge base must not steal it
  // (see isWholeMessageAnswer above). The outcome is the one already computed
  // at the top, so a single retrieval runs per turn.
  if (kbOutcome !== null && kbOutcome.match !== null) return 'kb';
  // A greeting with a neutral preamble ("hola, vi vuestro mensaje") is still
  // social: it must not register a doubt as if the lead had asked something
  // unanswerable. Placed LAST - after every guarded intent, the FAQ and the
  // knowledge base - and restricted to messages that open with a greeting AND
  // carry no question, so "hola, ¿hacéis prácticas?" still falls through to the
  // doubt path when no approved passage clears the retrieval thresholds.
  if (LEADING_GREETING.test(folded) && !looksLikeQuestion(folded)) return 'general';
  return 'unknown';
}
