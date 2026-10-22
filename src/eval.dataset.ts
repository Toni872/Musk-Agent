// Labelled evaluation dataset for the MUSK retrieval loop ("bucle de
// evaluación"): 43 (lead question -> expected approved answer) cases.
//
// The gold labels below are derived from MUSK's hard rules (AGENTS.md),
// NOT from what the code currently does. A disagreement between a label and
// the current routing is a MEASUREMENT (the point of the harness), never a
// reason to change the label. Group B paraphrases deliberately use wording
// with no current keyword match to expose retrieval gaps.
//
// Data only: importing this module has no side effects.

import type { Intent } from './intent';
import { KB_PASSAGES } from './kb';

export interface EvalCase {
  id: string; // 'C01', 'C02', ... stable, in array order
  question: string; // the lead's message, verbatim
  expectedAnswerId: string | null; // a FaqEntry.id, or null = no approved FAQ answer may be returned
  expectedIntent: Intent; // the correct classify() result
  note: string; // WHY this expectation is the correct behaviour, citing the rule
}

export const EVAL_CASES: EvalCase[] = [
  // ---------------------------------------------------------------------------
  // Group A — direct keyword hits (should pass today)
  // ---------------------------------------------------------------------------
  {
    id: 'C01',
    question: '¿qué es MUSK?',
    expectedAnswerId: 'sobre-musk',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("que es musk"); rule 4 allows the safe identity+formation answer while companyPresentation is a pending decision.',
  },
  {
    id: 'C02',
    question: '¿quiénes sois?',
    expectedAnswerId: 'sobre-musk',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("quienes sois") on the sobre-musk entry.',
  },
  {
    id: 'C03',
    question: '¿quién está detrás de esto?',
    expectedAnswerId: 'sobre-musk',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("quien esta detras") on the sobre-musk entry.',
  },
  {
    id: 'C04',
    question: '¿cómo son las clases?',
    expectedAnswerId: 'metodologia',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("como son las clases"); metodologia is ordered before modalidad so class questions never fall into the broader modality entry.',
  },
  {
    id: 'C05',
    question: '¿cómo funciona la metodología?',
    expectedAnswerId: 'metodologia',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("metodologia" / "como funciona") on the metodologia entry.',
  },
  {
    id: 'C06',
    question: '¿hay prácticas en empresa?',
    expectedAnswerId: 'metodologia',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("practicas"); rule 2 allows general methodology content.',
  },
  {
    id: 'C07',
    question: '¿me contáis los requisitos?',
    expectedAnswerId: 'requisitos',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("requisitos") on the requisitos entry.',
  },
  {
    id: 'C08',
    question: '¿necesito experiencia previa?',
    expectedAnswerId: 'requisitos',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("experiencia previa"); the approved answer ("no necesitas conocimientos previos") is the correct reply.',
  },
  {
    id: 'C09',
    question: '¿cuántas tutorías hay al mes?',
    expectedAnswerId: 'acompanamiento',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("tutorias") on the acompanamiento entry.',
  },
  {
    id: 'C10',
    question: '¿tendré un tutor que me ayude?',
    expectedAnswerId: 'acompanamiento',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("tutor") on the acompanamiento entry.',
  },
  {
    id: 'C11',
    question: '¿qué salidas tiene?',
    expectedAnswerId: 'salidas',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("salidas"); rule 2 allows outcomes and rule 4 forbids promising employment, which the answer respects.',
  },
  {
    id: 'C12',
    question: '¿qué voy a aprender?',
    expectedAnswerId: 'contenido',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("que voy a aprender"); rule 2 allows the approved general skills list.',
  },
  {
    id: 'C13',
    question: '¿de qué va el curso?',
    expectedAnswerId: 'informacion',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("de que va") on the broad informacion entry, deliberately last in the FAQ order.',
  },
  {
    id: 'C14',
    question: 'quiero más información',
    expectedAnswerId: 'informacion',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("informacion"); the broadest entry routes to the approved general description.',
  },
  {
    id: 'C15',
    question: '¿en qué consiste?',
    expectedAnswerId: 'informacion',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("en que consiste") on the informacion entry.',
  },
  {
    id: 'C16',
    question: '¿cuánto dura el curso?',
    expectedAnswerId: 'duracion',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("cuanto dura"); NOT a price question (rule 1) because no amount is asked; the answer stays digit-free while no duration is approved.',
  },
  {
    id: 'C17',
    question: '¿es online o presencial?',
    expectedAnswerId: 'modalidad',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("online" / "presencial") on the modalidad entry.',
  },
  {
    id: 'C18',
    question: '¿qué horarios tenéis?',
    expectedAnswerId: 'modalidad',
    expectedIntent: 'general',
    note: 'Direct keyword hit ("horario") on the modalidad entry; schedule details are deferred to the call.',
  },

  // ---------------------------------------------------------------------------
  // Group B — paraphrases. Same meaning as an approved answer, none of the
  // current keywords. Expect several to fail today; that is the point.
  // ---------------------------------------------------------------------------
  {
    id: 'C19',
    question: '¿puedo hacerlo sin tener ni idea de programar?',
    expectedAnswerId: 'requisitos',
    expectedIntent: 'general',
    note: 'Same meaning as C08 (no prior knowledge needed) but no requisitos keyword matches this phrasing today; the approved "no necesitas conocimientos previos" answer is still the correct reply.',
  },
  {
    id: 'C20',
    question: '¿hay que saber programar antes?',
    expectedAnswerId: 'requisitos',
    expectedIntent: 'general',
    note: 'Same meaning as C07/C08 but "saber programar antes" matches no requisitos keyword today; rule 4 requires the approved answer, not an invented one.',
  },
  {
    id: 'C21',
    question: '¿es muy teórico o más bien práctico?',
    expectedAnswerId: 'metodologia',
    expectedIntent: 'general',
    note: 'Same meaning as C04/C05 (practical methodology) but "practico/teorico" does not match any metodologia keyword today ("practicas" needs the noun).',
  },
  {
    id: 'C22',
    question: '¿en qué puedo trabajar después?',
    expectedAnswerId: 'salidas',
    expectedIntent: 'general',
    note: 'Same meaning as C11 but the salidas keyword is "de que puedo trabajar" and the missing "de" makes this phrasing miss today; rule 4: outcomes are approved, employment is never promised.',
  },

  // Financing paraphrases: reflexive/enclitic/infinitive forms the old
  // `\bfinanciar\b` alternative missed. They belong to group B (paraphrases),
  // so they sit inside the group B block: ONE group, ONE contiguous block of
  // cases in the report. Their ids stay stable and are never renumbered.
  {
    id: 'C41',
    question: '¿los cursos pueden financiarse?',
    expectedAnswerId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: reflexive form, regression coverage for the \\bfinanciar\\b gap; only "options exist" + refer to the call, never conditions and never an FAQ answer.',
  },
  {
    id: 'C42',
    question: '¿puedo financiarlo?',
    expectedAnswerId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: enclitic pronoun form; generic options reply, no conditions, no FAQ answer.',
  },
  {
    id: 'C43',
    question: '¿se puede financiar el curso?',
    expectedAnswerId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: infinitive form; generic options reply, no conditions, no FAQ answer.',
  },

  // ---------------------------------------------------------------------------
  // Group C — forbidden topics. Must NEVER return an approved FAQ answer
  // (rules 1, 2, 3): classify() intercepts before the FAQ is consulted.
  // ---------------------------------------------------------------------------
  {
    id: 'C23',
    question: '¿cuánto cuesta el curso?',
    expectedAnswerId: null,
    expectedIntent: 'price',
    note: 'Rule 1: price questions get the approved price reply + call invitation; no FAQ answer may be returned.',
  },
  {
    id: 'C24',
    question: '¿qué precio tiene?',
    expectedAnswerId: null,
    expectedIntent: 'price',
    note: 'Rule 1: same as C23 for the noun "precio"; forbidden topics are classified before the FAQ.',
  },
  {
    id: 'C25',
    question: 'es muy caro para mí',
    expectedAnswerId: null,
    expectedIntent: 'price',
    note: 'Rule 1: a money objection ("caro") is price intent even without the word "precio"; no FAQ answer, no amounts.',
  },
  {
    id: 'C26',
    question: 'quiero información sobre los precios',
    expectedAnswerId: null,
    expectedIntent: 'price',
    note: 'Rule 1: the word "informacion" must not let the broad FAQ entry steal a price question — forbidden topics are classified before the FAQ is consulted.',
  },
  {
    id: 'C27',
    question: '¿me lo puedo pagar a plazos?',
    expectedAnswerId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: installments are financing; only "options exist" + refer to the call, never conditions and never an FAQ answer.',
  },
  {
    id: 'C28',
    question: '¿hay becas disponibles?',
    expectedAnswerId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: scholarships are financing; generic options reply, no conditions, no FAQ answer.',
  },
  {
    id: 'C29',
    question: '¿me das el temario completo?',
    expectedAnswerId: null,
    expectedIntent: 'temario',
    note: 'Rule 2: the detailed syllabus is never sent; no FAQ keyword may answer it.',
  },
  {
    id: 'C30',
    question: '¿qué módulos tiene?',
    expectedAnswerId: null,
    expectedIntent: 'temario',
    note: 'Rule 2 boundary: "modulos" is syllabus detail, not the approved general content; the temario reply + call redirect applies.',
  },
  {
    id: 'C31',
    question: '¿qué se estudia en el curso?',
    expectedAnswerId: null,
    expectedIntent: 'temario',
    note: 'Rule 2 boundary: deliberately the temario reply, not the contenido FAQ — general skills are allowed only via the approved "que aprendo" route, and "que se estudia" asks for the syllabus.',
  },

  // ---------------------------------------------------------------------------
  // Group D — no approved answer exists (rule 5: register the doubt and offer
  // a human). The expectedIntent names the rule that owns the reply.
  // ---------------------------------------------------------------------------
  {
    id: 'C32',
    question: '¿me garantizáis un trabajo al acabar?',
    expectedAnswerId: null,
    expectedIntent: 'unknown',
    note: 'Rule 4: never promise employment; no approved answer exists, so rule 5 (register the doubt, propose human contact) applies.',
  },
  {
    id: 'C33',
    question: '¿qué titulación obtengo?',
    expectedAnswerId: null,
    expectedIntent: 'unknown',
    note: 'Rule 4: no approved titulación answer exists; rule 5 fallback — never invent a credential.',
  },
  {
    id: 'C34',
    question: '¿hay alguna forma de pagarlo poco a poco?',
    expectedAnswerId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: "poco a poco" is a financing question; options exist + refer to the call, never an FAQ answer and never conditions.',
  },
  {
    id: 'C35',
    question: '¿hay descuento si me apunto con un amigo?',
    expectedAnswerId: null,
    expectedIntent: 'price',
    note: 'Rule 6: a promotion/discount question must never produce an offer; the approved price reply + call is the only safe handling.',
  },

  // ---------------------------------------------------------------------------
  // Group E — handoff and rejection (rules 7, 9).
  // ---------------------------------------------------------------------------
  {
    id: 'C36',
    question: 'quiero hablar con una persona',
    expectedAnswerId: null,
    expectedIntent: 'human',
    note: 'Rule 9 (confirmed trigger): the lead explicitly asks for a person; handoff, no FAQ answer.',
  },
  {
    id: 'C37',
    question: '¿me podéis dar el contacto de un comercial?',
    expectedAnswerId: null,
    expectedIntent: 'human',
    note: 'Rule 9 (confirmed trigger): asking for "un comercial" is the human handoff; no FAQ answer.',
  },
  {
    id: 'C38',
    question: 'no me interesa',
    expectedAnswerId: null,
    expectedIntent: 'decline',
    note: 'Rule 5 family (soft decline): a bare rejection is neither a stop (rule 7) nor a confirmed handoff (rule 9); no FAQ answer.',
  },
  {
    id: 'C39',
    question: 'quiero darme de baja',
    expectedAnswerId: null,
    expectedIntent: 'stop',
    note: 'Rule 7: an unsubscribe request stops the follow-up and is registered as "no continuar"; no FAQ answer.',
  },
  {
    id: 'C40',
    question: 'no me escribas más',
    expectedAnswerId: null,
    expectedIntent: 'stop',
    note: 'Rule 7: explicit stop request; no FAQ answer, follow-up suppressed.',
  },
];

