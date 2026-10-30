// Builds the operator report as PDF bytes.
//
// Kept separate from the DOM layer so the whole report (content, ordering,
// pagination) is testable in Node without a browser. ui/main.ts only turns the
// returned bytes into a download.

import { renderPdf, type PdfBlock } from './pdf';

export interface ReportMessage {
  role: string;
  text: string;
}

export interface ReportRecord {
  timestamp?: string;
  kind: string;
  intent?: string;
  detail: string;
}

export interface ReportHandoff {
  reason: string;
  leadId: string;
  contact?: string;
  bucket?: string;
  recipient?: string;
  formation?: string;
  summary?: string;
  doubts?: string[];
  afterHandoff?: string[];
}

export interface ReportQualification {
  questionId: string;
  answer: string;
}

export interface ReportPayload {
  generatedAt: string;
  turnCount: number;
  stopped: boolean;
  messages: ReportMessage[];
  records: ReportRecord[];
  doubts: string[];
  handoff: ReportHandoff | null;
  qualificationAnswers: ReportQualification[];
}

const ROLE_LABELS: Record<string, string> = {
  lead: 'Lead',
  agent: 'Agente',
  diagnostic: 'Operador',
  info: 'Aviso',
};

const BUCKET_LABELS: Record<string, string> = {
  ilocalizable: 'ilocalizables',
  no_comprador: 'no compradores',
  noComprador: 'no compradores',
};

function formatDate(value: string | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-ES');
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function handoffBlocks(handoff: ReportHandoff | null): PdfBlock[] {
  const blocks: PdfBlock[] = [{ kind: 'heading', text: 'Aviso comercial' }];
  if (!handoff) {
    blocks.push({ kind: 'text', text: 'No se ha generado aviso en esta sesión.' });
    return blocks;
  }
  blocks.push({ kind: 'text', text: `Motivo: ${handoff.reason}` });
  blocks.push({ kind: 'text', text: `Lead: ${handoff.leadId}` });
  blocks.push({ kind: 'text', text: `Contacto: ${handoff.contact || '-'}` });
  const bucket = handoff.bucket ? BUCKET_LABELS[handoff.bucket] ?? handoff.bucket : '-';
  blocks.push({ kind: 'text', text: `Bolsa / origen: ${bucket}` });
  blocks.push({ kind: 'text', text: `Destinataria: ${handoff.recipient || '-'}` });
  blocks.push({ kind: 'text', text: `Formación detectada: ${handoff.formation || '-'}` });
  blocks.push({ kind: 'text', text: `Resumen para el comercial: ${handoff.summary || '-'}` });
  return blocks;
}

export function buildConversationPdf(payload: ReportPayload): Uint8Array {
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Informe de conversación · Agente MUSK' },
    { kind: 'text', text: `Fecha de generación: ${formatDate(payload.generatedAt)}` },
    {
      kind: 'text',
      text: `Turnos: ${payload.turnCount} · Detenido: ${
        payload.stopped ? 'Sí' : 'No'
      } · Registros: ${payload.records.length} · Dudas: ${payload.doubts.length}`,
    },
    { kind: 'spacer', height: 6 },
    { kind: 'heading', text: 'Conversación completa' },
  ];

  if (payload.messages.length === 0) {
    blocks.push({ kind: 'text', text: 'Sin mensajes.' });
  } else {
    payload.messages.forEach((message, index) => {
      blocks.push({
        kind: 'text',
        text: `[Turno ${index + 1} · ${roleLabel(message.role)}] ${message.text}`,
      });
    });
  }

  blocks.push(...handoffBlocks(payload.handoff));

  if (payload.qualificationAnswers.length > 0) {
    blocks.push({ kind: 'heading', text: 'Respuestas de cualificación' });
    payload.qualificationAnswers.forEach((qa) => {
      blocks.push({ kind: 'text', text: `${qa.questionId}: ${qa.answer}` });
    });
  }

  if (payload.handoff?.doubts && payload.handoff.doubts.length > 0) {
    blocks.push({ kind: 'heading', text: 'Dudas en el momento del aviso' });
    payload.handoff.doubts.forEach((doubt) => blocks.push({ kind: 'text', text: `- ${doubt}` }));
  }

  if (payload.handoff?.afterHandoff && payload.handoff.afterHandoff.length > 0) {
    blocks.push({ kind: 'heading', text: 'Mensajes del lead tras el aviso' });
    payload.handoff.afterHandoff.forEach((message) =>
      blocks.push({ kind: 'text', text: `- ${message}` }),
    );
  }

  blocks.push({ kind: 'heading', text: 'Registros cronológicos' });
  if (payload.records.length === 0) {
    blocks.push({ kind: 'text', text: 'Sin registros.' });
  } else {
    payload.records.forEach((record) => {
      const intent = record.intent ? ` (${record.intent})` : '';
      blocks.push({
        kind: 'text',
        text: `${formatDate(record.timestamp)} · ${record.kind}${intent} · ${record.detail}`,
      });
    });
  }

  blocks.push({ kind: 'heading', text: 'Dudas registradas' });
  if (payload.doubts.length === 0) {
    blocks.push({ kind: 'text', text: 'Sin dudas registradas.' });
  } else {
    payload.doubts.forEach((doubt, index) => {
      blocks.push({ kind: 'text', text: `${index + 1}. ${doubt}` });
    });
  }

  return renderPdf(blocks);
}
