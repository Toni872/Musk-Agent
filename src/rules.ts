// Hard rules of the MUSK MVP conversational agent, encoded as data plus the
// approved reply templates and output guards.
// Source of truth: repository AGENTS.md (rules 1-11, confirmed by Nicolas).
//
// Reply templates are lead-facing strings: Spanish (es-ES), tuteo.
// Trigger patterns are tested against folded text (lowercase, accents stripped),
// so they must be written without accented characters.

export interface RuleDefinition {
  id: number;
  label: string;
  summary: string;
}

export const RULES: RuleDefinition[] = [
  { id: 1, label: 'no-prices', summary: 'Never communicate prices or amounts; reply with the approved response and invite to the call.' },
  { id: 2, label: 'no-detailed-syllabus', summary: 'Never communicate a detailed syllabus; general content, skills and outcomes are allowed.' },
  { id: 3, label: 'financing-generic', summary: 'Financing: only state that options exist and refer to the call; never give conditions.' },
  { id: 4, label: 'approved-content-only', summary: 'Reply only with MUSK-approved information; never invent conditions, promotions, guarantees or job promises.' },
  { id: 5, label: 'register-doubt', summary: 'No approved answer: register the doubt and propose human contact.' },
  { id: 6, label: 'no-unapproved-offer', summary: 'No offer for no-compradores without a message previously approved by Nicolas; asking about price never authorizes amounts.' },
  { id: 7, label: 'respect-stop', summary: 'If the lead asks to stop, stop the follow-up and register "no continuar".' },
  { id: 8, label: 'no-artificial-pressure', summary: 'No artificial pressure; never promise attention beyond what MUSK can actually serve.' },
  { id: 9, label: 'confirmed-handoff-triggers', summary: 'Confirmed handoff triggers: the lead asks for a person, or accepts/agrees to a call; other escalations are proposals.' },
  { id: 10, label: 'guides-are-not-sendable', summary: 'A guide used as a knowledge source does not authorize sending it whole; exclude any syllabus section.' },
  { id: 11, label: 'no-autonomous-learning', summary: 'No autonomous learning of business policies; new answers are reviewed before entering approved content.' },
];

// Topics the agent must never produce, as data (used by docs/tests, mirrored
// by FORBIDDEN_OUTPUT_PATTERNS below).
export const FORBIDDEN_TOPICS = [
  { id: 'price', rules: [1, 6], description: 'Prices, amounts or fees of any kind.' },
  { id: 'detailed_syllabus', rules: [2, 10], description: 'Module-by-module or week-by-week syllabus detail.' },
  { id: 'financing_conditions', rules: [3], description: 'Financing conditions, percentages or installment figures.' },
  { id: 'invented_promises', rules: [4], description: 'Invented promotions, guarantees or job promises.' },
] as const;

// ---------------------------------------------------------------------------
// Input triggers (rule 7 stop handling, rule 9 handoff triggers)
// ---------------------------------------------------------------------------

// Rule 7: lead asks to stop -> stop follow-up and register "no continuar".
// Precision notes:
//  - Covers both tuteo and vosotros imperative forms ("no me escribas" /
//    "no me escribáis"), and verbs that accept a trailing pronoun
//    ("escribir" -> "escribirme/te/le/nos"); a bare hard word boundary would
//    otherwise let "deja de escribirme" slip past stop detection.
//  - "no me (mandes|mandáis|envíes|enviéis)" requires a following "más":
//    "no me mandes el temario" is a syllabus request, not a stop.
//  - Deliberately NOT treated as stop: a bare "no me interesa" or a time
//    objection ("no tengo tiempo") can be an objection rather than a request to
//    stop. Decision (2026-10-12): a plain "no me interesa" stays in the rule 5
//    doubt family as the dedicated 'decline' intent (copy in
//    REPLY_TEMPLATES.decline), never a stop.
export const STOP_TRIGGER =
  /\b(?:no me escrib(?:as|ais|is)(?: mas)?|no me (?:mand(?:es|ais|eis)|envi(?:es|eis|ais)) mas|no me llam(?:es|eis|ais)(?: mas)?|no me volv(?:as|ais|is) a (?:escribir|contactar|molestar)|no vuelvas a (?:escribir|contactar)me|(?:deja|para) de escribir(?:me|te|le|nos)?|deja de contactarme|no me contact(?:es|eis|ais)(?: mas)?|no quiero seguir|no deseo seguir|no quiero que me (?:escrib(?:as|ais|is)|contact(?:es|eis|ais)|llam(?:es|eis|ais|en)|molest(?:es|eis|ais))|no quiero(?: recibir)? mas mensajes|no me interesa seguir|no continuar|baja de la lista|para el seguimiento|(?:quita|borra|elimina)me de (?:la|tu) lista|(?:quiero )?darme de baja|date de baja|no me molest(?:es|eis|ais) mas|dejame en paz)\b/;