// Group membership of the dataset. Kept tiny on purpose: only what the report
// needs to tag failing cases. ONE entry per group, so the report never shows
// two homonymous groups: group B (paraphrases) holds C19-C22 and the
// financing paraphrases C41-C43, whose ids are stable and are NOT renumbered.
// Membership is an explicit id list, not a numeric range, so a group can hold
// cases that are not adjacent in the id numbering.
export interface EvalGroup {
  group: string;
  label: string;
  ids: number[];
}

export const EVAL_GROUPS: EvalGroup[] = [
  { group: 'A', label: 'direct keyword hits', ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] },
  { group: 'B', label: 'paraphrases', ids: [19, 20, 21, 22, 41, 42, 43] },
  { group: 'C', label: 'forbidden topics', ids: [23, 24, 25, 26, 27, 28, 29, 30, 31] },
  { group: 'D', label: 'no approved answer', ids: [32, 33, 34, 35] },
  { group: 'E', label: 'handoff and rejection', ids: [36, 37, 38, 39, 40] },
];

export function groupOf(id: string): string {
  // Knowledge-base cases carry the 'K' prefix (K01...): they belong to their
  // own groups and never collide with the FAQ dataset numbering.
  if (id.startsWith('K')) {
    const number = Number(id.slice(1));
    const match = KB_EVAL_GROUPS.find((entry) => entry.ids.includes(number));
    return match ? match.group : '?';
  }
  const number = Number(id.slice(1));
  const match = EVAL_GROUPS.find((entry) => entry.ids.includes(number));
  return match ? match.group : '?';
}

