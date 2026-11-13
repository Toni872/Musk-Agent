"""API tests for the FastAPI layer (deterministic mode, no LLM)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth import load_basic_auth_from_env
from app.db import ConversationRepository, Database
from app.main import create_app
from app.rules import build_reply


def _client() -> TestClient:
    return TestClient(create_app(provider=None))


def _auth_client() -> TestClient:
    return TestClient(create_app(provider=None, basic_auth=("musk", "secreto")))


def _lead() -> dict[str, str]:
    return {"id": "lead-1", "contact": "+34600000000", "bucket": "ilocalizable"}


def test_health() -> None:
    with _client() as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_health_is_public_with_authentication_enabled() -> None:
    with _auth_client() as client:
        assert client.get("/health").status_code == 200


def test_protected_route_requires_credentials() -> None:
    with _auth_client() as client:
        response = client.get("/sessions/unknown")
        assert response.status_code == 401
        assert response.headers["www-authenticate"].startswith("Basic")


def test_static_ui_requires_credentials() -> None:
    with _auth_client() as client:
        assert client.get("/").status_code == 401


def test_valid_credentials_reach_the_api() -> None:
    with _auth_client() as client:
        assert client.get("/sessions/unknown", auth=("musk", "secreto")).status_code == 404


def test_wrong_password_is_rejected() -> None:
    with _auth_client() as client:
        assert client.get("/sessions/unknown", auth=("musk", "otra")).status_code == 401


def test_malformed_authorization_header_is_rejected() -> None:
    with _auth_client() as client:
        response = client.get("/sessions/unknown", headers={"authorization": "Bearer token"})
        assert response.status_code == 401


def test_basic_auth_requires_both_variables() -> None:
    assert load_basic_auth_from_env({}) is None
    assert load_basic_auth_from_env({"MUSK_BASIC_AUTH_USER": "musk"}) is None
    assert load_basic_auth_from_env({"MUSK_BASIC_AUTH_PASSWORD": "secreto"}) is None
    assert load_basic_auth_from_env(
        {"MUSK_BASIC_AUTH_USER": "musk", "MUSK_BASIC_AUTH_PASSWORD": "secreto"}
    ) == ("musk", "secreto")


def test_chat_answers_a_kb_question() -> None:
    with _client() as client:
        response = client.post(
            "/chat",
            json={"session_id": "s1", "message": "¿me dan certificado de la UE?", "lead": _lead()},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["action"] == "none"
        assert body["intent"] == "conversation"
        assert "llamada" in body["reply"]


def test_chat_price_question_registers_a_doubt() -> None:
    with _client() as client:
        response = client.post(
            "/chat", json={"session_id": "s2", "message": "¿cuánto cuesta?", "lead": _lead()}
        )
        body = response.json()
        assert body["reply"] == build_reply("doubt")
        assert body["registered_doubts"] == ["¿cuánto cuesta?"]


def test_chat_stop_marks_no_continuar() -> None:
    with _client() as client:
        response = client.post(
            "/chat", json={"session_id": "s3", "message": "no me escribas más", "lead": _lead()}
        )
        body = response.json()
        assert body["action"] == "stop"
        assert body["registered_no_continuar"] is True


def test_chat_handoff_fires_human_requested() -> None:
    with _client() as client:
        response = client.post(
            "/chat",
            json={"session_id": "s4", "message": "quiero hablar con una persona", "lead": _lead()},
        )
        body = response.json()
        assert body["action"] == "handoff"
        assert body["handoff"]["reason"] == "human_requested"
        assert body["handoff"]["recipient"] == "Laura"


def test_session_status_reports_supervision_state() -> None:
    with _client() as client:
        client.post(
            "/chat", json={"session_id": "s5", "message": "¿cuánto cuesta?", "lead": _lead()}
        )
        response = client.get("/sessions/s5")
        assert response.status_code == 200
        body = response.json()
        assert body["doubts"] == ["¿cuánto cuesta?"]
        assert body["records_count"] > 0


def test_session_status_unknown_is_404() -> None:
    with _client() as client:
        response = client.get("/sessions/unknown")
        assert response.status_code == 404


def test_create_session_returns_initial_state() -> None:
    with _client() as client:
        response = client.post("/sessions", json={"session_id": "ui-1", "lead": _lead()})
        assert response.status_code == 200
        body = response.json()
        assert body["session_id"] == "ui-1"
        assert "banner" in body
        assert body["records"] == []
        assert "opening" in body
        assert "determinista" in body["banner"]


def test_session_state_after_turn_reports_records_and_doubts() -> None:
    with _client() as client:
        client.post("/sessions", json={"session_id": "ui-2", "lead": _lead()})
        client.post("/chat", json={"session_id": "ui-2", "message": "¿cuánto cuesta?"})
        body = client.get("/sessions/ui-2/state").json()
        assert body["doubts"] == ["¿cuánto cuesta?"]
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
        client.post(
            "/chat", json={"session_id": "s6", "message": "¿cuánto cuesta?", "lead": _lead()}
        )
        body = client.get("/sessions/s6").json()
        assert body["metrics"]["turns"] >= 1
        assert body["metrics"]["doubts_registered"] >= 1


def test_chat_persists_when_database_configured(tmp_path) -> None:
    import asyncio

    database = Database(f"sqlite+aiosqlite:///{tmp_path.joinpath('test.db').as_posix()}")
    with TestClient(create_app(provider=None, database=database)) as client:
        response = client.post(
            "/chat", json={"session_id": "s7", "message": "hola", "lead": _lead()}
        )
        assert response.status_code == 200

    async def check() -> None:
        async with database.session() as session:
            repo = ConversationRepository(session)
            conversation = await repo.get_conversation("s7")
            assert conversation is not None
            messages = await repo.list_messages("s7")
            assert [m.role for m in messages] == ["lead", "assistant"]

    asyncio.run(check())


def test_session_state_survives_a_new_app_instance(tmp_path) -> None:
    """Serverless: a new instance must rehydrate the conversation from the database."""
    url = f"sqlite+aiosqlite:///{tmp_path.joinpath('sessions.db').as_posix()}"
    with TestClient(create_app(provider=None, database=Database(url))) as first:
        response = first.post(
            "/chat", json={"session_id": "s8", "message": "¿cuánto cuesta?", "lead": _lead()}
        )
        assert response.status_code == 200

    with TestClient(create_app(provider=None, database=Database(url))) as second:
        body = second.get("/sessions/s8/state").json()

    assert body["turn_count"] == 1
    assert body["doubts"]
