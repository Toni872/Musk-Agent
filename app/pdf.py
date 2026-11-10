"""PDF export (reportlab): the commercial-facing handoff notice.

Spanish (es-ES) content, WinAnsi-encoded standard fonts (Helvetica), so the
accents render without embedding a Unicode font. Every lead-facing string is
HTML-escaped before it reaches the Paragraph markup.
"""

from __future__ import annotations

from html import escape
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer

from app.agent import HandoffContext
from app.models import ReportPayload


def build_handoff_pdf(handoff: HandoffContext) -> bytes:
    """Render the handoff notice as a single A4 PDF for the commercial."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title="Aviso de derivación — MUSK",
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    heading = styles["Heading2"]
    normal = styles["Normal"]

    reason_label = (
        "El lead pidió hablar con una persona"
        if handoff.reason == "human_requested"
        else "El lead aceptó una llamada"
    )

    story: list[Flowable] = [
        Paragraph("Aviso de derivación — MUSK", title),
        Spacer(1, 0.4 * cm),
        Paragraph(reason_label, heading),
        Spacer(1, 0.2 * cm),
        Paragraph(f"<b>Formación:</b> {escape(handoff.formation)}", normal),
        Paragraph(f"<b>Contacto:</b> {escape(handoff.contact)}", normal),
        Paragraph(f"<b>Bolsa de origen:</b> {escape(handoff.bucket)}", normal),
        Spacer(1, 0.3 * cm),
        Paragraph("<b>Resumen para el comercial:</b>", heading),
        Paragraph(escape(handoff.summary), normal),
        Spacer(1, 0.3 * cm),
    ]

    if handoff.doubts:
        story.append(Paragraph("<b>Dudas registradas:</b>", heading))
        for doubt in handoff.doubts:
            story.append(Paragraph(f"- {escape(doubt)}", normal))
        story.append(Spacer(1, 0.3 * cm))

    story.append(
        Paragraph(f"<b>Último mensaje del lead:</b> {escape(handoff.last_message)}", normal)
    )

    doc.build(story)
    return buffer.getvalue()


_ROLE_LABELS = {"lead": "Lead", "agent": "Agente", "diagnostic": "Operador", "info": "Aviso"}
_BUCKET_LABELS = {"ilocalizable": "ilocalizables", "no_comprador": "no compradores"}


def _bucket_label(bucket: str) -> str:
    return _BUCKET_LABELS.get(bucket, bucket)


def build_conversation_pdf(payload: ReportPayload) -> bytes:
    """Render the full operator report (conversation + records) as one A4 PDF."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title="Informe de conversación — MUSK",
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title = styles["Title"]
    heading = styles["Heading2"]
    normal = styles["Normal"]

    stopped = "Sí" if payload.stopped else "No"
    story: list[Flowable] = [
        Paragraph("Informe de conversación · Agente MUSK", title),
        Paragraph(f"Fecha de generación: {escape(payload.generated_at)}", normal),
        Paragraph(
            f"Turnos: {payload.turn_count} · Detenido: {stopped}"
            f" · Registros: {len(payload.records)} · Dudas: {len(payload.doubts)}",
            normal,
        ),
        Spacer(1, 0.3 * cm),
        Paragraph("Conversación completa", heading),
    ]

    if not payload.messages:
        story.append(Paragraph("Sin mensajes.", normal))
    else:
        for index, message in enumerate(payload.messages):
            role = _ROLE_LABELS.get(message.role, message.role)
            story.append(
                Paragraph(f"[Turno {index + 1} · {escape(role)}] {escape(message.text)}", normal)
            )

    story.append(Paragraph("Aviso comercial", heading))
    handoff = payload.handoff
    if handoff is None:
        story.append(Paragraph("No se ha generado aviso en esta sesión.", normal))
    else:
        story.append(Paragraph(f"Motivo: {escape(handoff.reason)}", normal))
        story.append(Paragraph(f"Lead: {escape(handoff.lead_id)}", normal))
        story.append(Paragraph(f"Contacto: {escape(handoff.contact or '-')}", normal))
        story.append(Paragraph(f"Bolsa / origen: {escape(_bucket_label(handoff.bucket))}", normal))
        story.append(Paragraph(f"Destinataria: {escape(handoff.recipient or '-')}", normal))
        story.append(Paragraph(f"Formación detectada: {escape(handoff.formation or '-')}", normal))
        story.append(
            Paragraph(f"Resumen para el comercial: {escape(handoff.summary or '-')}", normal)
        )

    if payload.qualification_answers:
        story.append(Paragraph("Respuestas de cualificación", heading))
        for qa in payload.qualification_answers:
            story.append(Paragraph(f"{escape(qa.question_id)}: {escape(qa.answer)}", normal))

    if handoff is not None and handoff.doubts:
        story.append(Paragraph("Dudas en el momento del aviso", heading))
        for doubt in handoff.doubts:
            story.append(Paragraph(f"- {escape(doubt)}", normal))

    if handoff is not None and handoff.after_handoff:
        story.append(Paragraph("Mensajes del lead tras el aviso", heading))
        for after_message in handoff.after_handoff:
            story.append(Paragraph(f"- {escape(after_message)}", normal))

    story.append(Paragraph("Registros cronológicos", heading))
    if not payload.records:
        story.append(Paragraph("Sin registros.", normal))
    else:
        for record in payload.records:
            intent = f" ({record.intent})" if record.intent else ""
            story.append(
                Paragraph(
                    f"{escape(record.timestamp or '-')} · {escape(record.kind)}"
                    f"{escape(intent)} · {escape(record.detail)}",
                    normal,
                )
            )

    story.append(Paragraph("Dudas registradas", heading))
    if not payload.doubts:
        story.append(Paragraph("Sin dudas registradas.", normal))
    else:
        for index, doubt in enumerate(payload.doubts):
            story.append(Paragraph(f"{index + 1}. {escape(doubt)}", normal))

    doc.build(story)
    return buffer.getvalue()
