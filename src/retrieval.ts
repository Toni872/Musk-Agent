// Deterministic retrieval over the approved knowledge base (src/kb.ts).
//
// This layer is the answerable-content gate: it decides whether a lead
// question can be answered from the knowledge base, and with WHAT passage.
// It is pure, offline and reproducible: no network, no embeddings, no vector
// database, no LLM, no dependencies.
//
// Two independent gates, in this order:
//
//  1. FORBIDDEN_TOPIC_PATTERNS — topics that must ALWAYS escalate to a human
//     (price, financing, hours, start dates, refunds, scholarships, physical
//     location, entry requirements and internship conditions). The only narrow
//     duration exception is a question explicitly about time to complete the
//     formation, approved by Nicolás as two years with flexibility.
//
//  2. The score thresholds — a passage is a match only when it clears BOTH
//     the BM25 score AND the term coverage. Below them the behaviour is
//     exactly today's behaviour: rule 5 (register the doubt, propose a human).
//
// The thresholds live HERE, in code, as named constants (never in a prompt),
// so they can be audited, reviewed and re-calibrated.

import type { KbPassage } from './kb';
import { normalizeEs } from './text';

// ---------------------------------------------------------------------------
// Tunables (auditable, named, never in a prompt)
// ---------------------------------------------------------------------------

// BM25 parameters. Standard defaults (k1 = 1.5, b = 0.75): they control how
// much a repeated term is rewarded (k1) and how much a long passage is
// penalised relative to the average one (b).
export const BM25_K1 = 1.5;
export const BM25_B = 0.75;

// Minimum BM25 score a passage must reach to be an answer.
// Calibrated on 2026-10-20 against the labelled knowledge-base dataset
// (src/eval.dataset.ts, groups F and G). MEASURED DISTRIBUTION of the closest
// passage for every labelled case:
//
//   F (answered by the knowledge base, 22 cases): score 4.54 - 14.62,
//       coverage 0.60 - 1.00.
//   G (must escalate, 8 cases): score 0.00 - 12.78, coverage 0.00 - 0.75.
//
// The two groups OVERLAP on the raw score: a forbidden-topic question can
// retrieve a passage with a high score (the internship-conditions case
// scores 12.78 because it shares "practicas" and "convenio" with the
// internships passage). The thresholds therefore do NOT separate the groups
// on their own: the FORBIDDEN_TOPIC_PATTERNS gate above is what keeps the
// false-positive rate at 0, and these thresholds are the second line.
//
// The threshold is set at 3.5 because that is the band where the answerable
// group stays clearly above (its minimum is 4.54) and the out-of-scope
// questions stay clearly below: the generic probes measured on the same date
// score 2.19 ("quiero aprender cocina"), 2.37 ("de cero") and 1.94
// ("trabajo"), all below 3.5.
//
// Re-calibration: change the labelled cases, run `npm run eval -- --verbose`
// (it prints the score and coverage of every labelled case) and move the
// constant only if the answerable group still clears it with margin. A
// paraphrase that stops clearing the threshold is a MISS to report, never a
// reason to lower the bar.
export const MIN_BM25_SCORE = 3.5;

// Minimum fraction of the query's content terms that must appear in the
// passage (title, answer or retrieval terms). Same calibration date, same
// measured distribution and same re-calibration rule as MIN_BM25_SCORE: the
// answerable group sits at 0.60-1.00 and the escalate group at 0.00-0.75, so
// 0.5 is the highest value that keeps the whole answerable group above.
export const MIN_TERM_COVERAGE = 0.5;

