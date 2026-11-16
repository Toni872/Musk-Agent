"""The control document PDF builds and the CLI writes it."""

from pathlib import Path

from app.control_pdf import build_control_pdf, main


def test_control_pdf_is_a_valid_document() -> None:
    pdf = build_control_pdf()
    assert pdf.startswith(b"%PDF")
    assert pdf.rstrip().endswith(b"%%EOF")
    assert len(pdf) > 500


def test_control_pdf_cli_writes_the_file(tmp_path: Path) -> None:
    output = tmp_path / "control.pdf"
    assert main(["--output", str(output)]) == 0
    assert output.read_bytes().startswith(b"%PDF")
