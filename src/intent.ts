// Deterministic intent classifier for lead messages (Spanish, es-ES).
// Classification is keyword/trigger based and never calls an LLM, which makes
// the mandatory rule tests deterministic and fully offline.

import type { ApprovedContent, FaqEntry } from './content';
import { HANDOFF_TRIGGERS, STOP_TRIGGER } from './rules';

export type Intent = 'price' | 'temario' | 'financiacion' | 'unknown' | 'human' | 'stop' | 'decline' | 'general';

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
export const INPUT_PATTERNS: Record<Exclude<Intent, 'general' | 'unknown'>, RegExp> = {
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
  financiacion:
    /\bfinanciacion\b|\bfinanciar\b|\bfinanciamiento\b|\bpago (en|a) plazos\b|\bpagar a plazos\b|\bpagar\w* poco a poco\b|\bcuotas?\b|\bmensualidades?\b|\bbecas?\b|\bsubvencion\w*\b|\bprestamos?\b/,
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

// Classification order matters: stop beats everything (rule 7), then the
// confirmed human-handoff request (rule 9), then the forbidden topics, then
// call acceptance (rule 9), approved content, soft decline (rule 5 family) and
// social small talk. Anything else is 'unknown' and is handled by rule 5
// (register doubt).
export function classify(message: string, content: ApprovedContent): Intent {
  const folded = normalizeEs(message);
  if (INPUT_PATTERNS.stop.test(folded)) return 'stop';
  if (INPUT_PATTERNS.human.test(folded)) return 'human';
  if (INPUT_PATTERNS.price.test(folded)) return 'price';
  if (INPUT_PATTERNS.temario.test(folded)) return 'temario';
  if (INPUT_PATTERNS.financiacion.test(folded)) return 'financiacion';
  if (HANDOFF_TRIGGERS.callAccepted.test(folded)) return 'general';
  if (findApprovedAnswer(content, folded)) return 'general';
  if (INPUT_PATTERNS.decline.test(folded)) return 'decline';
  if (SOCIAL_GREETING.test(folded) || SOCIAL_ACK.test(folded)) return 'general';
  return 'unknown';
}
