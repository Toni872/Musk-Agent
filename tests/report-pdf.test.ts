import { describe, expect, it } from 'vitest';

import {
  buildConversationPdf,
  type ReportPayload,
  type ReportMessage,
} from '../src/report-pdf';

function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

function basePayload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    generatedAt: '2026-10-30T10:00:00.000Z',
    turnCount: 2,
    stopped: false,
    messages: [
      { role: 'lead', text: 'Hola, ¿qué formación tenéis?' },
      { role: 'agent', text: 'Tenemos cinco programas. ¿Quieres que te lo explique una persona?' },
    ],
    records: [
      {
        timestamp: '2026-10-30T10:00:01.000Z',
        kind: 'reply',
        intent: 'conversation',
        detail: 'respuesta generada',
      },
    ],
    doubts: ['precio (pendiente de confirmar)'],
    handoff: null,
    qualificationAnswers: [
      { questionId: 'interest', answer: 'videojuegos' },
    ],
    ...overrides,
  };
}

function validatePdf(bytes: Uint8Array): string {
  const text = decode(bytes);
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);
  const xrefOffset = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
  const size = Number(text.match(/\/Size (\d+)/)?.[1]);
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

describe('buildConversationPdf', () => {
  it('includes the whole conversation, metadata and sections', () => {
    const text = validatePdf(buildConversationPdf(basePayload()));
    expect(text).toContain('Conversación completa');
    expect(text).toContain('[Turno 1 · Lead] Hola, ¿qué formación tenéis?');
    expect(text).toContain('[Turno 2 · Agente] Tenemos cinco programas.');
    expect(text).toContain('Aviso comercial');
    expect(text).toContain('No se ha generado aviso en esta sesión.');
    expect(text).toContain('Respuestas de cualificación');
    expect(text).toContain('interest: videojuegos');
    expect(text).toContain('Registros cronológicos');
    expect(text).toContain('Dudas registradas');
    expect(text).toContain('precio \\(pendiente de confirmar\\)');
  });

  it('renders the commercial handoff when present', () => {
    const text = validatePdf(
      buildConversationPdf(
        basePayload({
          handoff: {
            reason: 'call_accepted',
            leadId: 'lead-42',
            contact: '+34600000000',
            bucket: 'ilocalizable',
            recipient: 'Laura',
            formation: 'videojuegos',
            summary: 'Quiere hablar con alguien',
            doubts: ['temario detallado'],
            afterHandoff: ['vale, gracias'],
          },
        }),
      ),
    );
    expect(text).toContain('Lead: lead-42');
    expect(text).toContain('Bolsa / origen: ilocalizables');
    expect(text).toContain('Destinataria: Laura');
    expect(text).toContain('Dudas en el momento del aviso');
    expect(text).toContain('Mensajes del lead tras el aviso');
  });

  it('paginates long conversations and stays structurally valid', () => {
    const messages: ReportMessage[] = Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 === 0 ? 'lead' : 'agent',
      text: `Mensaje ${i} con una longitud razonable para llenar varias líneas del informe de conversación.`,
    }));
    const text = validatePdf(buildConversationPdf(basePayload({ messages })));
    const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(pages);
    expect(text).toContain('Mensaje 149');
  });

  it('survives text that would break naive PDF writers', () => {
    const text = validatePdf(
      buildConversationPdf(
        basePayload({
          messages: [
            { role: 'lead', text: 'precio (100%) \\ copia "rara" — con guion' },
            { role: 'agent', text: 'Emoji 🙈 y acentos: áéíóú ñ' },
          ],
        }),
      ),
    );
    expect(text).toContain('\\(100%\\)');
    expect(text).toContain('\\\\ copia');
    expect(text).toContain('guion');
  });
});
