// Grounding check for the optional LLM layer (Phase 1).
//
// The model may only WORD an approved answer, never ADD content. This module
// is the mechanical part of that contract: every content token of the model's
// answer must already exist in the approved source, so a number, a price or a
// word copied from another FAQ entry is reported as unsupported.
//
// Deterministic, offline, dependency-free. It says nothing about the MEANING
// of the sentence (it is a lexical check, not a semantic one): it only proves
// that the model did not introduce any new term. That is exactly the leak the
// output guard could not see.

import { normalizeEs } from './intent';

// Function words, articles, prepositions, pronouns, auxiliaries and openers.
// They carry no content: a rephrase that only reorders or re-connects the
// source's own words must not be rejected because it says "y" or "que".
//
// Exported so the list is auditable and testable: it is the only place where
// the check is allowed to be lenient.
export const ENTAILMENT_STOPWORDS: ReadonlySet<string> = new Set([
  // articles
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  // prepositions and contractions
  'de', 'del', 'con', 'para', 'por', 'en', 'al',
  // conjunctions
  'y', 'o', 'u',
  // relative / question markers
  'que', 'se',
  // pronouns
  'te', 'ti', 'tu', 'tus', 'me', 'mi', 'mis', 'nos', 'os', 'le', 'les', 'lo',
  // auxiliaries and copulas
  'a', 'es', 'son', 'esta', 'estan', 'ya', 'muy', 'mas',
  // discourse markers and openers
  'si', 'yes', 'claro', 'supuesto', 'ademas', 'tambien', 'oye', 'mira', 'bueno',
  'vale', 'gracias', 'hola', 'ahora', 'aqui', 'alli', 'cuando', 'donde', 'como',
  'porque', 'entonces', 'asi', 'algo', 'cada', 'todo', 'todos', 'todas', 'otro',
  'otra', 'otros', 'otras', 'mismo', 'misma', 'tan', 'tanto',
]);

export interface EntailmentVerdict {
  ok: boolean;
  // The candidate tokens the source does not support, deduplicated, in order of
  // first appearance, lowercased.
  unsupported: string[];
}

// Tokenizer shared by both sides of the check. It reuses the es-ES
// normalization of the engine (lowercase, accent-free) and splits on every
// non-alphanumeric character, so "500€" is the token "500" and "front-end" is
// "front" + "end". A token that carries a digit is a CONTENT token: an
// invented number is unsupported unless the source carries it too.
function tokenize(text: string): string[] {
  return normalizeEs(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length > 0);
}

// True when the candidate only uses terms the source supports.
//
// An empty (or whitespace-only) candidate is NOT ok: the caller must never
// send an empty message to the lead, so it is reported as a failed check with
// no unsupported tokens (there is nothing to point at).
export function checkEntailment(candidate: string, source: string): EntailmentVerdict {
  const candidateTokens = tokenize(candidate);
  if (candidateTokens.length === 0) return { ok: false, unsupported: [] };

  const sourceTokens = new Set(tokenize(source));
  const unsupported: string[] = [];
  for (const token of candidateTokens) {
    if (ENTAILMENT_STOPWORDS.has(token)) continue;
    if (sourceTokens.has(token)) continue;
    if (!unsupported.includes(token)) unsupported.push(token);
  }
  return { ok: unsupported.length === 0, unsupported };
}
