"""Optional HTTP Basic authentication for the simulator.

The browser talks to the same origin that serves the UI, so a client-side check
would be bypassed by reading ``app.js``. When ``MUSK_BASIC_AUTH_USER`` and
``MUSK_BASIC_AUTH_PASSWORD`` are defined, every route except ``/health``
requires the header; ``/health`` stays public so the container healthcheck and
the TLS proxy can probe liveness without credentials.
"""

from __future__ import annotations

import base64
import binascii
import os
import secrets
from collections.abc import Mapping

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

_REALM = 'Basic realm="MUSK", charset="UTF-8"'
_PUBLIC_PATHS = frozenset({"/health"})


def load_basic_auth_from_env(env: Mapping[str, str] | None = None) -> tuple[str, str] | None:
    """Return the configured (user, password) pair, or ``None`` when disabled.

    Both variables are required: a half-configured pair is treated as disabled
    instead of silently opening the deployment.
    """
    source = os.environ if env is None else env
    username = (source.get("MUSK_BASIC_AUTH_USER") or "").strip()
    password = (source.get("MUSK_BASIC_AUTH_PASSWORD") or "").strip()
    if not username or not password:
        return None
    return username, password


def _decode(header: str) -> tuple[str, str] | None:
    scheme, _, payload = header.partition(" ")
    if scheme.lower() != "basic" or not payload:
        return None
    try:
        raw = base64.b64decode(payload, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    username, separator, password = raw.partition(":")
    if not separator:
        return None
    return username, password


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Require HTTP Basic credentials on every path except the health probe."""

    def __init__(self, app: ASGIApp, *, username: str, password: str) -> None:
        super().__init__(app)
        self._username = username
        self._password = password

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)
        credentials = _decode(request.headers.get("authorization", ""))
        if credentials is not None and self._matches(*credentials):
            return await call_next(request)
        return JSONResponse(
            {"detail": "authentication required"},
            status_code=401,
            headers={"WWW-Authenticate": _REALM},
        )

    def _matches(self, username: str, password: str) -> bool:
        user_ok = secrets.compare_digest(username.encode(), self._username.encode())
        password_ok = secrets.compare_digest(password.encode(), self._password.encode())
        return user_ok and password_ok
