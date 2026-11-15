"""Request guards: rate limit on every API route and size caps (spec S8-S9)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import MAX_MESSAGE_CHARS
from app.ratelimit import RateLimiter
from app.routers.chat import _session_ref


def _client() -> TestClient:
    return TestClient(create_app(provider=None, public_demo=True))


def _headers(session_id: str) -> dict[str, str]:
    return {"X-Session-Id": session_id}


def test_sessions_endpoint_is_rate_limited() -> None:
    app = create_app(provider=None, public_demo=True)
    app.state.rate_limiter = RateLimiter(max_calls=1)
    with TestClient(app) as client:
        first = client.post("/sessions", json={})
        second = client.post("/sessions", json={})
    assert first.status_code == 200
    assert second.status_code == 429


def test_state_endpoint_is_rate_limited() -> None:
    app = create_app(provider=None, public_demo=True)
    with TestClient(app) as client:
        session_id = client.post("/sessions", json={}).json()["session_id"]
        app.state.rate_limiter = RateLimiter(max_calls=1)
        first = client.get("/session/state", headers=_headers(session_id))
        second = client.get("/session/state", headers=_headers(session_id))
    assert first.status_code == 200
    assert second.status_code == 429


def test_message_over_the_cap_is_rejected() -> None:
    with _client() as client:
        session_id = client.post("/sessions", json={}).json()["session_id"]
        response = client.post(
            "/chat",
            json={"session_id": session_id, "message": "x" * (MAX_MESSAGE_CHARS + 1)},
        )
    assert response.status_code == 422


def test_oversized_body_is_rejected() -> None:
    with _client() as client:
        response = client.post(
            "/sessions",
            json={"lead": {"id": "x" * 300_000, "contact": "+34", "bucket": "ilocalizable"}},
        )
    assert response.status_code == 413


def test_missing_session_header_is_401() -> None:
    with _client() as client:
        assert client.get("/session/state").status_code == 401


def test_state_reads_the_session_from_the_header() -> None:
    with _client() as client:
        session_id = client.post("/sessions", json={}).json()["session_id"]
        response = client.get("/session/state", headers=_headers(session_id))
    assert response.status_code == 200
    assert response.json()["session_id"] == session_id


def test_old_path_routes_are_gone() -> None:
    """The id must not travel in the URL: access logs would leak a bearer token."""
    with _client() as client:
        assert client.get("/sessions/unknown/state").status_code == 404
        assert client.get("/sessions/unknown").status_code == 404


def test_session_ref_is_hashed_and_short() -> None:
    """Logs carry a non-reversible reference, never the session id (S10)."""
    session_id = "a" * 43
    ref = _session_ref(session_id)
    assert len(ref) == 12
    assert ref != session_id
    assert session_id not in ref
    assert _session_ref(session_id) == ref


def test_handoff_pdf_filename_does_not_leak_the_session_id() -> None:
    """A fixed filename keeps the id out of download paths and proxy logs (S10)."""
    with _client() as client:
        session_id = client.post("/sessions", json={}).json()["session_id"]
        client.post(
            "/chat",
            json={"session_id": session_id, "message": "quiero hablar con una persona"},
        )
        response = client.get("/session/pdf", headers=_headers(session_id))
    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert 'filename="aviso-musk.pdf"' in disposition
    assert session_id not in disposition
