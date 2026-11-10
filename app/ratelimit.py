"""Per-client rate limiting for the cost-bearing chat endpoint.

A small in-memory sliding-window limiter. It is per-process: with several
uvicorn workers each process keeps its own window, which is fine for the
single-container pilot. Anything exposed publicly behind a proxy should also
carry an edge rate limit.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable


class RateLimiter:
    """Allow at most ``max_calls`` hits per ``key`` within ``window_seconds``."""

    def __init__(
        self,
        max_calls: int,
        window_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_calls <= 0:
            raise ValueError("max_calls must be positive")
        self._max_calls = max_calls
        self._window = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self._window:
            hits.popleft()
        if len(hits) >= self._max_calls:
            return False
        hits.append(now)
        return True
