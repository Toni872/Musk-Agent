"""Floors of the deployment-exposure gate (port of tests/pilot-gate.test.ts)."""

from __future__ import annotations

import pytest

import app.pilot_gate as pilot_gate
from app.pilot_gate import (
    PilotGateSignals,
    evaluate_pilot_gate,
    read_committed_env_files,
)

CLEAR = PilotGateSignals(committed_env_files=())


def test_gate_stays_silent_when_no_real_configuration_is_committed() -> None:
    result = evaluate_pilot_gate(CLEAR)
    assert result.triggered is False
    assert result.reasons == ()


def test_gate_fires_when_real_configuration_has_been_committed() -> None:
    result = evaluate_pilot_gate(
        PilotGateSignals(committed_env_files=(".env",))
    )
    assert result.triggered is True
    assert ".env" in " ".join(result.reasons)


def test_read_committed_env_files_catches_any_depth() -> None:
    assert read_committed_env_files(
        [".env", "ui/.env.local", "src/.env.production"]
    ) == (".env", "ui/.env.local", "src/.env.production")


def test_read_committed_env_files_ignores_template_and_lookalikes() -> None:
    assert (
        read_committed_env_files(
            [".env.example", "docs/environment.md", "src/env.ts", "ui/environment.ts"]
        )
        == ()
    )


def test_collect_signals_does_not_treat_every_tracked_file_as_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        pilot_gate,
        "read_tracked_files",
        lambda: ("README.md", "app/main.py", ".env.example"),
    )
    assert pilot_gate.collect_signals() == PilotGateSignals(committed_env_files=())
