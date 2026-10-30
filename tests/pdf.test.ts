import { describe, expect, it } from 'vitest';

import { renderPdf, wrapText, type PdfBlock } from '../src/pdf';

// Decodes the produced bytes with latin1 so the PDF source can be asserted as
// text: the content streams are uncompressed, so the text is literally there.
function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

// Structural validation: the classic failure of a hand-written PDF is a wrong
// byte offset in the cross-reference table, which makes readers refuse the file.
function validatePdf(bytes: Uint8Array): string {
  const text = decode(bytes);
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);

  const startxref = text.match(/startxref\n(\d+)\n%%EOF\n$/);
  expect(startxref).not.toBeNull();
  const xrefOffset = Number(startxref?.[1]);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');

  const size = Number(text.match(/\/Size (\d+)/)?.[1]);
  expect(Number.isInteger(size)).toBe(true);

  const entries = text
    .slice(xrefOffset)
    .split('\n')
    .filter((line) => /^\d{10} \d{5} [nf] $/.test(line));
  expect(entries.length).toBe(size);

  for (let n = 1; n < size; n += 1) {
    const offset = Number(entries[n]?.slice(0, 10));
    expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
  }
  return text;
}

const SIMPLE: PdfBlock[] = [
  { kind: 'title', text: 'Informe de prueba' },
  { kind: 'text', text: 'Línea con acentos: áéíóú ñ ¿pregunta? ¡ya!' },
  { kind: 'heading', text: 'Sección' },
  { kind: 'text', text: 'Paréntesis (como este) y barra \\ invertida.' },
];

describe('renderPdf', () => {
  it('produces a structurally valid single-page PDF', () => {
    const text = validatePdf(renderPdf(SIMPLE));
    expect(text).toContain('Informe de prueba');
    expect(text).toContain('/Count 1');
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(1);
  });

  it('keeps Spanish punctuation and accents as single WinAnsi bytes', () => {
    const raw = renderPdf(SIMPLE);
    const text = decode(raw);
    expect(text).toContain('Línea con acentos: áéíóú ñ ¿pregunta? ¡ya!');
    // Every byte is encodable by the font: nothing above 0xFF and no stray BOM.
    expect(Array.from(raw).every((byte) => byte <= 0xff)).toBe(true);
  });

  it('escapes parentheses and backslashes in the content stream', () => {
    const text = decode(renderPdf(SIMPLE));
    expect(text).toContain('\\(como este\\)');
    expect(text).toContain('\\\\ invertida');
  });

  it('paginates when content does not fit on one page', () => {
    const blocks: PdfBlock[] = [{ kind: 'title', text: 'Largo' }];
    for (let i = 0; i < 200; i += 1) {
      blocks.push({ kind: 'text', text: `Mensaje número ${i} con texto suficiente para ocupar una línea entera del informe.` });
    }
    const text = validatePdf(renderPdf(blocks));
    const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(pages);
  });

  it('always emits at least one page, even with no content', () => {
    const text = validatePdf(renderPdf([]));
    expect(text).toContain('/Count 1');
  });

  it('replaces characters the font cannot render', () => {
    expect(wrapText('hola \u{1F600} mundo', 10, false)).toEqual(['hola ? mundo']);
    expect(wrapText('guion \u2014 largo', 10, false)).toEqual(['guion - largo']);
  });
});

describe('wrapText', () => {
  it('keeps explicit line breaks, including empty paragraphs', () => {
    expect(wrapText('uno\n\ndos', 10, false)).toEqual(['uno', '', 'dos']);
  });

  it('hard-breaks a word wider than the page', () => {
    const lines = wrapText('x'.repeat(3000), 10, false);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(100);
  });

  it('wraps long paragraphs without losing words', () => {
    const words = Array.from({ length: 120 }, (_, i) => `palabra${i}`);
    const lines = wrapText(words.join(' '), 10, false);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(words.join(' '));
  });
});
