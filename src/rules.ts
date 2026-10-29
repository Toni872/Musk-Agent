// Safety surface of the MUSK conversational agent, encoded as data plus the
// output guard. This module keeps ONLY what the LLM-driven engine still needs:
// the non-negotiable input triggers (stop, human request, call acceptance,
// phone handover) and the output guard (no prices, amounts, financing
// conditions, syllabus detail, promotions or job promises).
//
// Source of truth: repository AGENTS.md (rules 1-11, confirmed by Nicolas).
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

// ---------------------------------------------------------------------------
// Input triggers (rule 7 stop handling, rule 9 handoff triggers)
// ---------------------------------------------------------------------------

// Rule 7: lead asks to stop -> stop follow-up and register "no continuar".
export const STOP_TRIGGER =
  /\b(?:no me escrib(?:as|ais|is)(?: mas)?|no me (?:mand(?:es|ais|eis)|envi(?:es|eis|ais)) mas|no me llam(?:es|eis|ais)(?: mas)?|no me volv(?:as|ais|is) a (?:escribir|contactar|molestar)|no vuelvas a (?:escribir|contactar)me|(?:deja|para) de escribir(?:me|te|le|nos)?|deja de contactarme|no me contact(?:es|eis|ais)(?: mas)?|no quiero seguir|no deseo seguir|no quiero que me (?:escrib(?:as|ais|is)|contact(?:es|eis|ais)|llam(?:es|eis|ais|en)|molest(?:es|eis|ais))|no quiero(?: recibir)? mas mensajes|no me interesa seguir|no continuar|baja de la lista|para el seguimiento|(?:quita|borra|elimina)me de (?:la|tu) lista|(?:quiero )?darme de baja|date de baja|no me molest(?:es|eis|ais) mas|dejame en paz)\b/;

export const HANDOFF_TRIGGERS = {
  // Rule 9 (confirmed): the lead explicitly asks to talk to a person.
  humanRequested:
    /\b(hablar|contactar|hablas|escribir|decir) con (una |un )?(persona|humano|gente|alguien)\b|\bpersona (real|de verdad)\b|\bhumano de verdad\b|\batencion al cliente\b|\bun asesor\b|\bun comercial\b|\bme atienda (una |un )?(persona|humano)\b/,
  // Rule 9 (confirmed): the lead accepts or agrees to a call.
  callAccepted:
    /\b(acepto|aceptamos|de acuerdo|perfecto|genial|vale)\b[^.?!]{0,60}\bllamad|\b(si|sí)[,.]? ?(me )?(va|viene) bien\b|\bme (va|viene) bien\b|\bcuando (querais|puedais|puedas|os venga bien|te venga bien)\b|\bque me llam(?:e|es|en|eis|ais)\b|\b(?:podeis|puedes|podriais|podrias|puede) llamar(?:me|nos)?\b|\bacuerd\w* (la|una) llamada\b|\bpara (la|una) llamada\b|\bllamad?me\b/,
} as const;

// Answer triggers: how a lead answers a yes/no question about the call.
export const ANSWER_TRIGGERS = {
  affirmative:
    /\b(?:si|sip|claro|vale|ok|okey|perfecto|genial|de acuerdo|por supuesto|desde luego|afirmativo|cuenta con ello)\b$/,
  negative:
    /\b(?:no|nop|paso|nada|mejor no|ahora no|prefiero que no|prefiero no|de momento no|por ahora no|no gracias)\b$/,
  // An explicit moment answers the call proposal with WHEN (an acceptance).
  availability:
    /\b(?:hoy por las? (?:manana|tarde|noche)|manana por las? (?:manana|tarde)|esta (?:manana|tarde|noche)|por las? (?:manana|tarde|noche)s?|por la semana que viene|esta semana|la semana que viene|la proxima semana|pasado manana|manana|mediodia|primera hora|(?:despues|antes) de (?:comer|cenar)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|sobre las (?:\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|a las (?:\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)|cuando (?:querais|puedais|puedas|te venga bien|os venga bien))\b/,
} as const;

// Negation guards: a NEGATED acceptance is a refusal, never a confirmed
// handoff (rule 9). No lookbehind on purpose: the UI bundle targets es2022 and
// Safari 15.4-16.3 parses es2022 but throws on lookbehind at load time.
export const NEGATED_ACCEPTANCE = /(?:^|\s)(?:no|nunca|tampoco|jamas|nada)(?:\s+\w+){0,2}\s+$/;
export const TRAILING_NEGATOR = /(?:^|\s)(?:no|nunca|tampoco|jamas|nada)$/;

export function acceptanceConfirmed(folded: string): boolean {
  const match = HANDOFF_TRIGGERS.callAccepted.exec(folded);
  if (match === null) return false;
  if (NEGATED_ACCEPTANCE.test(folded.slice(0, match.index))) return false;
  return !TRAILING_NEGATOR.test(folded.slice(match.index + match[0].length));
}

// A goodbye must never arrange a call (rule 9).
export const FAREWELL_FRAMES =
  /\b(?:hasta manana|hasta el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|hasta luego|hasta pronto|nos vemos|ya te digo|ya te cuento|adios|chao)\b/;

export function momentConfirmed(folded: string): boolean {
  if (FAREWELL_FRAMES.test(folded)) return false;
  const match = ANSWER_TRIGGERS.availability.exec(folded);
  if (match === null) return false;
  if (NEGATED_ACCEPTANCE.test(folded.slice(0, match.index))) return false;
  return !TRAILING_NEGATOR.test(folded.slice(match.index + match[0].length));
}

// Words that show the lead is HANDING OVER a contact (rule 9).
export const PHONE_CUE =
  /\b(?:mi numero|mi telefono|mi movil|llamame|llamadme|puedes? llamar)\b/;

export function extractSpanishPhone(message: string): string | null {
  const folded = normalizeEs(message);
  const candidate = /(?:^|\D)([679](?:[ .-]?\d){8})(?!\d)/.exec(folded);
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
  // Nothing is guaranteed to a lead: not a job, not an internship placement, not
  // a result.
  { id: 'employment-promise', pattern: /\bgarantiz\w*\b/, rule: 4 },
];

function foldForGuard(reply: string): string {
  return reply
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

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
// Approved reply templates (lead-facing, Spanish es-ES, tuteo). Kept minimal:
// only the deterministic closings the engine sends outside the LLM.
// ---------------------------------------------------------------------------

export const REPLY_TEMPLATES = {
  // Rule 7: stop acknowledgement, registered as "no continuar".
  stop:
    'Entendido, respeto tu decisión: no vuelvo a escribirte. Queda registrado como "no continuar".',
  // Rule 9 (confirmed trigger: lead asks for a person).
  humanRequest:
    'Claro, prefieres hablar con una persona. Dejo anotado y te pongo con el equipo. ¿Me confirmas tu teléfono o el mejor momento para que te contacten?',
  // Rule 9 (confirmed trigger: lead accepts/agrees to a call).
  callAccepted:
    'Perfecto, dejo anotado que te va bien la llamada. El equipo se pone en contacto contigo para acordar el detalle.',
  // Safety fallback when the model produced nothing usable: register the doubt
  // and propose a human (rule 5), never invent an answer.
  doubt:
    'Lo dejo anotado para que una persona del equipo te lo confirme. ¿Te viene bien que te contacten para aclararlo?',
} as const;

export type ReplyTemplateId = keyof typeof REPLY_TEMPLATES;

export function buildReply(id: ReplyTemplateId): string {
  return REPLY_TEMPLATES[id];
}
