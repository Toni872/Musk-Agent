// Deterministic intent classifier for lead messages (Spanish, es-ES).
// Classification is keyword/trigger based and never calls an LLM, which makes
// the mandatory rule tests deterministic and fully offline.

import type { ApprovedContent, FaqEntry } from './content';
import {
  acceptanceConfirmed,
  ANSWER_TRIGGERS,
  HANDOFF_TRIGGERS,
  matchesWholeMessage,
  STOP_TRIGGER,
} from './rules';
import { retrieve } from './retrieval';

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

// Normalization for Spanish es-ES input: lowercase, strip accents, replace
// punctuation with spaces and collapse whitespace. Trigger patterns are
// written accent-free so they can be tested against the folded text.
export function normalizeEs(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"'“”«»[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  financiacion:
    /\bfinancia\w*\b|\bpago (en|a) plazos\b|\bpagar a plazos\b|\bpagar\w* poco a poco\b|\bcuotas?\b|\bmensualidades?\b|\bbecas?\b|\bsubvencion\w*\b|\bprestamos?\b/,
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
const SOCIAL_ACK = /^(ok|vale|perfecto|entendido|genial|claro|si|no)$/;

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
export function classify(message: string, content: ApprovedContent): Intent {
  const folded = normalizeEs(message);
  if (INPUT_PATTERNS.stop.test(folded)) return 'stop';
  if (INPUT_PATTERNS.human.test(folded)) return 'human';
  if (INPUT_PATTERNS.price.test(folded)) return 'price';
  if (INPUT_PATTERNS.temario.test(folded)) return 'temario';
  if (INPUT_PATTERNS.financiacion.test(folded)) return 'financiacion';
  if (acceptanceConfirmed(folded)) return 'general';
  if (findApprovedAnswer(content, folded)) return 'general';
  if (INPUT_PATTERNS.decline.test(folded)) return 'decline';
  if (SOCIAL_GREETING.test(folded) || SOCIAL_ACK.test(folded)) return 'general';
  // Knowledge base (Phase 0): the deterministic retrieval layer over the
  // approved knowledge base (src/kb.ts). It is consulted LAST, right before
  // the rule-5 fallback, so NO existing classification changes: the guarded
  // intents win, the hand-written FAQ keeps priority over the knowledge
  // base, and a soft decline or a greeting is never answered from it.
  //
  // Only a profile that HAS a knowledge base can reach this branch
  // (ApprovedContent.kb); without one the behaviour is exactly as before.
  //
  // A whole-message answer to the pending ask is skipped on purpose: it is
  // the lead's ANSWER, not a query, and the knowledge base must not steal it
  // (see isWholeMessageAnswer above).
  if (content.kb !== undefined && content.kb.length > 0 && !isWholeMessageAnswer(folded)) {
    const outcome = retrieve(content.kb, message);
    if (outcome.match !== null) return 'kb';
  }
  return 'unknown';
}
