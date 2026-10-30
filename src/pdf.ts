// Minimal PDF writer for the operator report.
//
// The project deliberately avoids runtime dependencies (see the hand-written
// BM25 in src/retrieval.ts), so this module writes the PDF bytes itself instead
// of pulling in pdf-lib/jsPDF. Scope is intentionally small: a text-only, A4,
// multi-page document using the standard Helvetica fonts with WinAnsi encoding.
//
// WinAnsi and Latin-1 agree on 0x20-0x7E and 0xA0-0xFF, which covers Spanish
// accents and "¿ ¡". Anything outside that range is transliterated or replaced
// with "?" so we never emit bytes the font cannot render.

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 48;
const LINE_GAP = 0;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

// Helvetica advance widths (units per 1000 em) for printable ASCII, 32..126.
// Values >= 160 fall back to 600, which is wider than every Latin-1 glyph we
// render, so wrapping errs on the short side and text never spills the margin.
const HELVETICA_ASCII_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Helvetica-Bold is wider than regular for most glyphs; a small factor keeps
// bold headings inside the same measurement path without a second width table.
const BOLD_WIDTH_FACTOR = 1.06;

const CHAR_REPLACEMENTS: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u00a0': ' ',
  '\u2022': '-',
  '\u20ac': 'EUR',
  '\u2192': '->',
  '\u2265': '>=',
  '\u2264': '<=',
};

export type PdfBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'spacer'; height?: number };

interface TextStyle {
  size: number;
  bold: boolean;
  lineHeight: number;
  gapBefore: number;
  gapAfter: number;
}

const TITLE: TextStyle = { size: 17, bold: true, lineHeight: 22, gapBefore: 0, gapAfter: 10 };
const HEADING: TextStyle = { size: 12, bold: true, lineHeight: 16, gapBefore: 14, gapAfter: 6 };
const BODY: TextStyle = { size: 10, bold: false, lineHeight: 14, gapBefore: 0, gapAfter: 4 };

// Reduces arbitrary text to characters that WinAnsi can encode, mapping the
// common typographic characters the model or the operator may produce.
function sanitize(text: string): string {
  let out = '';
  for (const ch of text) {
    const replacement = CHAR_REPLACEMENTS[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code === 10) {
      out += '\n';
    } else if (code === 9) {
      out += '  ';
    } else if (code < 32 || (code >= 0x7f && code <= 0x9f)) {
      out += ' ';
    } else if (code <= 0xff) {
      out += ch;
    } else {
      out += '?';
    }
  }
  return out;
}

function measure(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 32;
    const width =
      code >= 32 && code <= 126 ? HELVETICA_ASCII_WIDTHS[code - 32] ?? 600 : 600;
    units += width;
  }
  return (units / 1000) * size * (bold ? BOLD_WIDTH_FACTOR : 1);
}

function hardBreak(word: string, size: number, bold: boolean): string[] {
  const pieces: string[] = [];
  let rest = word;
  while (measure(rest, size, bold) > CONTENT_WIDTH) {
    let cut = rest.length;
    while (cut > 1 && measure(rest.slice(0, cut), size, bold) > CONTENT_WIDTH) cut -= 1;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  pieces.push(rest);
  return pieces;
}

export function wrapText(text: string, size: number, bold: boolean): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split('\n')) {
    const words = paragraph.split(' ').filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (measure(candidate, size, bold) <= CONTENT_WIDTH) {
        line = candidate;
        continue;
      }
      if (line.length > 0) lines.push(line);
      const pieces = hardBreak(word, size, bold);
      const tail = pieces.pop() ?? '';
      lines.push(...pieces);
      line = tail;
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes.push(code <= 0xff ? code : 63);
  }
  return bytes;
}

export function renderPdf(blocks: PdfBlock[]): Uint8Array {
  const pages: string[] = [];
  let current: string[] = [];
  let y = A4_HEIGHT - MARGIN;

  const flush = (): void => {
    pages.push(current.join('\n'));
    current = [];
    y = A4_HEIGHT - MARGIN;
  };

  for (const block of blocks) {
    if (block.kind === 'spacer') {
      y -= block.height ?? 8;
      continue;
    }
    const style = block.kind === 'title' ? TITLE : block.kind === 'heading' ? HEADING : BODY;
    y -= style.gapBefore;
    for (const line of wrapText(block.text, style.size, style.bold)) {
      if (y - style.lineHeight < MARGIN) flush();
      const font = style.bold ? 'F2' : 'F1';
      const text = escapePdf(line);
      current.push(
        `BT /${font} ${style.size} Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${y.toFixed(2)} Tm (${text}) Tj ET`,
      );
      y -= style.lineHeight + LINE_GAP;
    }
    y -= style.gapAfter;
  }
  if (current.length > 0 || pages.length === 0) flush();

  const streams = pages.map((content) => {
    const data = toBytes(content);
    return { length: data.length, body: content };
  });

  const pageCount = streams.length;
  const objects: Array<{ n: number; body: string }> = [
    { n: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    {
      n: 2,
      body: `<< /Type /Pages /Kids [${streams
        .map((_, index) => `${5 + index * 2} 0 R`)
        .join(' ')}] /Count ${pageCount} >>`,
    },
    {
      n: 3,
      body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    },
    {
      n: 4,
      body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    },
  ];

  streams.forEach((stream, index) => {
    const pageNumber = 5 + index * 2;
    const contentNumber = pageNumber + 1;
    objects.push({
      n: pageNumber,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    });
    objects.push({
      n: contentNumber,
      body: `<< /Length ${stream.length} >>\nstream\n${stream.body}\nendstream`,
    });
  });

  objects.sort((a, b) => a.n - b.n);
  const size = (objects.at(-1)?.n ?? 0) + 1;

  const bytes: number[] = [];
  const push = (text: string): void => {
    for (const byte of toBytes(text)) bytes.push(byte);
  };

  push('%PDF-1.4\n');
  const offsets = new Map<number, number>();
  for (const object of objects) {
    offsets.set(object.n, bytes.length);
    push(`${object.n} 0 obj\n${object.body}\nendobj\n`);
  }

  const xrefOffset = bytes.length;
  push(`xref\n0 ${size}\n`);
  push('0000000000 65535 f \n');
  for (let n = 1; n < size; n += 1) {
    push(`${String(offsets.get(n) ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Uint8Array.from(bytes);
}