export const HANDOFF_TRIGGERS = {
  // Rule 9 (confirmed): the lead explicitly asks to talk to a person.
  humanRequested:
    /\b(hablar|contactar|hablas|escribir|decir) con (una |un )?(persona|humano|gente|alguien)\b|\bpersona (real|de verdad)\b|\bhumano de verdad\b|\batencion al cliente\b|\bun asesor\b|\bun comercial\b|\bme atienda (una |un )?(persona|humano)\b/,
  // Rule 9 (confirmed): the lead accepts or agrees to a call.
  callAccepted:
    /\b(acepto|aceptamos|de acuerdo|perfecto|genial|vale)\b[^.?!]{0,60}\bllamad|\b(si|sí)[,.]? ?(me )?(va|viene) bien\b|\bme (va|viene) bien\b|\bcuando (querais|puedais|os venga bien|te venga bien)\b|\bque me (llamen|llame)\b|\bacuerd\w* (la|una) llamada\b|\bpara (la|una) llamada\b/,
} as const;

// ---------------------------------------------------------------------------
// Answer triggers (a reply to the agent's own ask, as opposed to a new message)
// ---------------------------------------------------------------------------

// The ask these belong to is the call proposal, a yes/no question of the flow.
// Asked as it was, "si" answers THE QUESTION — it is not a fresh greeting, and
// rule 9 counts it as the lead confirming the call: the handoff trigger was
// built for a lead stating acceptance unprompted ("me va bien", "cuando
// querais" ...), which a one-word "si" never matches.
export const ANSWER_TRIGGERS = {
  affirmative:
    /\b(?:si|sip|claro|vale|ok|okey|perfecto|genial|de acuerdo|por supuesto|desde luego|afirmativo|cuenta con ello)\b$/,
  // A "no" to the call is a rejection of the CALL, not a request to stop
  // (rule 7): the copy stays in the rule 5 family and applies no pressure
  // (rule 8). Whole-message match on purpose: "no entiendo" is not a refusal.
  negative:
    /\b(?:no|nop|paso|nada|mejor no|ahora no|prefiero que no|prefiero no|de momento no|por ahora no|no gracias)\b$/,
} as const;

// ---------------------------------------------------------------------------
// Output guard (rules 1-4, 6): validates any reply before it reaches the lead
// ---------------------------------------------------------------------------

export interface GuardViolation {
  id: string;
  rule: number;
}

export interface GuardResult {
  ok: boolean;
  violations: GuardViolation[];
}

export const FORBIDDEN_OUTPUT_PATTERNS: { id: string; pattern: RegExp; rule: number }[] = [
  { id: 'currency-symbol', pattern: /€/, rule: 1 },
  { id: 'currency-word', pattern: /\beuros?\b/, rule: 1 },
  { id: 'amount-with-currency', pattern: /\b\d+(?:[.,]\d+)?\s*(?:€|eur)\b/, rule: 1 },
  { id: 'percentage-condition', pattern: /\b\d+(?:[.,]\d+)?\s*%/, rule: 3 },
  { id: 'financing-condition', pattern: /\b(sin intereses|interes cero|cuotas fijas|aplazado sin coste)\b/, rule: 3 },
  { id: 'detailed-syllabus-item', pattern: /\b(?:modulo|unidad|tema|semana|leccion)\s+\d+\b/, rule: 2 },
  { id: 'unapproved-promotion', pattern: /\b(promocion\w*|descuento\w*|2x1|oferta especial|precio cerrado)\b/, rule: 4 },
  { id: 'employment-promise', pattern: /\b(garantizamos|empleo garantizado|trabajo garantizado|plaza garantizada)\b/, rule: 4 },
];

