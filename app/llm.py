"""LLM provider abstraction. No SDK: the concrete provider talks to any
OpenAI-compatible endpoint through httpx. MockProvider backs the offline tests
and the deterministic simulation mode.

Reliability: transient failures (timeouts, connection errors, 429 and 5xx) are
retried with capped exponential backoff and jitter. The provider never retries a
definitive client error (400/401/403/404/...); those surface immediately and the
agent falls back to the deterministic replies.

Observability: every completion returns the token usage the provider reports and
the wall-clock latency, plus an estimated cost when prices are configured. That
data is operational only: it never reaches the lead's conversation.
"""

from __future__ import annotations

import asyncio
import math
import os
import random
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

Role = Literal["system", "user", "assistant"]

_TIMEOUT_SECONDS = 30.0
# Provider status codes worth retrying: rate limiting and transient server errors.
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
# Guard against float overflow if someone configures a huge retry count.
_MAX_BACKOFF_EXPONENT = 20


@dataclass(frozen=True)
class LLMChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class LLMRequest:
    system: str
    messages: tuple[LLMChatMessage, ...]


@dataclass(frozen=True)
class LLMUsage:
    """Token counts reported by the provider."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class LLMResult:
    """One completion plus the operational data needed to trace its cost."""

    text: str
    usage: LLMUsage | None = None
    latency_ms: float = 0.0
    attempts: int = 1
    cost_usd: float | None = None


class LLMProvider(Protocol):
    async def complete(self, request: LLMRequest) -> LLMResult: ...


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float
    max_tokens: int = 700
    # Reliability: total tries = 1 + max_retries.
    max_retries: int = 2
    backoff_base_seconds: float = 0.5
    backoff_max_seconds: float = 4.0
    # Optional cost tracing: provider prices per 1M tokens (None disables it).
    input_price_per_1m: float | None = None
    output_price_per_1m: float | None = None

    def estimate_cost_usd(self, usage: LLMUsage) -> float | None:
        """Estimated USD cost for one call, or ``None`` when prices are absent."""
        if self.input_price_per_1m is None or self.output_price_per_1m is None:
            return None
        return (
            usage.prompt_tokens / 1_000_000 * self.input_price_per_1m
            + usage.completion_tokens / 1_000_000 * self.output_price_per_1m
        )


def _env_float(
    source: Mapping[str, str], key: str, default: float, *, minimum: float = 0.0
) -> float:
    raw = source.get(key)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if not math.isfinite(value) or value < minimum:
        return default
    return value


def _env_optional_float(source: Mapping[str, str], key: str) -> float | None:
    raw = source.get(key)
    if raw is None or not raw.strip():
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return value


def _env_int(source: Mapping[str, str], key: str, default: int, *, minimum: int = 0) -> int:
    raw = source.get(key)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value >= minimum else default


def load_llm_config_from_env(env: dict[str, str] | None = None) -> LLMConfig | None:
    """Load the provider config; None when base URL or API key is absent.

    Optional configuration: when MUSK_LLM_BASE_URL / MUSK_LLM_API_KEY are
    absent the harness runs in deterministic mode (approved replies only).
    """
    source = os.environ if env is None else env
    base_url = (source.get("MUSK_LLM_BASE_URL") or "").strip()
    api_key = (source.get("MUSK_LLM_API_KEY") or "").strip()
    if not base_url or not api_key:
        return None

    temperature_raw = source.get("MUSK_LLM_TEMPERATURE")
    if temperature_raw is None:
        parsed = 0.2
    else:
        try:
            parsed = float(temperature_raw) if temperature_raw.strip() else 0.0
        except ValueError:
            parsed = float("nan")

    return LLMConfig(
        base_url=base_url,
        api_key=api_key,
        model=(source.get("MUSK_LLM_MODEL") or "").strip() or "gpt-4o-mini",
        temperature=parsed if math.isfinite(parsed) else 0.2,
        max_tokens=_env_int(source, "MUSK_LLM_MAX_TOKENS", 700, minimum=1),
        max_retries=_env_int(source, "MUSK_LLM_MAX_RETRIES", 2, minimum=0),
        backoff_base_seconds=_env_float(source, "MUSK_LLM_BACKOFF_BASE_SECONDS", 0.5),
        backoff_max_seconds=_env_float(source, "MUSK_LLM_BACKOFF_MAX_SECONDS", 4.0),
        input_price_per_1m=_env_optional_float(source, "MUSK_LLM_PRICE_INPUT_PER_1M"),
        output_price_per_1m=_env_optional_float(source, "MUSK_LLM_PRICE_OUTPUT_PER_1M"),
    )


async def _default_sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


def _parse_usage(raw: object) -> LLMUsage | None:
    """Read ``usage`` from the provider body; None when it is absent/incomplete."""
    if not isinstance(raw, dict):
        return None
    prompt = raw.get("prompt_tokens")
    completion = raw.get("completion_tokens")
    total = raw.get("total_tokens")
    if not isinstance(prompt, int) or not isinstance(completion, int):
        return None
    total_tokens = total if isinstance(total, int) else prompt + completion
    return LLMUsage(
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=total_tokens,
    )


class OpenAICompatibleLLM:
    """Talks to any OpenAI-compatible /chat/completions endpoint via httpx."""

    def __init__(
        self,
        config: LLMConfig,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._config = config
        self._transport = transport
        self._sleep = sleep if sleep is not None else _default_sleep

    def _build_payload(self, request: LLMRequest) -> dict[str, object]:
        return {
            "model": self._config.model,
            "temperature": self._config.temperature,
            "max_tokens": self._config.max_tokens,
            "messages": [
                {"role": "system", "content": request.system},
                *[{"role": m.role, "content": m.content} for m in request.messages],
            ],
        }

    def _backoff_delay(self, attempt: int) -> float:
        """Capped exponential backoff with jitter; ``attempt`` is 1-based."""
        exponent = min(attempt - 1, _MAX_BACKOFF_EXPONENT)
        delay = min(
            self._config.backoff_base_seconds * (2**exponent),
            self._config.backoff_max_seconds,
        )
        if delay <= 0:
            return 0.0
        # Half-jitter: avoids a thundering herd while keeping the cap as the
        # worst case.
        return random.uniform(delay / 2, delay)

    async def complete(self, request: LLMRequest) -> LLMResult:
        base_url = self._config.base_url.strip()
        if not base_url.lower().startswith("https://"):
            raise ValueError("LLM base URL must use https")
        url = f"{base_url.rstrip('/')}/chat/completions"
        payload = self._build_payload(request)

        total_attempts = self._config.max_retries + 1
        for attempt in range(1, total_attempts + 1):
            started = time.perf_counter()
            try:
                async with httpx.AsyncClient(
                    timeout=_TIMEOUT_SECONDS, transport=self._transport
                ) as client:
                    response = await client.post(
                        url,
                        headers={"Authorization": f"Bearer {self._config.api_key}"},
                        json=payload,
                    )
            except httpx.TransportError as exc:
                # Timeouts and connection failures: retryable.
                if attempt < total_attempts:
                    await self._sleep(self._backoff_delay(attempt))
                    continue
                raise RuntimeError("LLM request failed: network error") from exc

            if response.is_success:
                latency_ms = (time.perf_counter() - started) * 1000.0
                return self._build_result(response, latency_ms, attempt)

            if response.status_code in _RETRYABLE_STATUS and attempt < total_attempts:
                await self._sleep(self._backoff_delay(attempt))
                continue
            raise RuntimeError(
                f"LLM request failed: {response.status_code} {response.reason_phrase}"
            )

        # Unreachable: every path above returns or raises.
        raise RuntimeError("LLM request failed: retries exhausted")

    def _build_result(
        self, response: httpx.Response, latency_ms: float, attempts: int
    ) -> LLMResult:
        data = response.json()
        choices = data.get("choices") or []
        content = (choices[0].get("message", {}) or {}).get("content") if choices else None
        if not isinstance(content, str):
            raise RuntimeError("LLM response missing message content")
        usage = _parse_usage(data.get("usage"))
        cost = self._config.estimate_cost_usd(usage) if usage is not None else None
        return LLMResult(
            text=content,
            usage=usage,
            latency_ms=latency_ms,
            attempts=attempts,
            cost_usd=cost,
        )


class MockProvider:
    """Scripted provider for tests: never touches the network.

    Records every call so tests can assert that guarded intents never reach
    the LLM.
    """

    def __init__(
        self,
        responder: str | Callable[[LLMRequest], str] = "Respuesta simulada del proveedor.",
    ) -> None:
        self._responder = responder
        self.calls: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.calls.append(request)
        if callable(self._responder):
            return LLMResult(text=self._responder(request))
        return LLMResult(text=self._responder)
