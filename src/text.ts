// Shared Spanish (es-ES) text normalization.
//
// This module exists so there is exactly ONE normalizer in the codebase. It
// lives in its own leaf module (it imports nothing) because both the trigger
// layer (src/rules.ts) and the intent layer (src/intent.ts) need it, and
// intent.ts already imports the trigger constants from rules.ts at module top
// level: rules.ts importing back from intent.ts would be an import cycle that
// crashes (TDZ) whenever rules.ts is the entry module.
//
// src/intent.ts re-exports normalizeEs, so the existing importers
// (src/agent.ts, src/entailment.ts, src/eval.ts, tests/rules.test.ts) keep
// working unchanged.

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
