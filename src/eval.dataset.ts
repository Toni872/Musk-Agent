// Labelled evaluation dataset for the MUSK retrieval loop ("bucle de
// evaluación"): 40 (lead question -> expected approved answer) cases.
//
// The gold labels below are derived from MUSK's hard rules (AGENTS.md),
// NOT from what the code currently does. A disagreement between a label and
// the current routing is a MEASUREMENT (the point of the harness), never a
// reason to change the label. Group B paraphrases deliberately use wording
// with no current keyword match to expose retrieval gaps.
//
// Data only: importing this module has no side effects.

import type { Intent } from './intent';

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

// Group boundaries, derived from the stable id ranges above. Kept tiny on
// purpose: only what the report needs to tag failing cases.
export const EVAL_GROUPS: { group: string; label: string; firstId: number; lastId: number }[] = [
  { group: 'A', label: 'direct keyword hits', firstId: 1, lastId: 18 },
  { group: 'B', label: 'paraphrases', firstId: 19, lastId: 22 },
  { group: 'C', label: 'forbidden topics', firstId: 23, lastId: 31 },
  { group: 'D', label: 'no approved answer', firstId: 32, lastId: 35 },
  { group: 'E', label: 'handoff and rejection', firstId: 36, lastId: 40 },
];

export function groupOf(id: string): string {
  const number = Number(id.slice(1));
  const match = EVAL_GROUPS.find((entry) => number >= entry.firstId && number <= entry.lastId);
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
      count: cases.filter((evalCase) => {
        const number = Number(evalCase.id.slice(1));
        return number >= entry.firstId && number <= entry.lastId;
      }).length,
    })),
  };
}
