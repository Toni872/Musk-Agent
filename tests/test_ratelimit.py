"""Tests for the per-client sliding-window rate limiter (app.ratelimit)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ratelimit import RateLimiter


def test_allows_up_to_the_limit_then_blocks() -> None:
    ticks = iter([0.0, 0.1, 0.2])
    limiter = RateLimiter(max_calls=2, clock=lambda: next(ticks))
    assert limiter.allow("ip") is True
    assert limiter.allow("ip") is True
    assert limiter.allow("ip") is False


def test_window_slides_and_frees_the_slot() -> None:
    now = [0.0]
    limiter = RateLimiter(max_calls=1, window_seconds=60, clock=lambda: now[0])
    assert limiter.allow("ip") is True
    assert limiter.allow("ip") is False
    now[0] = 61.0
    assert limiter.allow("ip") is True


def test_keys_are_isolated() -> None:
    limiter = RateLimiter(max_calls=1)
    assert limiter.allow("a") is True
    assert limiter.allow("b") is True
    assert limiter.allow("a") is False


def test_rejects_non_positive_limit() -> None:
    with pytest.raises(ValueError):
        RateLimiter(max_calls=0)


def test_chat_returns_429_when_the_limit_is_exceeded() -> None:
    app = create_app(provider=None)
    app.state.rate_limiter = RateLimiter(max_calls=1)
    with TestClient(app) as client:
        first = client.post("/chat", json={"session_id": "rl1", "message": "hola"})
        second = client.post("/chat", json={"session_id": "rl1", "message": "hola"})
    assert first.status_code == 200
    assert second.status_code == 429
