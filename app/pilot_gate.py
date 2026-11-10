"""Deployment-exposure gate for the MUSK simulator.

A published simulator is public: anyone with the URL can open it. The bundle
carries curated, digit-free content and no real leads, but it is still exposed.
The moment that stops being acceptable, the deployment has to sit behind TLS and
authentication *before* the next publish.

This gate is the reminder, and it is deliberately not prose: it runs on every
push (a red CI run is the notification) and can be run before every deploy with
``uv run python -m app.pilot_gate``.

What the repository can prove is that real configuration has been committed,
which is signal enough for the boundary this gate protects. It cannot prove that
real lead data crossed the boundary: that condition stays manual in
``docs/operacion/checklist-canal-real.md``.

Escape hatch: once protection is in place, set ``PILOT_GATE_ACK=1`` in the CI
workflow. That single line is the auditable record that the decision was made.
"""

from __future__ import annotations

import os
import re
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

_ENV_FILE = re.compile(r"(^|/)\.env(\.[^/]*)?$")


@dataclass(frozen=True)
class PilotGateSignals:
    committed_env_files: tuple[str, ...]


@dataclass(frozen=True)
class PilotGateResult:
    triggered: bool
    reasons: tuple[str, ...]


def evaluate_pilot_gate(signals: PilotGateSignals) -> PilotGateResult:
    """Decide whether the gate must block a publish, with its reasons."""
    reasons: list[str] = []
    if signals.committed_env_files:
        reasons.append(
            "Hay configuracion real versionada: "
            + ", ".join(signals.committed_env_files)
            + "."
        )
    return PilotGateResult(triggered=bool(reasons), reasons=tuple(reasons))


def read_committed_env_files(tracked_files: Sequence[str]) -> tuple[str, ...]:
    """Tracked ``.env`` files, at any depth, ignoring the ``.env.example`` template."""
    return tuple(
        file
        for file in tracked_files
        if _ENV_FILE.search(file) and not file.endswith(".env.example")
    )


def read_tracked_files() -> tuple[str, ...]:
    try:
        completed = subprocess.run(
            ["git", "ls-files"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        # No git (tarball, CI checkout without history, etc.). The signal cannot
        # be checked, so report it as such instead of pretending it is clean.
        return (".env (no verificable: git no disponible)",)
    return tuple(line for line in completed.stdout.splitlines() if line)


def collect_signals() -> PilotGateSignals:
    """Tracked files filtered down to the one signal this gate can prove."""
    return PilotGateSignals(read_committed_env_files(read_tracked_files()))


def main() -> None:
    result = evaluate_pilot_gate(collect_signals())

    if not result.triggered:
        print("Pilot gate: sin disparadores.")
        print("  - sin configuracion real versionada")
        return

    acknowledged = os.environ.get("PILOT_GATE_ACK") == "1"

    print("")
    print("==============================================================")
    print(" DISPARADOR DE PROTECCION DEL DESPLIEGUE")
    print("==============================================================")
    for reason in result.reasons:
        print(f" * {reason}")
    print("")
    print(" Que hacer ANTES de publicar:")
    print("   1. Poner el despliegue detras de TLS y autenticacion (proxy inverso")
    print("      o proteccion equivalente).")
    print("   2. Verificar que la URL publica ya no sirve el simulador sin")
    print("      credenciales.")
    print("   3. Registrar la decision (fecha, quien, que proteccion) en")
    print("      docs/operacion/checklist-canal-real.md y poner PILOT_GATE_ACK=1")
    print("      en .github/workflows/python-ci.yml.")
    print("")

    if acknowledged:
        print(" PILOT_GATE_ACK=1: proteccion declarada, se continua. Si no esta")
        print(" activa, el simulador publico esta expuesto.")
        print("")
        return

    print(" Bloqueado: sin PILOT_GATE_ACK=1 el gate falla a proposito.")
    print("")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