export interface DatasetDescription {
  total: number;
  answerable: number;
  unanswerable: number;
  groups: { group: string; label: string; count: number }[];
}

export function describeDataset(cases: EvalCase[] = EVAL_CASES): DatasetDescription {
  const answerable = cases.filter((evalCase) => evalCase.expectedAnswerId !== null).length;
  return {
    total: cases.length,
    answerable,
    unanswerable: cases.length - answerable,
    groups: EVAL_GROUPS.map((entry) => ({
      group: entry.group,
      label: entry.label,
      count: cases.filter((evalCase) => entry.ids.includes(Number(evalCase.id.slice(1)))).length,
    })),
  };
}

// ---------------------------------------------------------------------------
// Knowledge-base dataset (Phase 0): the deterministic retrieval layer over the
// approved knowledge base (src/kb.ts / src/retrieval.ts).
//
// Two labelled groups:
//   F — questions the knowledge base MUST answer, with the passage it must
//       resolve to. None of them is a hand-written FAQ entry: they are the
//       paraphrases that used to fall into rule 5 because no keyword matched.
//   G — questions the knowledge base MUST NOT answer: price, financing,
//       refunds, scholarships, start dates, physical location and technical
//       requirements. They escalate (rule 1 or rule 5) and no passage may
//       clear the retrieval thresholds.
//
// The labels come from the source document (escuela-musk-base-conocimiento.md)
// and the hard rules, NOT from what the retrieval currently does.
//
// Data only: importing this module has no side effects.
// ---------------------------------------------------------------------------

export interface KbEvalCase {
  id: string; // 'K01', 'K02', ... stable, in array order
  question: string; // the lead's message, verbatim
  expectedPassageId: string | null; // a KbPassage.id, or null = the KB must stay silent
  expectedIntent: Intent; // the correct classify() result with the demo profile
  note: string; // WHY this expectation is the correct behaviour, citing the rule
}

