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

import structlog
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


def _parse_operators(raw: str) -> dict[str, str]:
    """Parse ``name:password`` pairs separated by commas.

    Malformed entries (no colon, empty name or empty password) are skipped so a
    typo in one operator does not disable the others or silently open the app.
    Passwords must not contain commas; that is the documented format limit.
    """
    operators: dict[str, str] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        name, separator, password = entry.partition(":")
        name = name.strip()
        if not separator or not name or not password:
            continue
        operators[name] = password
    return operators


def load_operators_from_env(env: Mapping[str, str] | None = None) -> dict[str, str] | None:
    """Return the operator -> password mapping, or ``None`` when disabled.

    ``MUSK_OPERATORS`` (``name:password`` comma-separated) enables per-operator
    accounts. When absent, the single ``MUSK_BASIC_AUTH_USER`` / password pair
    still works and is treated as one operator. An empty or malformed
    ``MUSK_OPERATORS`` yields ``None``, so the app fails closed instead of
    opening.
    """
    source = os.environ if env is None else env
    raw = (source.get("MUSK_OPERATORS") or "").strip()
    if raw:
        return _parse_operators(raw) or None
    single = load_basic_auth_from_env(source)
    if single is None:
        return None
    return {single[0]: single[1]}


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
    """Require HTTP Basic credentials on every path except the health probe.

    Accepts a mapping of operator name to password so each person has their own
    account. On a successful match the operator name is attached to
    ``request.state.operator`` and an ``access`` event is logged, giving the
    audit trail of who opened what. The event is emitted at INFO, so it is
    visible when the deployment runs with ``log_level`` at INFO or lower.
    """

    def __init__(self, app: ASGIApp, *, credentials: Mapping[str, str]) -> None:
        super().__init__(app)
        self._credentials = dict(credentials)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)
        credentials = _decode(request.headers.get("authorization", ""))
        if credentials is not None and self._matches(*credentials):
            request.state.operator = credentials[0]
            response = await call_next(request)
            structlog.get_logger("app.auth").info(
                "access",
                operator=credentials[0],
                method=request.method,
                path=request.url.path,
            )
            return response
        return JSONResponse(
            {"detail": "authentication required"},
            status_code=401,
            headers={"WWW-Authenticate": _REALM},
        )

    def _matches(self, username: str, password: str) -> bool:
        expected = self._credentials.get(username)
        if expected is None:
            return False
        return secrets.compare_digest(password.encode(), expected.encode())


class LockdownMiddleware(BaseHTTPMiddleware):
    """Fail-closed default: refuse every non-public request.

    Used when neither Basic Auth nor the public demo is configured. Without it,
    forgetting ``MUSK_BASIC_AUTH_*`` would silently serve every conversation;
    with it, a misconfigured deployment fails safe (401) instead of open.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)
        return JSONResponse(
            {"detail": "authentication required"},
            status_code=401,
            headers={"WWW-Authenticate": _REALM},
        )
