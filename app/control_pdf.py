"""Control document PDF: everything about access, technical and commands.

One place for Nicolas to hold the complete access picture: what is protected,
which environment variables and commands control it, where data and secrets
live, and which decisions are still open. The content is structured here (the
single source), rendered to PDF with reportlab, and regenerated with
``python -m app.control_pdf``. Standard Helvetica/Courier fonts keep the
WinAnsi-encoded Spanish accents working without embedding a Unicode font.
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from io import BytesIO
from pathlib import Path
from typing import cast

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Flowable,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Each section is a title plus blocks. A block is (kind, payload):
#   ("p", str)          paragraph
#   ("bullets", [str])  bullet list
#   ("code", str)       preformatted command block
#   ("table", [rows])   rows[0] is the header
_Section = tuple[str, list[tuple[str, object]]]

_CONTENT: list[_Section] = [
    (
        "1. Qué es este documento",
        [
            (
                "p",
                "Manual de control de accesos del agente MUSK: la superficie que hay que "
                "proteger, los candados ya implementados, las variables y los comandos que "
                "los gobiernan, dónde viven los datos y los secretos, y las decisiones que "
                "siguen abiertas. Fuente de la verdad: el código de app/; este PDF se "
                "regenera con python -m app.control_pdf.",
            ),
        ],
    ),
    (
        "2. Superficie de acceso (qué hay que controlar)",
        [
            (
                "bullets",
                [
                    "La aplicación (panel y API): protegida con cuentas por operador.",
                    "La base de datos: musk.db (local), el volumen musk-data (Docker) o Postgres (Vercel).",
                    "El proveedor de IA (Groq): recibe el texto del lead ya redactado.",
                    "El servidor/host: SSH, Docker y Caddy.",
                    "Los secretos: el fichero .env (git-ignored, nunca versionado).",
                ],
            ),
        ],
    ),
    (
        "3. Candados implementados",
        [
            (
                "table",
                [
                    ["Candado", "Qué protege"],
                    ["Auth fail-closed + cuentas por operador", "Nadie entra sin credencial; cada persona con su cuenta y registro de acceso."],
                    ["Sesión fuera de la URL", "El id de sesión viaja por cabecera (X-Session-Id), no por el enlace."],
                    ["Límite de peticiones", "30 peticiones por minuto por cliente."],
                    ["Límite de tamaño", "Cuerpo máximo 256 KiB; mensaje máximo 1000 caracteres."],
                    ["Retención y borrado", "90 días desde la última actividad; supresión por lead."],
                    ["Redacción antes del LLM", "Email, teléfono y DNI/NIE se tapan antes de salir."],
                    ["Copia de seguridad y restauración", "Snapshot consistente de la base y restauración probada."],
                    ["Cifrado en reposo", "Las copias van cifradas con MUSK_ENCRYPTION_KEY; el disco del host se cifra (LUKS/BitLocker)."],
                ],
            ),
        ],
    ),
    (
        "4. Variables de configuración",
        [
            (
                "table",
                [
                    ["Variable", "Qué controla", "Por defecto"],
                    ["MUSK_OPERATORS", "Cuentas por operador (nombre:contraseña, separadas por coma)", "vacío (usa la pareja única)"],
                    ["MUSK_BASIC_AUTH_USER / _PASSWORD", "Credencial única compartida (un solo operador)", "vacío"],
                    ["MUSK_PUBLIC_DEMO", "Demo pública sin auth (solo datos sintéticos)", "false"],
                    ["MUSK_RETENTION_DAYS", "Días de conservación desde la última actividad", "90"],
                    ["MUSK_ENCRYPTION_KEY", "Clave Fernet que cifra las copias de seguridad", "vacío (copias sin cifrar)"],
                    ["DATABASE_URL", "Ubicación de la base de datos", "SQLite local"],
                    ["MUSK_LLM_BASE_URL / _API_KEY", "Proveedor del LLM (sin ellos, modo determinista)", "vacío"],
                    ["MUSK_LLM_MODEL", "Modelo del proveedor", "openai/gpt-oss-120b"],
                    ["LOG_LEVEL", "Nivel de log; la auditoría de accesos se ve en INFO", "WARNING"],
                    ["MUSK_DOMAIN", "Dominio para el certificado TLS de Caddy", "vacío"],
                    ["FORWARDED_ALLOW_IPS", "IPs que pueden enviar X-Forwarded-For", "rangos privados"],
                ],
            ),
        ],
    ),
    (
        "5. Comandos de control",
        [
            ("p", "Arranque local:"),
            ("code", "uv run uvicorn app.main:app --reload --port 4173"),
            ("p", "Arranque en Docker:"),
            ("code", "docker compose up -d --build"),
            ("p", "Verificación (definición de hecho):"),
            (
                "code",
                "uv run ruff check .\n"
                "uv run mypy app\n"
                "uv run pytest\n"
                "uv run python -m app.eval\n"
                "uv run python -m app.pilot_gate\n"
                "docker compose config",
            ),
            ("p", "Retención y borrado (sin --yes no borra nada):"),
            (
                "code",
                "uv run python -m app.retention --dry-run\n"
                "uv run python -m app.retention --yes\n"
                "uv run python -m app.retention --lead <lead_id> --yes\n"
                "uv run python -m app.retention --days 30 --yes",
            ),
            ("p", "Copias de seguridad (la restauración es en frío: parar la app antes):"),
            (
                "code",
                "uv run python -m app.backup create\n"
                "uv run python -m app.backup verify --file backups/musk-<fecha>.db\n"
                "uv run python -m app.backup restore --file backups/musk-<fecha>.db",
            ),
            ("p", "Clave de cifrado de las copias (generar una vez y guardarla en .env):"),
            (
                "code",
                "uv run python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
            ),
            ("p", "En Docker, los comandos corren dentro del contenedor:"),
            (
                "code",
                "docker compose exec app uv run python -m app.retention --dry-run\n"
                "docker compose exec app uv run python -m app.backup create "
                "--db /data/musk.db --dir /data/backups",
            ),
        ],
    ),
    (
        "6. Endpoints",
        [
            (
                "bullets",
                [
                    "/health — público (sonda del contenedor).",
                    "/ — interfaz (protegida).",
                    "/chat, /sessions, /session, /session/state, /session/pdf, /report.pdf — protegidos.",
                ],
            ),
        ],
    ),
    (
        "7. Dónde vive cada cosa",
        [
            (
                "bullets",
                [
                    "Secretos: .env (local, git-ignored), incluida MUSK_ENCRYPTION_KEY. Nunca se versionan ni se publican.",
                    "Base local: ./musk.db. En Docker: /data/musk.db, volumen musk-data.",
                    "Copias: directorio backups/ (local) o /data/backups (Docker), git-ignored; con MUSK_ENCRYPTION_KEY quedan como .db.enc.",
                    "Código de seguridad: app/auth.py, app/limits.py, app/retention.py, app/redaction.py, app/backup.py.",
                    "Procedimientos: docs/operacion/ (retención, endurecimiento, reset).",
                ],
            ),
        ],
    ),
    (
        "8. Decisiones abiertas (son de MUSK)",
        [
            (
                "bullets",
                [
                    "Plazo definitivo de retención (propuesto: 90 días).",
                    "Proveedor del LLM y firma del contrato (DPA).",
                    "Base legal y texto de transparencia al lead.",
                    "Lista definitiva de operadores (quiénes y sus contraseñas).",
                ],
            ),
        ],
    ),
    (
        "9. Cómo verificar que todo está bien",
        [
            (
                "p",
                "La suite completa en verde (uv run pytest), el análisis de tipos (uv run "
                "mypy app) y el linter (uv run ruff check .) limpios, la evaluación de "
                "recuperación sin regresiones (uv run python -m app.eval) y el gate del "
                "piloto sin disparadores (uv run python -m app.pilot_gate). Una copia "
                "recién hecha se comprueba con uv run python -m app.backup verify.",
            ),
        ],
    ),
]

_HEADING = "MUSK control de accesos — técnico y comandos"


def _build_story() -> list[Flowable]:
    styles = getSampleStyleSheet()
    title = styles["Title"]
    heading = styles["Heading2"]
    normal = styles["Normal"]
    bullet = ParagraphStyle("bullet", parent=normal, leftIndent=0.8 * cm, bulletIndent=0.2 * cm)
    code = ParagraphStyle(
        "code",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=8.5,
        leading=11,
    )

    story: list[Flowable] = [
        Paragraph(_HEADING, title),
        Spacer(1, 0.3 * cm),
    ]

    for section_title, blocks in _CONTENT:
        story.append(Paragraph(section_title, heading))
        story.append(Spacer(1, 0.15 * cm))
        for kind, payload in blocks:
            if kind == "p":
                story.append(Paragraph(str(payload), normal))
            elif kind == "bullets":
                for item in cast(list[str], payload):
                    story.append(Paragraph(f"• {item}", bullet))
            elif kind == "code":
                story.append(Preformatted(str(payload), code))
            elif kind == "table":
                rows = cast(list[list[str]], payload)
                table = Table(rows, colWidths=None, hAlign="LEFT")
                table.setStyle(
                    TableStyle(
                        [
                            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                            ("FONTSIZE", (0, 0), (-1, -1), 8),
                            ("LEADING", (0, 0), (-1, -1), 10),
                            ("GRID", (0, 0), (-1, -1), 0.4, "#bbbbbb"),
                            ("BACKGROUND", (0, 0), (-1, 0), "#eeeeee"),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("TOPPADDING", (0, 0), (-1, -1), 3),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                            ("LEFTPADDING", (0, 0), (-1, -1), 4),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(table)
            story.append(Spacer(1, 0.12 * cm))
        story.append(Spacer(1, 0.25 * cm))

    return story


def build_control_pdf() -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title="MUSK control de accesos — técnico y comandos",
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    doc.build(_build_story())
    return buffer.getvalue()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.control_pdf",
        description="Genera el PDF de control de accesos (técnico y comandos).",
    )
    parser.add_argument(
        "--output",
        default="docs/operacion/control-accesos-musk.pdf",
        help="ruta del PDF a generar",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(build_control_pdf())
    print(f"PDF generado: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