// Spanish stopwords: closed class words that carry no topical signal.
// Explicit and named on purpose — an implicit stopword list would make the
// scoring unreproducible.
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'al', 'algo', 'algun', 'alguna', 'algunas', 'alguno', 'algunos', 'alla', 'allí',
  'ante', 'antes', 'aqui', 'asi', 'aun', 'aunque', 'bajo', 'bien', 'cada', 'casi',
  'como', 'con', 'contra', 'cual', 'cuales', 'cualquier', 'cuando', 'cuanto', 'cuanta',
  'cuantos', 'cuantas', 'de', 'del', 'demas', 'dentro', 'desde', 'despues', 'dice',
  'dicho', 'donde', 'dos', 'el', 'ella', 'ellas', 'ello', 'ellos', 'en', 'entonces',
  'entre', 'era', 'eran', 'eres', 'es', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta',
  'estaba', 'estan', 'estar', 'estas', 'este', 'esto', 'estos', 'estoy', 'fue', 'fueron',
  'ha', 'habia', 'han', 'hasta', 'hay', 'haya', 'he', 'haces', 'hacia', 'igual', 'incluso',
  'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me', 'mediante', 'menos', 'mi', 'mis',
  'mientras', 'mucho', 'muy', 'nada', 'ni', 'no', 'nos', 'nuestra', 'nuestro', 'o',
  'os', 'otra', 'otras', 'otro', 'otros', 'para', 'pero', 'poco', 'por', 'porque',
  'puede', 'pueden', 'puedes', 'puedo', 'que', 'quien', 'quienes', 'se', 'segun',
  'ser', 'si', 'sido', 'sin', 'sobre', 'solo', 'soy', 'su', 'sus', 'tal', 'tampoco',
  'tengo', 'tienes', 'tiene', 'todo', 'todos', 'tras', 'tu', 'tus', 'un', 'una', 'uno',
  'unos', 'unas', 'usted', 'va', 'vamos', 'van', 'ver', 'vez', 'y', 'ya', 'yo',
  // Verb and courtesy forms that show up in every lead question and carry no
  // topical signal of their own.
  'algun', 'anda', 'aqui', 'dame', 'dime', 'diras', 'diria', 'dar', 'daria', 'dan',
  'digo', 'dice', 'dijiste', 'digo', 'hace', 'haci', 'hacen', 'pasa', 'pasas', 'puede',
  'pues', 'quedo', 'quiere', 'quieren', 'quieres', 'quiero', 'sabe', 'saben', 'saber',
  'sepas', 'sigo', 'somos', 'soy', 'suelen', 'tengo', 'tenga', 'tengo', 'tiene',
  'tienen', 'va', 'vamos', 'van', 'ver', 'vengo', 'quiero', 'cuéntame', 'contame',
  'cuentame', 'porfa', 'favor', 'gracias', 'vale', 'ok', 'okey', 'claro', 'perfecto',
  'hola', 'buenas', 'buenos', 'oye', 'adios', 'chao', 'hasta', 'luego', 'ahora',
  'siempre', 'nunca', 'tambien', 'tampoco', 'mismo', 'misma', 'esta', 'este', 'esa',
  'ese', 'aquellos', 'aquel', 'aquella', 'alli', 'ahi', 'aqui', 'tales', 'dicha',
]);

// Topics that must ALWAYS escalate to a human, whatever the score. The list
// mirrors the "no consta en la web" section of the source document (§8) and
// the exclusions of the MVP scope. Completion-window queries are admitted only
// when they explicitly ask how long the lead has to complete/finish the course;
// hours, schedules, start dates and payment terms remain forbidden.
//
// The patterns are tested against the FOLDED text (lowercase, accents
// stripped), so they are written without accented characters.
export const FORBIDDEN_TOPIC_PATTERNS: { id: string; pattern: RegExp }[] = [
  {
    id: 'price',
    pattern:
      /\b(cuesta|cuestan|coste|costos|precio|precios|importe|importes|euros?|tarifas?|valor de|pagar|pago|caro|barato|carisimo|gratis|gratuita|gratuito|presupuesto|mas barato|dinero)\b/,
  },
  {
    id: 'financing',
    pattern:
      /\b(financia\w*|cuotas?|mensualidades?|a plazos|pago a plazos|pago|pagar|condiciones? de pago|forma de pago|intereses?|aplaz\w*|becas?|subvencion\w*|descuentos?|promocion\w*|sin intereses|interes cero|plan de pago)\b/,
  },
  {
    id: 'course-duration',
    pattern:
      /\b(cuanto dura|cuanto duran|cuanto tiempo|duracion|cuantos meses|cuantas semanas|meses|semanas)\b/,
  },
  {
    id: 'course-hours',
    pattern: /\b(?:cuantas horas|cuantos horas|horas lectivas|horas)\b/,
  },
  {
    id: 'start-dates-and-schedule',
    pattern:
      /\b(cuando empieza|cuando comienza|cuando hay|fecha de inicio|fecha de comienzo|convocatorias?|calendario|dedicacion|empezar el|empieza el|empieza la|empezar la|arranque)\b/,
  },
  {
    id: 'refunds',
    pattern: /\b(devolucion|devolver|devuelvo|devuelven|devuelves|reembolso|me devuelven)\b/,
  },
  {
    id: 'physical-location',
    pattern:
      /\b(sede|oficina|direccion|ubicacion|local fisico|donde esta la academia|donde queda la academia|donde se encuentra)\b/,
  },
  {
    id: 'detailed-syllabus',
    pattern:
      /\b(temario|temarios|modulos|unidades|plan de estudios|programa de estudios|syllabus|que se estudia|que se da|contenido detallado|programa detallado)\b/,
  },
  {
    id: 'entry-requirements',
    pattern:
      /\b(requisitos de acceso|requisitos tecnicos|que equipo necesito|que ordenador|que necesito para entrar|equipo necesario|portatil)\b/,
  },
  {
    id: 'internship-conditions',
    pattern:
      /\b(cuanto duran las practicas|cuanto pagan|cuanto cobra|remuneracion|remunerado|cuanto me pagan|donde hago las practicas|empresa donde hago|condiciones del convenio|condiciones de las practicas|condiciones del acuerdo)\b/,
  },
];

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