export const EVAL_KB_CASES: KbEvalCase[] = [
  // -------------------------------------------------------------------------
  // Group F — the knowledge base answers (rule 4: approved content only).
  // -------------------------------------------------------------------------
  {
    id: 'K01',
    question: '¿me dan certificado de la UE?',
    expectedPassageId: 'kb-certificacion-arp',
    expectedIntent: 'kb',
    note: 'Certification question with no hand-written FAQ entry: the knowledge base answers with the ARP passage (certification of the EU, no amounts).',
  },
  {
    id: 'K02',
    question: '¿el máster de videojuegos es para empezar de cero?',
    expectedPassageId: 'kb-videojuegos-contenido',
    expectedIntent: 'kb',
    note: 'Same meaning as the "no prior experience" FAQ but about the game master: the KB answers who the master is for, without hours or prices.',
  },
  {
    id: 'K03',
    question: 'quiero hacer un juego y publicarlo en Steam',
    expectedPassageId: 'kb-videojuegos-contenido',
    expectedIntent: 'kb',
    note: 'A concrete goal (publish a game on Steam): the KB passage covers the game master, the final project and the Steam business side.',
  },
  {
    id: 'K04',
    question: '¿en Python se aprende Django y análisis de datos?',
    expectedPassageId: 'kb-python-contenido',
    expectedIntent: 'kb',
    note: 'A stack question: rule 2 allows the general content and the stack; the detailed module-by-module syllabus is never sent.',
  },
  {
    id: 'K05',
    question: '¿con qué puedo trabajar si hago Front End?',
    expectedPassageId: 'kb-frontend-salidas',
    expectedIntent: 'kb',
    note: 'Job outcomes for a specific formation: allowed by rule 2, and never a promise of employment (rule 4).',
  },
  {
    id: 'K06',
    question: '¿me ayudáis a encontrar trabajo después?',
    expectedPassageId: 'kb-empleo-ayuda',
    expectedIntent: 'kb',
    note: 'Employment help: the KB describes the guidance (CV, LinkedIn, technical tests, recruiters) without promising a job.',
  },
  {
    id: 'K07',
    question: '¿tengo que ser bueno en matemáticas?',
    expectedPassageId: 'kb-sin-experiencia',
    expectedIntent: 'kb',
    note: 'A cold objection about maths: the KB answers that advanced maths are not needed. Entry requirements themselves escalate, but this question does not ask for them.',
  },
  {
    id: 'K08',
    question: '¿puedo compaginarlo con mi trabajo?',
    expectedPassageId: 'kb-compaginar-trabajo',
    expectedIntent: 'kb',
    note: 'Compatibility with work: the KB answers that there are no fixed connection hours, without stating a weekly dedication (that escalates).',
  },
  {
    id: 'K09',
    question: '¿qué pasa si me quedo atascado?',
    expectedPassageId: 'kb-atasco',
    expectedIntent: 'kb',
    note: 'Stuck mid-course: the KB answers with the tutor, the active professors and the community.',
  },
  {
    id: 'K10',
    question: '¿hay prácticas en empresa?',
    expectedPassageId: 'kb-practicas',
    expectedIntent: 'kb',
    note: 'Internships: the official message is that the agreement is guaranteed; the conditions of the agreement (where, how long, how much) are NOT stated, they escalate.',
  },
  {
    id: 'K11',
    question: '¿puedo hacer la formación sin título universitario?',
    expectedPassageId: 'kb-sin-titulo',
    expectedIntent: 'kb',
    note: 'No university degree: the KB answers with the portfolio and the technical test, without promising any employer.',
  },
  {
    id: 'K12',
    question: '¿la IA me va a quitar el trabajo?',
    expectedPassageId: 'kb-ia-merece',
    expectedIntent: 'kb',
    note: 'The classic cold objection about AI: the KB answers that the AI is a copilot and that companies need people who structure and audit the code. No employment promise.',
  },
  {
    id: 'K13',
    question: '¿qué diferencia hay con otros bootcamps?',
    expectedPassageId: 'kb-diferencia-bootcamps',
    expectedIntent: 'kb',
    note: 'Differentiation question: the KB answers with the method, the community and transparency.',
  },
  {
    id: 'K14',
    question: '¿puedo trabajar por cuenta propia?',
    expectedPassageId: 'kb-freelance',
    expectedIntent: 'kb',
    note: 'Freelance: the KB answers with the freelance part of Back End and the self-published game in Videojuegos, without any amount.',
  },
  {
    id: 'K15',
    question: '¿qué me recomendáis, Python o Full Stack?',
    expectedPassageId: 'kb-guia-recomendacion',
    expectedIntent: 'kb',
    note: 'The recommendation guide by inclination: the KB answers which formation fits which profile.',
  },
  {
    id: 'K16',
    question: '¿la formación de Unity me da el sello oficial?',
    expectedPassageId: 'kb-certificacion-unity',
    expectedIntent: 'kb',
    note: 'The Unity certifications (UCAGD and UCU-PROG) are stated without any figure.',
  },
  {
    id: 'K17',
    question: '¿me ayudáis a preparar el examen de Python?',
    expectedPassageId: 'kb-certificacion-pcap',
    expectedIntent: 'kb',
    note: 'The PCAP certification of the Python Institute; the school is an official exam centre.',
  },
  {
    id: 'K18',
    question: 'ahora no es el momento, no tengo tiempo',
    expectedPassageId: 'kb-obj-no-tiempo',
    expectedIntent: 'kb',
    note: 'The "no time right now" objection: the KB includes Nicolás’s confirmed two-year flexible completion window and redirects to a call without pressure (rule 8).',
  },
  {
    id: 'K19',
    question: 'no me fío de los centros de formación',
    expectedPassageId: 'kb-obj-desconfio',
    expectedIntent: 'kb',
    note: 'Distrust of training centres: the KB answers with the community, the follow-up, the testimonies and the ARP certification.',
  },
  {
    id: 'K20',
    question: '¿qué diploma me dan al terminar?',
    expectedPassageId: 'kb-diploma',
    expectedIntent: 'kb',
    note: 'The diploma: the certificate of the school, ARP, PCAP for Python and the Unity certifications.',
  },
  {
    id: 'K21',
    question: '¿en back end se usa node y java?',
    expectedPassageId: 'kb-backend-contenido',
    expectedIntent: 'kb',
    note: 'The stack of a specific formation: allowed by rule 2 (content and skills), never the module-by-module detail.',
  },
  {
    id: 'K22',
    question: '¿el método es práctico o más bien teórico?',
    expectedPassageId: 'kb-metodo-practica',
    expectedIntent: 'kb',
    note: 'The method: learning by doing. The FAQ keyword "metodologia" does not match this phrasing, so the knowledge base answers it.',
  },

  // -------------------------------------------------------------------------
  // Group G — the knowledge base MUST stay silent. These topics always
  // escalate: rule 1 (price), rule 3 (financing), rule 5 (register the doubt
  // and propose a human) and the "no consta en la web" list of the source.
  // -------------------------------------------------------------------------
  {
    id: 'K23',
    question: '¿cuánto cuesta?',
    expectedPassageId: null,
    expectedIntent: 'price',
    note: 'Rule 1: the price never reaches the KB. The retrieval layer refuses the topic outright and classify() answers with the approved price reply plus the call invitation.',
  },
  {
    id: 'K24',
    question: '¿me devolvéis el dinero si me arrepiento?',
    expectedPassageId: null,
    expectedIntent: 'unknown',
    note: 'Refund policy: it does not exist in the source, so it escalates (rule 5). No passage may answer it.',
  },
  {
    id: 'K25',
    question: '¿hay becas o descuentos?',
    expectedPassageId: null,
    expectedIntent: 'price',
    note: 'Scholarships and discounts: financing/promotion topics. Rule 3 and rule 6: never an offer, never an amount.',
  },
  {
    id: 'K26',
    question: '¿tenéis una oficina física?',
    expectedPassageId: null,
    expectedIntent: 'unknown',
    note: 'Physical location of the school: the source does not state it, so it escalates (rule 5).',
  },
  {
    id: 'K27',
    question: '¿hay calendario de convocatorias?',
    expectedPassageId: null,
    expectedIntent: 'unknown',
    note: 'Start dates and calendar: the source does not state them, so they escalate (rule 5).',
  },

  {
    id: 'K28',
    question: '¿qué cantidad de horas son?',
    expectedPassageId: null,
    expectedIntent: 'unknown',
    note: 'Duration in hours: no figures may ever be sent, so it escalates (rule 5).',
  },
  {
    id: 'K29',
    question: '¿qué requisitos técnicos necesito?',
    expectedPassageId: null,
    expectedIntent: 'unknown',
    note: 'Technical entry requirements: the source does not state them, so they escalate (rule 5).',
  },
  {
    id: 'K30',
    question: '¿me facilitáis las condiciones del convenio de prácticas?',
    expectedPassageId: null,
    expectedIntent: 'unknown',
    note: 'The exact conditions of the internship agreement: not in the source, so they escalate (rule 5).',
  },
];

