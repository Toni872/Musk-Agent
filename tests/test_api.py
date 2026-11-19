"""API tests for the FastAPI layer (deterministic mode, no LLM)."""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.auth import load_basic_auth_from_env
from app.db import ConversationRepository, Database
from app.main import create_app
from app.rules import build_reply


def _client() -> TestClient:
    """Public-demo client: no auth, synthetic data (the Vercel demo shape)."""
    return TestClient(create_app(provider=None, public_demo=True))


def _auth_client() -> TestClient:
    return TestClient(create_app(provider=None, basic_auth={"musk": "secreto"}))


def _locked_client() -> TestClient:
    """Neither credentials nor the demo flag: the fail-closed default."""
    return TestClient(create_app(provider=None))


def _lead() -> dict[str, str]:
    return {"id": "lead-1", "contact": "+34600000000", "bucket": "ilocalizable"}


def _headers(session_id: str) -> dict[str, str]:
    return {"X-Session-Id": session_id}


def _open_session(client: TestClient, lead: dict[str, str] | None = None) -> str:
    response = client.post("/sessions", json={"lead": lead or _lead()})
    assert response.status_code == 200
    return response.json()["session_id"]


def test_health() -> None:
    with _client() as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_health_is_public_with_authentication_enabled() -> None:
    with _auth_client() as client:
        assert client.get("/health").status_code == 200


def test_health_is_public_when_locked_down() -> None:
    with _locked_client() as client:
        assert client.get("/health").status_code == 200


def test_locked_down_without_auth_or_demo_flag() -> None:
    """Fail-closed: forgetting MUSK_BASIC_AUTH_* must not expose conversations."""
    with _locked_client() as client:
        assert client.get("/session").status_code == 401
        assert client.get("/").status_code == 401
        assert client.get("/docs").status_code == 401


def test_public_demo_allows_unauthenticated_access() -> None:
    with _client() as client:
        assert client.get("/").status_code == 200
        assert client.get("/session", headers=_headers("unknown")).status_code == 404


def test_protected_route_requires_credentials() -> None:
    with _auth_client() as client:
        response = client.get("/session")
        assert response.status_code == 401
        assert response.headers["www-authenticate"].startswith("Basic")


def test_static_ui_requires_credentials() -> None:
    with _auth_client() as client:
        assert client.get("/").status_code == 401


def test_valid_credentials_reach_the_api() -> None:
    with _auth_client() as client:
        response = client.get(
            "/session", headers=_headers("unknown"), auth=("musk", "secreto")
        )
        assert response.status_code == 404


def test_wrong_password_is_rejected() -> None:
    with _auth_client() as client:
        assert client.get("/session", auth=("musk", "otra")).status_code == 401


def test_malformed_authorization_header_is_rejected() -> None:
    with _auth_client() as client:
        response = client.get("/session", headers={"authorization": "Bearer token"})
        assert response.status_code == 401


def test_basic_auth_requires_both_variables() -> None:
    assert load_basic_auth_from_env({}) is None
    assert load_basic_auth_from_env({"MUSK_BASIC_AUTH_USER": "musk"}) is None
    assert load_basic_auth_from_env({"MUSK_BASIC_AUTH_PASSWORD": "secreto"}) is None
    assert load_basic_auth_from_env(
        {"MUSK_BASIC_AUTH_USER": "musk", "MUSK_BASIC_AUTH_PASSWORD": "secreto"}
    ) == ("musk", "secreto")


def test_create_session_returns_initial_state() -> None:
    with _client() as client:
        response = client.post("/sessions", json={"lead": _lead()})
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body["session_id"], str) and body["session_id"]
        assert body["session_id"] != "ui-1"
        assert "banner" in body
        assert body["records"] == []
        assert "opening" in body
        assert "determinista" in body["banner"]


def test_sessions_get_distinct_server_issued_ids() -> None:
    with _client() as client:
        first = _open_session(client)
        second = _open_session(client)
    assert first != second
    assert len(first) >= 32


def test_chat_requires_an_existing_session() -> None:
    """No auto-create: an unknown id must not append to another conversation."""
    with _client() as client:
        response = client.post("/chat", json={"session_id": "unknown", "message": "hola"})
        assert response.status_code == 404


def test_session_state_unknown_does_not_create_a_session() -> None:
    with _client() as client:
        response = client.get("/session/state", headers=_headers("unknown"))
        assert response.status_code == 404


