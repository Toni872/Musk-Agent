// Hard rules of the MUSK MVP conversational agent, encoded as data plus the
// approved reply templates and output guards.
// Source of truth: repository AGENTS.md (rules 1-11, confirmed by Nicolas).
//
// Reply templates are lead-facing strings: Spanish (es-ES), tuteo.
// Trigger patterns are tested against folded text (lowercase, accents stripped),
// so they must be written without accented characters.

import { normalizeEs } from './text';

export interface RuleDefinition {
  id: number;
  label: string;
  summary: string;
}

export const RULES: RuleDefinition[] = [
  { id: 1, label: 'no-prices', summary: 'Never communicate prices or amounts; reply with the approved response and invite to the call.' },
  { id: 2, label: 'no-detailed-syllabus', summary: 'Never communicate a detailed syllabus; general content, skills and outcomes are allowed.' },
  { id: 3, label: 'financing-generic', summary: 'May state that financing options exist and the formation can be completed flexibly over two years; never give prices, amounts, interest, instalment terms or other unapproved payment conditions.' },
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
  { id: 'financing_conditions', rules: [3], description: 'Unapproved financing conditions, interest, percentages or installment terms.' },
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
  // F3 additions (rule 9): "cuando puedas" is the tuteo form of the already
  // covered "cuando querais/puedais" and was in NEITHER this trigger nor
  // ANSWER_TRIGGERS.availability; a lead asking to be called IS an acceptance
  // ("llamame"/"llamadme"). "no me llames" cannot match the latter — "llames"
  // is a different word — and STOP_TRIGGER (rule 7) wins in classify() anyway.
  callAccepted:
    /\b(acepto|aceptamos|de acuerdo|perfecto|genial|vale)\b[^.?!]{0,60}\bllamad|\b(si|sí)[,.]? ?(me )?(va|viene) bien\b|\bme (va|viene) bien\b|\bcuando (querais|puedais|puedas|os venga bien|te venga bien)\b|\bque me (llamen|llame)\b|\bacuerd\w* (la|una) llamada\b|\bpara (la|una) llamada\b|\bllamad?me\b/,
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
  // Explicit "cannot / not a good moment" (rule 9). Evaluated BEFORE
  // availability, so "no puedo por la tarde" — which names a moment — never
  // closes the deal: acceptance must be CONFIRMED, not inferred.
  nonAvailability:
    /\b(?:no puedo|no puedo hablar|no me viene bien|no me va bien|imposible|no es buen momento|mejor otro dia|otro momento|ahora no puedo)\b/,
  // An explicit moment answers the call proposal with WHEN, which is an
  // acceptance (rule 9): the lead is arranging the call, not refusing it.
  // Most alternatives need an availability context ("por", "esta", "el lunes",
  // "a las ...") so that a bare greeting is NOT a moment: "buenas tardes" alone
  // never matches. Bare "manana" IS accepted, because it is a WHEN and not a
  // greeting — in Spanish the greeting form is "buenas tardes"/"buenos dias",
  // never "mañana" — but it is also half of the farewell "hasta manana", so
  // momentConfirmed blocks every farewell frame (see FAREWELL_FRAMES below).
  // Anything ambiguous ("lo antes posible", "depende") matches nothing here and
  // stays in the rule 5 doubt family.
  availability:
    /\b(?:hoy por las? (?:manana|tarde|noche)|manana por las? (?:manana|tarde)|esta (?:manana|tarde|noche)|por las? (?:manana|tarde|noche)s?|por la semana que viene|esta semana|la semana que viene|la proxima semana|pasado manana|manana|mediodia|primera hora|(?:despues|antes) de (?:comer|cenar)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|sobre las (?:\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|a las (?:\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|cuando (?:querais|puedais|puedas|te venga bien|os venga bien))\b/,
} as const;

// Whole-message match for a trigger: the trigger must cover the ENTIRE folded
// message, not just its tail.
//
// The answer triggers above are written with a trailing `$` on purpose: they
// answer "does the message END with an acceptance/refusal?". That is the right
// question for a call answer ("vale, hasta luego" is an acceptance). It is the
// WRONG question for deciding whether a message IS an answer to the agent's
// pending ask, because there a bare token inside a longer message ("quiero
// saber si...") is not an answer at all.
//
// So the whole-message predicate is explicit: the match must start at the
// beginning and cover the full folded text. Used by the knowledge base gate
// (src/intent.ts) and by the reception path (src/agent.ts), so both agree on
// what "a bare yes/no" means.
export function matchesWholeMessage(trigger: RegExp, folded: string): boolean {
  const match = trigger.exec(folded);
  if (match === null) return false;
  return match.index === 0 && match[0].length === folded.length;
}

// ---------------------------------------------------------------------------
// Negation guard for a CONFIRMED acceptance (rule 9)
// ---------------------------------------------------------------------------

// Rule 9: a NEGATED acceptance is a REFUSAL, never a confirmed trigger. Before
// this guard existed, "no me viene bien" matched HANDOFF_TRIGGERS.callAccepted
// through "me viene bien", classify() returned 'general', and the fresh-message
// path closed the deal with the callAccepted copy: a lead who had just said
// the call does NOT suit them was told "Perfecto, dejo anotado que te va bien
// la llamada" and the conversation closed as call_accepted.
//
// Negators recognised: `no`, `nunca`, `tampoco`, `jamas` (folded form —
// normalizeEs strips the accent) and `nada` (which also covers "para nada me
// viene bien"). These are the negators that actually negate a Spanish
// acceptance; while only `no` was recognised, "nunca me viene bien" still
// closed the deal as call_accepted.
//
// One narrow guard, NOT a general negation engine. It matches the TAIL of the
// text PRECEDING a trigger match (the predicates below slice that prefix for
// you — testing this regex against a whole message is meaningless): the prefix
// must END in a bare negator, optionally followed by up to two filler words
// before the trigger ("no, mejor a las seis" folds to "no mejor a las seis").
// That is the folded-text proxy for "a bare negator scoping the phrase within
// the same sentence": normalizeEs turns sentence punctuation into spaces, so
// distance is what is left to scope with.
// ACCEPTED TRADE-OFF, measured not assumed: the two-filler window also
// swallows a negator that belongs to an idiom rather than to the trigger, so
// "no hay problema, me va bien" and "no sé, me viene bien" read as NEGATED and
// fall to the rule 5 doubt path instead of closing. That is a false negative
// on a real acceptance: the lead loses one smooth step and the agent goes on
// to offer a human contact. It is the price of never closing on a refusal
// (rule 9), and tightening it would need real clause scoping that the folded
// text no longer carries — normalizeEs erases the punctuation. When in doubt
// we do NOT close. Widening the negator set (nunca/tampoco/jamas/nada) widens
// exactly this false-negative set — the safe direction: rule 9 needs a
// CONFIRMED acceptance, and the doubt path registers and offers a human.
// No lookbehind on purpose: the UI bundle targets es2022 and Safari 15.4-16.3
// parses es2022 but throws on lookbehind assertions at load time, which would
// take the whole page down for one guard (see extractSpanishPhone).
export const NEGATED_ACCEPTANCE = /(?:^|\s)(?:no|nunca|tampoco|jamas|nada)(?:\s+\w+){0,2}\s+$/;

// The mirror image, same class, one extra narrow check: the guard above only
// sees the text BEFORE a trigger match, so a bare negator at the very END of
// the message used to slip through and close the deal ("me viene bien, no").
// Applied to the text AFTER the trigger match, from the SAME negator list.
// Deliberately NO filler-word allowance: only a BARE trailing negator blocks,
// so "sí, me viene bien, no hay problema" still closes (the trailing "no hay
// problema" is not a bare negator) while "me viene bien pero no" does not.
// That is the only trailing case that blocks — a bare trailing negator.
// No lookbehind, same es2022/Safari 15.4-16.3 constraint as the guard above.
export const TRAILING_NEGATOR = /(?:^|\s)(?:no|nunca|tampoco|jamas|nada)$/;

// The ONE predicate for "did the lead CONFIRM the call acceptance?": the
// acceptance trigger must match AND the negation guard must not scope it —
// neither before the trigger (NEGATED_ACCEPTANCE) nor trailing the whole
// message (TRAILING_NEGATOR).
// Used at every place that decides a confirmed acceptance (the fresh-message
// 'general' branch and isReceivableAnswer in agent.ts, classify() in
// intent.ts, and eval.ts's routing mirror), so a negated acceptance can never
// close the deal from any of them.
export function acceptanceConfirmed(folded: string): boolean {
  const match = HANDOFF_TRIGGERS.callAccepted.exec(folded);
  if (match === null) return false;
  if (NEGATED_ACCEPTANCE.test(folded.slice(0, match.index))) return false;
  return !TRAILING_NEGATOR.test(folded.slice(match.index + match[0].length));
}

// F2 — a moment carrying a negation that scopes it must NOT close the handoff.
// A predicate over ANSWER_TRIGGERS.availability plus the same
// NEGATED_ACCEPTANCE guard, instead of a second regex re-listing the moments:
// a duplicated moment list would silently drift from `availability` and fail
// in the UNSAFE direction (a negated moment closing the deal again).
//
// DECISION (supersedes the earlier "no, mejor a las seis closes"): when in
// doubt we do NOT close. "Perfecto, dejo anotado que te va bien la llamada"
// promises a real person a call, and wrongly promising that call breaks
// rule 9 (the trigger counts a CONFIRMED acceptance only), whereas the doubt
// path registers the doubt and offers a human contact — which is the
// product's actual goal: the close is always human (AGENTS.md objective).
// Both guards apply here too (prefix negator AND bare trailing negator), so
// the two predicates cannot drift: "nunca por las tardes" and "por las
// tardes, no" both stay in the doubt path.
// Bare "manana" answers "when" (above) but it is also half of the farewell
// "hasta manana" — and "hasta el lunes" is the same trap one line down, where
// the farewell collides with the day-name alternative that IS an acceptance. A
// goodbye must NEVER arrange a call, so any farewell frame blocks the moment
// outright. The boundary is deliberate: "el lunes" (a day answer) still closes,
// "hasta el lunes" (a goodbye) does not. The false negative lands in the safe
// direction — a goodbye that really meant "call me tomorrow" falls to the rule
// 5 doubt path, where the agent registers the doubt and offers a human — while
// a goodbye never promises a call nobody agreed to (rule 9). Same
// es2022/Safari 15.4-16.3 constraint as the guards above: no lookbehind.
export const FAREWELL_FRAMES =
  /\b(?:hasta manana|hasta el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|hasta luego|hasta pronto|nos vemos|ya te digo|ya te cuento|adios|chao)\b/;

export function momentConfirmed(folded: string): boolean {
  if (FAREWELL_FRAMES.test(folded)) return false;
  const match = ANSWER_TRIGGERS.availability.exec(folded);
  if (match === null) return false;
  if (NEGATED_ACCEPTANCE.test(folded.slice(0, match.index))) return false;
  return !TRAILING_NEGATOR.test(folded.slice(match.index + match[0].length));
}

// Words that show the lead is HANDING OVER a contact (rule 9: the contact is
// what the call needs, so handing it over accepts the call). "te dejo mi
// numero" / "te paso mi numero" are subsumed by "mi numero"; "puedes llamar" /
// "puede llamar" compact to "puedes? llamar".
export const PHONE_CUE =
  /\b(?:mi numero|mi telefono|mi movil|llamame|llamadme|puedes? llamar)\b/;

// Extracts a Spanish mobile number the lead deliberately handed over, or null
// (rule 9: only a CONFIRMED acceptance closes; ambiguous input stays in the
// rule 5 doubt family). Precision over recall:
//  - the candidate is EXACTLY 9 digits starting with 6/7/9, joined only by
//    single spaces/dots/dashes, and not part of a longer digit run (the
//    prefix and lookahead guards) — so "34612345678" (country code glued on) never
//    matches, while "612 345 678" and "612.345.678" do;
//  - it closes the deal only when the lead clearly hands it over: a PHONE_CUE
//    in the message, or the whole message being nothing but the number
//    (optionally preceded by "+34"/"0034" — a bare "34" prefix is NOT
//    stripped, which is why "34612345678" alone returns null);
//  - separators are never joined ACROSS other characters, so a date soup like
//    "el 12/03/2027 y el 15/06/2027" yields no candidate at all.
export function extractSpanishPhone(message: string): string | null {
  const folded = normalizeEs(message);
  // No lookbehind on purpose: the UI bundle targets es2022, and Safari 15.4-16.3
  // parses es2022 but throws on (?<!...) at load time, which would take the whole
  // page down for one guard. "(?:^|\D)" is the equivalent prefix check.
  const candidate = /(?:^|\D)([679](?:[ .-]?\d){8})(?!\d)/.exec(folded);
  // Capture group 1 is part of the pattern, so it is present whenever the
  // regex matches; the guard only exists to satisfy noUncheckedIndexedAccess.
  const digits = candidate?.[1];
  if (digits !== undefined && PHONE_CUE.test(folded)) {
    return digits.replace(/[ .-]/g, '');
  }
  const whole = folded.replace(/[ .-]/g, '');
  if (/^(?:\+34|0034)?[679]\d{8}$/.test(whole)) {
    return whole.replace(/^(?:\+34|0034)/, '');
  }
  return null;
}

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