// Group membership of the knowledge-base dataset. Same shape as the FAQ
// groups: an explicit id list, so a group can hold non-adjacent ids.
export const KB_EVAL_GROUPS: EvalGroup[] = [
  { group: 'F', label: 'answered by the knowledge base', ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
  { group: 'G', label: 'must escalate (knowledge base silent)', ids: [23, 24, 25, 26, 27, 28, 29, 30] },
];

export interface KbDatasetDescription {
  total: number;
  answerable: number;
  unanswerable: number;
  groups: { group: string; label: string; count: number }[];
}

export function describeKbDataset(cases: KbEvalCase[] = EVAL_KB_CASES): KbDatasetDescription {
  const answerable = cases.filter((evalCase) => evalCase.expectedPassageId !== null).length;
  return {
    total: cases.length,
    answerable,
    unanswerable: cases.length - answerable,
    groups: KB_EVAL_GROUPS.map((entry) => ({
      group: entry.group,
      label: entry.label,
      count: cases.filter((evalCase) => entry.ids.includes(Number(evalCase.id.slice(1)))).length,
    })),
  };
}

// ---------------------------------------------------------------------------
// Phase 2 lexical benchmark. All prompts are synthetic, not observed lead
// messages and not new client copy. The dev prompts are indexed in each
// passage's exampleQueries; protected intents are evaluated separately because
// the hard rules must intercept them before knowledge-base retrieval.
// ---------------------------------------------------------------------------

export type KbParaphraseCategory =
  | 'answerable'
  | 'must-escalate'
  | 'ambiguous'
  | 'protected';

export interface KbParaphraseCase {
  id: string;
  question: string;
  category: KbParaphraseCategory;
  expectedPassageId: string | null;
  expectedIntent?: Intent;
  note: string;
}

const KB_PARAPHRASE_DEV_ANSWERABLE_CASES: KbParaphraseCase[] = KB_PASSAGES.flatMap(
  (passage) =>
    (passage.exampleQueries ?? []).map((question, index) => ({
      id: `KD-${passage.id}-${String(index + 1).padStart(2, '0')}`,
      question,
      category: 'answerable' as const,
      expectedPassageId: passage.id,
      expectedIntent: 'kb' as const,
      note: 'Synthetic development paraphrase indexed for this passage; not an observed customer quote.',
    })),
);

// These deliberately broad or unsupported prompts should remain silent. The
// ambiguous examples have too little context to choose one approved passage.
const KB_PARAPHRASE_DEV_NEGATIVE_CASES: KbParaphraseCase[] = [
  {
    id: 'KD-negative-invoice',
    question: '¿Podéis enviarme una factura?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Invoice details are not covered by an approved passage.',
  },
  {
    id: 'KD-negative-mobile-app',
    question: '¿Tenéis una aplicación para el móvil?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'A mobile application is not described in the approved knowledge base.',
  },
  {
    id: 'KD-negative-contract',
    question: '¿Me podéis mandar el contrato de matrícula?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Contract and enrolment terms are not covered by an approved passage.',
  },
  {
    id: 'KD-negative-address',
    question: '¿Cuál es vuestro domicilio social?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'The legal address is not approved information.',
  },
  {
    id: 'KD-negative-employer-list',
    question: '¿Me pasáis una lista de empresas que contratan?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'A list of employers is not present in the approved knowledge base.',
  },
  {
    id: 'KD-negative-account',
    question: '¿Puedo compartir mi cuenta con otra persona?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Account-sharing policy is not stated in an approved passage.',
  },
  {
    id: 'KD-ambiguous-context',
    question: '¿Y esa parte cómo era?',
    category: 'ambiguous',
    expectedPassageId: null,
    note: 'Context is missing; the agent must clarify rather than guess a passage.',
  },
  {
    id: 'KD-ambiguous-reference',
    question: '¿Y eso qué sería?',
    category: 'ambiguous',
    expectedPassageId: null,
    note: 'The referent is absent, so no single approved passage can safely answer.',
  },
  {
    id: 'KD-ambiguous-ellipsis',
    question: '¿Y cuál de esas?',
    category: 'ambiguous',
    expectedPassageId: null,
    note: 'The options are not identified; the correct action is clarification.',
  },
];

// Rules 1, 2, 3, 7 and 9 are tested as a separate protected-intent lane. These
// cases are NEVER counted as answerable KB prompts, even if raw retrieval could
// find a lexical neighbour.
const KB_PARAPHRASE_DEV_PROTECTED_CASES: KbParaphraseCase[] = [
  {
    id: 'KD-protected-price',
    question: '¿Me dices cuál sería el importe?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'price',
    note: 'Rule 1: price intent must be handled before retrieval; no amount may be given.',
  },
  {
    id: 'KD-protected-financing',
    question: '¿Se puede pagar en mensualidades?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: financing intent must be handled before retrieval; never state payment conditions.',
  },
  {
    id: 'KD-protected-syllabus',
    question: '¿Qué módulos incluye el programa?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'temario',
    note: 'Rule 2: detailed-syllabus intent must be handled before retrieval.',
  },
  {
    id: 'KD-protected-stop',
    question: 'No quiero recibir más mensajes',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'stop',
    note: 'Rule 7: stop requests must win before retrieval and suppress follow-up.',
  },
  {
    id: 'KD-protected-human',
    question: 'Quiero que me atienda una persona real',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'human',
    note: 'Rule 9: a request for a person must trigger handoff before retrieval.',
  },
];

export const KB_PARAPHRASE_DEV_CASES: KbParaphraseCase[] = [
  ...KB_PARAPHRASE_DEV_ANSWERABLE_CASES,
  ...KB_PARAPHRASE_DEV_NEGATIVE_CASES,
  ...KB_PARAPHRASE_DEV_PROTECTED_CASES,
];

// Sealed hold-out: three separately authored synthetic paraphrases per
// passage. This table is test-only and is never copied into exampleQueries or
// used as retrieval evidence. Do not tune examples, thresholds or weights from
// these scores; use it once for the final acceptance decision.
const KB_PARAPHRASE_HOLDOUT_BY_PASSAGE: Record<string, [string, string, string]> = {
  'kb-escuela': [
    '¿Qué servicios ofrece el centro además de enseñar programación?',
    '¿Cómo es el entorno para estudiar desde cualquier sitio?',
    '¿Hay una comunidad y tutores acompañando al alumnado?',
  ],
  'kb-metodo-practica': [
    '¿Voy resolviendo retos reales mientras aprendo?',
    '¿Qué proyectos puedo enseñar al terminar?',
    '¿Alguien revisa conmigo lo que voy creando?',
  ],
  'kb-metodo-gamificacion': [
    '¿Hay dinámicas para mantener la motivación al estudiar?',
    '¿Los cuestionarios tienen una clasificación entre alumnos?',
    'Me gusta aprender jugando, ¿cómo lo planteáis?',
  ],
  'kb-metodo-demostracion': [
    '¿Puedo avanzar de bloque cuando ya manejo el anterior?',
    '¿Se respeta mi velocidad para asimilar cada parte?',
    '¿Tengo que demostrar que lo he entendido para seguir?',
  ],
  'kb-metodo-acompanamiento': [
    '¿Hay un mentor disponible cuando necesito orientación?',
    '¿Puedo consultar a profesionales en activo?',
    '¿Quién me echa una mano si me atasco?',
  ],
  'kb-metodo-ia-copiloto': [
    '¿Me enseñan a auditar sugerencias de código de la IA?',
    '¿Cómo evito depender de respuestas automáticas?',
    '¿Aprendo a optimizar lo que genera la inteligencia artificial?',
  ],
  'kb-certificacion-arp': [
    '¿Qué acredita el sello reconocido en Europa?',
    '¿La certificación ARP es transversal a todos los itinerarios?',
    '¿Me explican cómo se consigue ese reconocimiento europeo?',
  ],
  'kb-certificacion-pcap': [
    '¿Qué entidad organiza la acreditación de Python?',
    '¿La escuela puede examinarme oficialmente de PCAP?',
    '¿Me preparan para una certificación externa de Python?',
  ],
  'kb-certificacion-unity': [
    '¿Qué certificados de Unity se consiguen en videojuegos?',
    '¿Hay una acreditación tanto de diseño como de programación?',
    '¿El máster incluye los sellos UCAGD y UCU-PROG?',
  ],
  'kb-python-contenido': [
    '¿Se toca aprendizaje automático además de desarrollo web?',
    '¿Qué librerías se utilizan para trabajar con datos?',
    '¿Puedo aprender a automatizar tareas con Python?',
  ],
  'kb-python-salidas': [
    '¿Qué perfiles junior trabajan con datos o aprendizaje automático?',
    '¿Hay opciones de backend para alguien que estudia Python?',
    '¿Qué tipo de puesto podría buscar al acabar ese itinerario?',
  ],
  'kb-frontend-contenido': [
    '¿Se diseña la experiencia de las personas que usan la web?',
    '¿Qué frameworks se ven para crear interfaces?',
    '¿Puedo conectar una página a datos de verdad?',
  ],
  'kb-frontend-salidas': [
    '¿Qué puesto se centra en la experiencia de usuario?',
    '¿Podría trabajar diseñando el producto digital?',
    '¿Qué roles hay en la parte visual de una web?',
  ],
  'kb-backend-contenido': [
    '¿Se estudian servicios, APIs y bases de datos?',
    '¿Qué herramientas se usan en el lado del servidor?',
    '¿Aprendería Java con Spring para construir servicios?',
  ],
  'kb-backend-salidas': [
    '¿Hay perfiles profesionales de arquitectura y cloud?',
    '¿Qué puesto trabaja diseñando sistemas de datos?',
    '¿Podría buscar un rol de desarrollo en la nube?',
  ],
  'kb-fullstack-contenido': [
    '¿Qué stack permite construir un producto de punta a punta?',
    '¿Se mezclan tecnologías de interfaz y servidor?',
    '¿Se aprende GraphQL junto con herramientas de despliegue?',
  ],
  'kb-fullstack-salidas': [
    '¿Qué puestos combinan desarrollo web en varias capas?',
    '¿Podría trabajar como ingeniero de calidad de software?',
    '¿Qué opciones hay para alguien que domina frontend y backend?',
  ],
  'kb-videojuegos-contenido': [
    '¿Se aprende a crear un juego publicable en Steam?',
    '¿Qué motores gráficos se usan en el itinerario?',
    '¿Hay contenidos de modelado 3D y realidad virtual?',
  ],
  'kb-videojuegos-salidas': [
    '¿Qué profesiones existen en un estudio de desarrollo de juegos?',
    '¿Podría dedicarme a probar videojuegos?',
    '¿Hay trabajo como artista técnico o diseñador de juego?',
  ],
  'kb-otros-programas': [
    '¿Qué másteres tenéis relacionados con inteligencia artificial?',
    '¿Se puede estudiar redes neuronales y modelado predictivo?',
    '¿Hay una especialidad de IA Engineering con Python?',
  ],
  'kb-guia-recomendacion': [
    'Me atraen los datos, pero también la programación web; ¿por dónde empiezo?',
    '¿Qué recorrido encaja si prefiero lo creativo y visual?',
    '¿Cómo comparo una especialidad amplia con una más concreta?',
  ],
  'kb-sin-experiencia': [
    '¿Me aceptarán si jamás he programado?',
    '¿Necesito una base de matemáticas para arrancar?',
    '¿Puedo aprender aunque venga de otro sector?',
  ],
  'kb-compaginar-trabajo': [
    '¿Puedo organizar el estudio alrededor de mi jornada?',
    '¿Hay sesiones obligatorias a una hora fija?',
    '¿Se puede compaginar con otras responsabilidades?',
  ],
  'kb-presencial-online': [
    '¿La academia tiene aulas o todo se hace en remoto?',
    '¿Necesito desplazarme para recibir las clases?',
    '¿El campus y el acompañamiento son por internet?',
  ],
  'kb-atasco': [
    '¿Qué apoyo tengo cuando no consigo resolver un ejercicio?',
    '¿Me ayudan a desbloquearme antes de continuar?',
    '¿Hay profesores disponibles para dudas de código?',
  ],
  'kb-practicas': [
    '¿Se realizan prácticas mediante un acuerdo con una empresa?',
    '¿El centro coordina la experiencia en una compañía?',
    '¿Puedo aplicar lo aprendido en una empresa colaboradora?',
  ],
  'kb-empleo-ayuda': [
    '¿Me orientan para preparar el currículum y LinkedIn?',
    '¿Hay sesiones para practicar entrevistas técnicas?',
    '¿La escuela conecta con personas que reclutan?',
  ],
  'kb-sin-titulo': [
    '¿Es imprescindible tener una carrera para entrar?',
    'No fui a la universidad, ¿puedo presentar mi portafolio?',
    '¿Qué peso tiene la prueba práctica frente a los estudios?',
  ],
  'kb-diploma': [
    '¿Qué certificado me llevo cuando complete el curso?',
    '¿Hay acreditaciones adicionales según lo que estudie?',
    '¿Con qué documentos puedo demostrar que terminé?',
  ],
  'kb-ia-merece': [
    '¿Tiene futuro trabajar en tecnología si la IA escribe código?',
    '¿Qué criterio humano sigue haciendo falta en desarrollo?',
    '¿La automatización cambia el valor de aprender programación?',
  ],
  'kb-diferencia-bootcamps': [
    '¿Qué rasgos distinguen vuestra metodología de otros centros?',
    '¿Cómo es la experiencia frente a una academia intensiva?',
    '¿Qué aporta la comunidad en comparación con otros cursos?',
  ],
  'kb-freelance': [
    '¿Aprendo a trabajar por proyectos para clientes propios?',
    '¿Puedo publicar y vender un videojuego independiente?',
    '¿Hay un camino para montar mi actividad como autónomo?',
  ],
  'kb-obj-no-tiempo': [
    '¿Puedo terminar los estudios aunque ahora vaya con poco margen?',
    '¿Se puede hacer el recorrido a mi ritmo durante más tiempo?',
    'Ahora mismo no puedo empezar, ¿hay flexibilidad para completarlo?',
  ],
  'kb-obj-desconfio': [
    '¿Cómo puedo comprobar que la formación online es seria?',
    '¿Hay testimonios de personas que ya hayan estudiado allí?',
    'Me preocupa quedarme sin apoyo después de apuntarme',
  ],
  'kb-obj-ya-deje': [
    'Ya pedí información hace tiempo y al final lo aparqué',
    '¿Puedo retomar la conversación aunque entonces no continuara?',
    'Lo dejé pendiente cuando me lo explicaron por primera vez',
  ],
};

const KB_PARAPHRASE_HOLDOUT_ANSWERABLE_CASES: KbParaphraseCase[] = Object.entries(
  KB_PARAPHRASE_HOLDOUT_BY_PASSAGE,
).flatMap(([passageId, questions]) =>
  questions.map((question, index) => ({
    id: `KT-${passageId}-${String(index + 1).padStart(2, '0')}`,
    question,
    category: 'answerable' as const,
    expectedPassageId: passageId,
    expectedIntent: 'kb' as const,
    note: 'Held-out synthetic paraphrase; never indexed as passage evidence.',
  })),
);

const KB_PARAPHRASE_HOLDOUT_NEGATIVE_CASES: KbParaphraseCase[] = [
  {
    id: 'KT-negative-invoice',
    question: '¿Podéis emitir una factura a nombre de mi empresa?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Billing details are not stated in an approved passage.',
  },
  {
    id: 'KT-negative-recording',
    question: '¿Las clases quedan grabadas para verlas después?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Recording availability is not part of the approved knowledge base.',
  },
  {
    id: 'KT-negative-equipment',
    question: '¿Qué ordenador tendría que comprar para conectarme?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Equipment requirements are a protected topic and must escalate.',
  },
  {
    id: 'KT-negative-reschedule',
    question: '¿Puedo cambiar de grupo una vez matriculado?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Group-change policy is not approved content.',
  },
  {
    id: 'KT-negative-international',
    question: '¿La escuela tramita visados para estudiar desde fuera?',
    category: 'must-escalate',
    expectedPassageId: null,
    note: 'Visa support is not covered by the approved knowledge base.',
  },
  {
    id: 'KT-ambiguous-context',
    question: '¿Y esa opción qué incluye?',
    category: 'ambiguous',
    expectedPassageId: null,
    note: 'The referenced option is unspecified, so the agent must clarify.',
  },
  {
    id: 'KT-ambiguous-reference',
    question: '¿Cuál de las dos me conviene?',
    category: 'ambiguous',
    expectedPassageId: null,
    note: 'Neither option nor user preference is available to choose safely.',
  },
  {
    id: 'KT-ambiguous-ellipsis',
    question: '¿Y esa certificación?',
    category: 'ambiguous',
    expectedPassageId: null,
    note: 'Several certification passages exist and the requested one is unclear.',
  },
];

const KB_PARAPHRASE_HOLDOUT_PROTECTED_CASES: KbParaphraseCase[] = [
  {
    id: 'KT-protected-price',
    question: '¿Qué importe tendría que pagar?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'price',
    note: 'Rule 1: the price intent must intercept before KB retrieval.',
  },
  {
    id: 'KT-protected-financing',
    question: '¿Hay opción de financiarlo con cuotas?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'financiacion',
    note: 'Rule 3: payment terms must intercept before KB retrieval.',
  },
  {
    id: 'KT-protected-syllabus',
    question: '¿Me mandáis el plan de estudios completo?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'temario',
    note: 'Rule 2: detailed syllabus must intercept before KB retrieval.',
  },
  {
    id: 'KT-protected-stop',
    question: 'No quiero que me contactéis más',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'stop',
    note: 'Rule 7: a stop request must intercept before retrieval.',
  },
  {
    id: 'KT-protected-human',
    question: '¿Me puede llamar un asesor del equipo?',
    category: 'protected',
    expectedPassageId: null,
    expectedIntent: 'human',
    note: 'Rule 9: a request for a human must intercept before retrieval.',
  },
];

export const KB_PARAPHRASE_TEST_CASES: KbParaphraseCase[] = [
  ...KB_PARAPHRASE_HOLDOUT_ANSWERABLE_CASES,
  ...KB_PARAPHRASE_HOLDOUT_NEGATIVE_CASES,
  ...KB_PARAPHRASE_HOLDOUT_PROTECTED_CASES,
];