def test_chat_answers_a_kb_question() -> None:
    with _client() as client:
        session_id = _open_session(client)
        response = client.post(
            "/chat",
            json={"session_id": session_id, "message": "¿me dan certificado de la UE?"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "none"
    assert body["intent"] == "conversation"
    assert "llamada" in body["reply"]


def test_chat_price_question_returns_approved_reply_without_doubt() -> None:
    with _client() as client:
        session_id = _open_session(client)
        response = client.post(
            "/chat", json={"session_id": session_id, "message": "¿cuánto cuesta?"}
        )
    body = response.json()
    assert body["reply"] != build_reply("doubt")
    assert "persona del equipo" in body["reply"]
    assert "opciones de financiación" in body["reply"]
    assert "dos años" in body["reply"]
    assert re.search(r"llam", body["reply"])
    assert body["reply"].count("?") == 1
    assert body["registered_doubts"] == []


def test_chat_stop_marks_no_continuar() -> None:
    with _client() as client:
        session_id = _open_session(client)
        response = client.post(
            "/chat", json={"session_id": session_id, "message": "no me escribas más"}
        )
    body = response.json()
    assert body["action"] == "stop"
    assert body["registered_no_continuar"] is True


def test_chat_handoff_fires_human_requested() -> None:
    with _client() as client:
        session_id = _open_session(client)
        response = client.post(
            "/chat",
            json={"session_id": session_id, "message": "quiero hablar con una persona"},
        )
    body = response.json()
    assert body["action"] == "handoff"
    assert body["handoff"]["reason"] == "human_requested"
    assert body["handoff"]["recipient"] == "Laura"


def test_session_status_reports_supervision_state() -> None:
    with _client() as client:
        session_id = _open_session(client)
        client.post("/chat", json={"session_id": session_id, "message": "¿cuánto cuesta?"})
        response = client.get("/session", headers=_headers(session_id))
    assert response.status_code == 200
    body = response.json()
    assert body["doubts"] == []
    assert body["records_count"] > 0


def test_session_status_unknown_is_404() -> None:
    with _client() as client:
        response = client.get("/session", headers=_headers("unknown"))
        assert response.status_code == 404


def test_session_state_after_turn_reports_records_and_doubts() -> None:
    with _client() as client:
        session_id = _open_session(client)
        client.post("/chat", json={"session_id": session_id, "message": "¿cuánto cuesta?"})
        body = client.get("/session/state", headers=_headers(session_id)).json()
    assert body["doubts"] == []
    assert len(body["records"]) > 0
    assert body["turn_count"] >= 1
    assert {record["kind"] for record in body["records"]}


def test_report_pdf_endpoint_returns_a_pdf() -> None:
    with _client() as client:
        payload = {
            "generated_at": "2026-11-10T16:00:00+00:00",
            "turn_count": 1,
            "stopped": False,
            "messages": [{"role": "lead", "text": "hola"}],
            "records": [{"kind": "reply", "detail": "respuesta"}],
            "doubts": [],
            "handoff": None,
            "qualification_answers": [],
        }
        response = client.post("/report.pdf", json=payload)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")


def test_session_status_reports_metrics() -> None:
    with _client() as client:
        session_id = _open_session(client)
        client.post("/chat", json={"session_id": session_id, "message": "¿cuánto cuesta?"})
        body = client.get("/session", headers=_headers(session_id)).json()
    assert body["metrics"]["turns"] >= 1
    assert body["metrics"]["doubts_registered"] == 0


def test_chat_persists_when_database_configured(tmp_path) -> None:
    import asyncio

    database = Database(f"sqlite+aiosqlite:///{tmp_path.joinpath('test.db').as_posix()}")
    with TestClient(create_app(provider=None, database=database, public_demo=True)) as client:
        session_id = _open_session(client)
        response = client.post("/chat", json={"session_id": session_id, "message": "hola"})
        assert response.status_code == 200

    async def check() -> None:
        async with database.session() as session:
            repo = ConversationRepository(session)
            conversation = await repo.get_conversation(session_id)
            assert conversation is not None
            assert conversation.contact == "+34600000000"
            messages = await repo.list_messages(session_id)
            assert [m.role for m in messages] == ["lead", "assistant"]

    asyncio.run(check())


def test_session_state_survives_a_new_app_instance(tmp_path) -> None:
    """Serverless: a new instance must rehydrate the conversation from the database."""
    url = f"sqlite+aiosqlite:///{tmp_path.joinpath('sessions.db').as_posix()}"
    with TestClient(create_app(provider=None, database=Database(url), public_demo=True)) as first:
        session_id = _open_session(first)
        response = first.post(
            "/chat", json={"session_id": session_id, "message": "¿cuánto cuesta?"}
        )
        assert response.status_code == 200

    with TestClient(create_app(provider=None, database=Database(url), public_demo=True)) as second:
        body = second.get("/session/state", headers=_headers(session_id)).json()

    assert body["turn_count"] == 1
    assert body["doubts"] == []
