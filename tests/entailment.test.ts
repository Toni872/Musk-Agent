// Tests for the grounding check of the LLM layer (Phase 1).
//
// The check is the mechanical part of the "the model may only WORD the
// approved answer" contract: every content token of the model's answer must
// already exist in the approved source. It is what catches the leaks the
// output guard could not see (a number, a price word, a term copied from
// another FAQ entry).
//
// All tests run offline: no network, no LLM, no API key.

import { describe, expect, it } from 'vitest';

import { checkEntailment, ENTAILMENT_STOPWORDS } from '../src/entailment';

// A real approved answer (the 'modalidad' entry of the approved profile).
const SOURCE =
  'La formación es online, con clases en directo y workshops, además de recursos y una comunidad de desarrollo. Los detalles de horarios y disponibilidad los concretamos contigo en una llamada.';

describe('grounding: la reformulación no puede añadir contenido', () => {
  // 1. A faithful rephrase (the source's own words, reordered) is grounded:
  //    it says the same thing with the same terms.
  it('una reformulación fiel (las mismas palabras, reordenadas) está fundamentada', () => {
    const candidate =
      'Los detalles de horarios y disponibilidad los concretamos contigo en una llamada: la formación es online, con clases en directo y workshops.';
    const verdict = checkEntailment(candidate, SOURCE);
    expect(verdict.ok).toBe(true);
    expect(verdict.unsupported).toEqual([]);
  });

  // 2. A rephrase that adds a number invents a figure: the source does not
  //    carry it, so it is reported as unsupported. This is the leak the
  //    output guard could not see on its own (a bare number matches no
  //    forbidden pattern).
  it('una reformulación que añade un número lo reporta como no respaldado', () => {
    const candidate = 'La formación es online, con clases en directo, y cuesta 500 euros.';
    const verdict = checkEntailment(candidate, SOURCE);
    expect(verdict.ok).toBe(false);
    expect(verdict.unsupported).toContain('500');
  });

  // 3. A rephrase that copies a term from ANOTHER content entry is reported
  //    too: the source does not support it.
  it('una reformulación con una palabra de otra entrada la reporta como no respaldada', () => {
    const candidate =
      'La formación es online, con clases en directo y workshops, y además usas Steam y Discord para practicar.';
    const verdict = checkEntailment(candidate, SOURCE);
    expect(verdict.ok).toBe(false);
    expect(verdict.unsupported).toContain('steam');
    expect(verdict.unsupported).toContain('discord');
  });

  // 4. Function words and discourse markers carry no content: they must not
  //    break the check on their own.
  it('los marcadores del discurso y las palabras función no rompen la comprobación', () => {
    const candidate = 'y el la de que con para por en o u se te ti tu';
    const verdict = checkEntailment(candidate, SOURCE);
    expect(verdict.ok).toBe(true);
    expect(verdict.unsupported).toEqual([]);
  });

  // 5. An empty candidate is never ok: the caller must not send an empty
  //    message to the lead.
  it('una candidata vacía no está fundamentada', () => {
    const verdict = checkEntailment('   ', SOURCE);
    expect(verdict.ok).toBe(false);
    expect(verdict.unsupported).toEqual([]);
  });

  // 6. The same candidate IS grounded against a source that carries its
  //    terms: the check measures the pair, not the candidate.
  it('la misma candidata sí pasa cuando la fuente sí contiene lo que dice', () => {
    const candidate = 'Además usas Steam y Discord para practicar.';
    const sourceWithTools =
      'La formación es online, con clases en directo y workshops, y además usas Steam y Discord para practicar.';
    const verdict = checkEntailment(candidate, sourceWithTools);
    expect(verdict.ok).toBe(true);
    expect(verdict.unsupported).toEqual([]);
  });

  // 7. The stopword list is exported and auditable: it is the only place
  //    where the check is allowed to be lenient.
  it('la lista de palabras vacías es explícita y auditable', () => {
    expect(ENTAILMENT_STOPWORDS.has('el')).toBe(true);
    expect(ENTAILMENT_STOPWORDS.has('y')).toBe(true);
    expect(ENTAILMENT_STOPWORDS.has('claro')).toBe(true);
    expect(ENTAILMENT_STOPWORDS.has('cuesta')).toBe(false);
    expect(ENTAILMENT_STOPWORDS.has('500')).toBe(false);
  });

  // 8. The unsupported tokens come back deduplicated and lowercased, in order
  //    of first appearance.
  it('los tokens no respaldados vuelven deduplicados y en minúsculas', () => {
    const candidate = 'Steam, steam y STEAM, más Steam.';
    const verdict = checkEntailment(candidate, SOURCE);
    expect(verdict.unsupported).toEqual(['steam']);
  });
});
