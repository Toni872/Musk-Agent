"""Tests for the PDF export (app.pdf)."""

from __future__ import annotations

from app.agent import HandoffContext
from app.models import ReportMessage, ReportPayload, ReportRecord
from app.pdf import build_conversation_pdf, build_handoff_pdf


def _handoff() -> HandoffContext:
    return HandoffContext(
        reason="call_accepted",
        lead_id="lead-1",
        contact="+34600000000",
        bucket="ilocalizable",
        last_message="llámame mañana por la tarde",
        summary="Formación tecnológica de Escuela Musk: el lead aceptó la llamada.",
        formation="Formación tecnológica de Escuela Musk",
        doubts=("¿cuánto cuesta?",),
    )


def test_handoff_pdf_is_a_valid_pdf_document() -> None:
    pdf = build_handoff_pdf(_handoff())
    assert pdf.startswith(b"%PDF")
    assert pdf.rstrip().endswith(b"%%EOF")


def test_handoff_pdf_has_substantive_content() -> None:
    pdf = build_handoff_pdf(_handoff())
    # reportlab compresses the content streams, so the text is not greppable as
    # raw bytes; the document still has a non-trivial structure and size.
    assert len(pdf) > 500
    assert b"/Info" in pdf and b"/Root" in pdf


def _report() -> ReportPayload:
    return ReportPayload(
        generated_at="2026-11-10T16:00:00+00:00",
        turn_count=1,
        stopped=False,
        messages=[
            ReportMessage(role="lead", text="hola"),
            ReportMessage(role="agent", text="¿te paso con el equipo?"),
        ],
        records=[
            ReportRecord(
                kind="reply",
                intent="conversation",
                detail="respuesta",
                timestamp="2026-11-10T16:00:00+00:00",
            )
        ],
        doubts=["¿cuánto cuesta?"],
        handoff=None,
    )


def test_conversation_pdf_is_a_valid_pdf_document() -> None:
    pdf = build_conversation_pdf(_report())
    assert pdf.startswith(b"%PDF")
    assert pdf.rstrip().endswith(b"%%EOF")
    assert len(pdf) > 500