// Light, deterministic Spanish stem: only the plural ending is removed, so
// "practicas" and "practica" are the same term and "formaciones" and
// "formacion" are the same term. No aggressive suffix stripping: it would
// merge unrelated words ("programa" with "programacion").
//
// The "es" ending is only removed after a typical Spanish plural cluster
// (ces, ses, xes, zes). Stripping it from every word would turn "antes" into
// "ant" and "lunes" into "lun", which are not words and would make unrelated
// texts match.
function stem(token: string): string {
  let value = token;
  if (value.length > 4 && /(ces|ses|xes|zes)$/.test(value)) value = value.slice(0, -2);
  if (value.length > 3 && value.endsWith('s')) value = value.slice(0, -1);
  return value;
}

// Two terms are the same when they are equal, or when they share a long
// enough prefix ("certificacion" / "certificado", "practica" / "practic")
// without being wildly different words ("programa" / "programacion" differ by
// more than three characters and are NOT the same term).
function sameTerm(a: string, b: string): boolean {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  if (shortest < 6) return false;
  if (Math.abs(a.length - b.length) > 3) return false;
  let common = 0;
  while (common < shortest && a[common] === b[common]) common += 1;
  return common >= 6;
}

// Folded, accent-free tokens of a text, minus the stopwords, stemmed.
export function contentTokens(text: string): string[] {
  const folded = normalizeEs(text)
    // Every remaining punctuation character becomes a separator: "C#",
    // "Next.js", "UCU-PROG" and "no-sql" split into readable terms.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const tokens: string[] = [];
  for (const raw of folded.split(/\s+/)) {
    if (raw.length === 0) continue;
    const token = stem(raw);
    if (token.length === 0) continue;
    if (STOPWORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface RetrievalResult {
  passage: KbPassage;
  score: number; // bm25
  coverage: number; // 0..1
  matchedTerms: string[];
}

export interface RetrievalOutcome {
  match: RetrievalResult | null; // null when nothing clears the thresholds
  best: RetrievalResult | null; // closest passage even when it does NOT clear
  thresholds: { minScore: number; minCoverage: number };
  // Why the retrieval refused to answer, for the operator:
  //  - null: the query was scored and a passage cleared the thresholds;
  //  - 'forbidden-topic': the query belongs to a topic that must escalate;
  //  - 'below-threshold': the closest passage did not clear the thresholds.
  refusal: 'forbidden-topic' | 'below-threshold' | null;
}

interface ScoredPassage {
  passage: KbPassage;
  tokens: string[];
  tokenSet: string[];
  length: number;
}

function prepare(passages: KbPassage[]): ScoredPassage[] {
  return passages.map((passage) => {
    const tokens = contentTokens(`${passage.title} ${passage.answer} ${passage.terms.join(' ')}`);
    return { passage, tokens, tokenSet: tokens, length: tokens.length };
  });
}

// BM25 with the document frequency computed over the passage collection.
function bm25(
  documents: ScoredPassage[],
  queryTerms: string[],
): { scores: number[]; matched: string[][]; coverage: number[] } {
  const total = documents.length;
  const scores = new Array<number>(total).fill(0);
  const matched: string[][] = documents.map(() => []);
  const coverage = new Array<number>(total).fill(0);
  if (total === 0 || queryTerms.length === 0) return { scores, matched, coverage };

  const averageLength =
    documents.reduce((sum, document) => sum + document.length, 0) / total || 1;

  for (const term of queryTerms) {
    // Document frequency of the term (a document counts once).
    let documentFrequency = 0;
    for (const document of documents) {
      if (document.tokenSet.some((token) => sameTerm(token, term))) documentFrequency += 1;
    }
    if (documentFrequency === 0) continue;
    const idf = Math.log(1 + (total - documentFrequency + 0.5) / (documentFrequency + 0.5));

    for (let index = 0; index < total; index += 1) {
      const document = documents[index];
      // The loop bound keeps the index in range; the guard only exists to
      // satisfy noUncheckedIndexedAccess (an out-of-range index is impossible).
      if (document === undefined) continue;
      let frequency = 0;
      for (const token of document.tokens) {
        if (sameTerm(token, term)) frequency += 1;
      }
      if (frequency === 0) continue;
      const normalizer =
        BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / averageLength);
      // The score of a passage starts at 0 and only accumulates, so reading the
      // previous value as 0 when it is missing is the same number.
      const previous = scores[index] ?? 0;
      scores[index] = previous + idf * ((frequency * (BM25_K1 + 1)) / (frequency + normalizer));
      const terms = matched[index];
      // `matched` is built with one entry per document, so the entry always
      // exists; the guard only exists to satisfy noUncheckedIndexedAccess.
      if (terms !== undefined) terms.push(term);
    }
  }

  for (let index = 0; index < total; index += 1) {
    // A passage that matched no term has coverage 0.
    const matchedTerms = matched[index];
    coverage[index] = (matchedTerms?.length ?? 0) / queryTerms.length;
  }
  return { scores, matched, coverage };
}

// The retrieval. Pure and deterministic.
export function retrieve(passages: KbPassage[], query: string): RetrievalOutcome {
  const thresholds = { minScore: MIN_BM25_SCORE, minCoverage: MIN_TERM_COVERAGE };
  const documents = prepare(passages);
  const queryTerms = Array.from(new Set(contentTokens(query)));

  // Gate 1: the topics that must always escalate. Checked on the folded text
  // (not on the stemmed tokens) so it does not depend on the stopword list.
  const folded = normalizeEs(query);
  const asksApprovedCompletionWindow =
    /\b(completar|terminar|finalizar|acabar)\b/.test(folded) &&
    /\b(cuanto|cuantos|cuantas|tiempo|plazo|duracion|ano|anos|meses|semanas)\b/.test(folded);
  const forbidden = FORBIDDEN_TOPIC_PATTERNS.find(
    (entry) =>
      entry.pattern.test(folded) &&
      !(entry.id === 'course-duration' && asksApprovedCompletionWindow),
  );

  if (documents.length === 0 || queryTerms.length === 0) {
    return {
      match: null,
      best: null,
      thresholds,
      refusal: forbidden !== undefined ? 'forbidden-topic' : 'below-threshold',
    };
  }

  const { scores, matched, coverage } = bm25(documents, queryTerms);

  let bestIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < documents.length; index += 1) {
    // Every score and coverage is written for every index, so the fallback
    // value 0 only exists to satisfy noUncheckedIndexedAccess.
    const score = scores[index] ?? 0;
    const passageCoverage = coverage[index] ?? 0;
    // The closest passage is the one with the highest score; ties are broken
    // by coverage and then by the passage order (stable, deterministic).
    const better =
      score > bestScore ||
      (score === bestScore && passageCoverage > (bestIndex >= 0 ? (coverage[bestIndex] ?? 0) : -1));
    if (better) {
      bestScore = score;
      bestIndex = index;
    }
  }

  // Builds the result for a passage index. It returns null for an index that
  // does not exist (impossible for a valid bestIndex) instead of asserting.
  const build = (index: number): RetrievalResult | null => {
    const document = documents[index];
    if (document === undefined) return null;
    return {
      passage: document.passage,
      score: scores[index] ?? 0,
      coverage: coverage[index] ?? 0,
      matchedTerms: matched[index] ?? [],
    };
  };

  if (forbidden !== undefined) {
    // The topic must always escalate (rule 5): the closest passage is still
    // reported — it is the escalation provenance — but it is never an answer.
    return {
      match: null,
      best: bestIndex >= 0 ? build(bestIndex) : null,
      thresholds,
      refusal: 'forbidden-topic',
    };
  }

  const best = bestIndex >= 0 ? build(bestIndex) : null;
  const clears =
    best !== null && best.score >= thresholds.minScore && best.coverage >= thresholds.minCoverage;

  return {
    match: clears ? best : null,
    best,
    thresholds,
    refusal: clears ? null : 'below-threshold',
  };
}