function foldForGuard(reply: string): string {
  return reply
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// Checks a candidate reply against the forbidden output patterns. Returns the
// list of violations; the caller falls back to the registered-doubt reply
// (rule 5) when the list is not empty.
export function guardReply(reply: string): GuardResult {
  const folded = foldForGuard(reply);
  const violations: GuardViolation[] = [];
  for (const entry of FORBIDDEN_OUTPUT_PATTERNS) {
    if (entry.pattern.test(folded)) {
      violations.push({ id: entry.id, rule: entry.rule });
    }
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Approved reply templates (lead-facing, Spanish es-ES, tuteo)
// ---------------------------------------------------------------------------

// Already-approved invitation to the call, reused VERBATIM in two places: the
// tail of the price answer and the closing of the qualification. One constant,
// so the approved sentence cannot drift between the two.
const CALL_INVITATION =
  '¿Me dejas tu contacto o un momento en el que te venga bien que te llamen?';

export const REPLY_TEMPLATES = {
  // Rule 1: approved response + invitation to the call. No amounts, no digits.
  price: `No puedo compartir el precio ni los importes por aquí. Lo conversamos con detalle en una llamada con el equipo y te resolvemos todas las dudas. ${CALL_INVITATION}`,
  // Rule 2: no detailed syllabus; general content and call redirect only.
  syllabus:
    'No puedo enviarte el temario detallado por aquí. Sí te puedo contar el contenido general: las habilidades que trabajas, lo que aprendes y las salidas profesionales. Si te encaja, lo vemos con más detalle en una llamada.',
  // Rule 3: options exist, refer to the call, no conditions, no amounts.
  financing:
    'Sí, existen opciones de financiación. No puedo darte condiciones ni importes por aquí: el equipo te lo explica con detalle en una llamada y resolvemos todas tus dudas.',
  // Rule 5: register the doubt and propose human contact. Never invents an answer.
  doubt:
    'Buena pregunta. No tengo una respuesta aprobada sobre eso, así que lo dejo anotado como duda para que una persona del equipo te lo confirme. ¿Te viene bien que te contacten para aclararlo?',
  // Rule 5 (soft decline): a bare "no me interesa" is neither a stop (rule 7)
  // nor a confirmed handoff (rule 9). Acknowledge without pressure (rule 8),
  // register the signal, and leave the door open to a human — never push a call.
  decline:
    'Entendido, lo respeto. Si en algún momento quieres retomarlo, tienes una duda o prefieres hablar con una persona del equipo, aquí estoy.',
  // Rule 9 (confirmed trigger: lead asks for a person).
  humanRequest:
    'Claro, prefieres hablar con una persona. Dejo anotado y te pongo con el equipo. ¿Me confirmas tu teléfono o el mejor momento para que te contacten?',
  // Rule 9 (confirmed trigger: lead accepts/agrees to a call).
  callAccepted:
    'Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle.',
  // Closing of the brief qualification: with no question left, the agent is the
  // one who proposes the call (AGENTS.md flow). It reuses the wording already
  // approved for the price answer, so no NEW lead-facing copy is phrased here
  // (rule 11) — it is the very sentence the lead can already receive.
  callProposal: CALL_INVITATION,
  // Rule 7: stop acknowledgement, registered as "no continuar".
  stop:
    'Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar".',
  // Social/small talk fallback (general intent without an approved FAQ match).
  social:
    '¡Hola! Soy el asistente de MUSK. ¿En qué puedo ayudarte? Si prefieres, puedes hablar con una persona del equipo cuando quieras.',
} as const;

export type ReplyTemplateId = keyof typeof REPLY_TEMPLATES;

export function buildReply(id: ReplyTemplateId): string {
  return REPLY_TEMPLATES[id];
}
