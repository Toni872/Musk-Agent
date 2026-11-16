"""Environment contract for the security switches (spec S2, S3).

These tests guard the deployment path, not just the factory arguments: a
``Settings`` field without an alias silently ignores the documented
``MUSK_`` variable, which would leave a real deployment locked down (or open)
against what the docs promise.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import load_operators_from_env
from app.config import Settings
from app.main import create_app


def test_documented_public_demo_env_enables_the_demo(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("PUBLIC_DEMO", raising=False)
    monkeypatch.setenv("MUSK_PUBLIC_DEMO", "true")
    settings = Settings()
    assert settings.public_demo is True
    with TestClient(
        create_app(provider=None, public_demo=settings.public_demo)
    ) as client:
        assert client.get("/").status_code == 200
        assert client.get("/health").status_code == 200


def test_documented_basic_auth_env_protects_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MUSK_BASIC_AUTH_USER", "musk")
    monkeypatch.setenv("MUSK_BASIC_AUTH_PASSWORD", "secreto")
    with TestClient(
        create_app(provider=None, basic_auth=load_operators_from_env())
    ) as client:
        assert client.get("/").status_code == 401
        assert client.get("/", auth=("musk", "secreto")).status_code == 200
        assert client.get("/health").status_code == 200
