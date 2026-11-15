"""Request-size guard for the HTTP surface.

A single ASGI middleware rejects bodies larger than ``MAX_REQUEST_BYTES`` with
``413`` before FastAPI parses them. It relies on ``Content-Length``; a chunked
body (no ``Content-Length``) is rejected too, because the app's clients always
send a known size and an unbounded stream cannot be bounded after the fact.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send

MAX_REQUEST_BYTES = 262_144  # 256 KiB
_METHODS_WITHOUT_BODY = frozenset({"GET", "HEAD", "DELETE", "OPTIONS"})


class RequestSizeLimitMiddleware:
    """Reject request bodies larger than ``max_bytes`` with 413."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_REQUEST_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in _METHODS_WITHOUT_BODY:
            await self.app(scope, receive, send)
            return

        headers = {name.lower(): value for name, value in scope["headers"]}
        length = headers.get(b"content-length")
        if length is None:
            if b"transfer-encoding" in headers:
                await _send_413(send)
                return
        else:
            try:
                size = int(length)
            except ValueError:
                await _send_413(send)
                return
            if size > self.max_bytes:
                await _send_413(send)
                return

        await self.app(scope, receive, send)


async def _send_413(send: Send) -> None:
    body = b'{"detail":"request too large"}'
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
    ]
    await send({"type": "http.response.start", "status": 413, "headers": headers})
    await send({"type": "http.response.body", "body": body})
