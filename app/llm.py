"""LLM provider abstraction. No SDK: the concrete provider talks to any
OpenAI-compatible endpoint through httpx. MockProvider backs the offline tests
and the deterministic simulation mode.
"""

from __future__ import annotations

import math
import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class LLMChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class LLMRequest:
    system: str
    messages: tuple[LLMChatMessage, ...]


class LLMProvider(Protocol):
    async def complete(self, request: LLMRequest) -> str: ...


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float
    max_tokens: int = 700


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

    max_tokens_raw = source.get("MUSK_LLM_MAX_TOKENS")
    max_tokens = 700
    if max_tokens_raw is not None and max_tokens_raw.strip():
        try:
            max_tokens = int(max_tokens_raw)
        except ValueError:
            max_tokens = 700
        if max_tokens <= 0:
            max_tokens = 700

    return LLMConfig(
        base_url=base_url,
        api_key=api_key,
        model=(source.get("MUSK_LLM_MODEL") or "").strip() or "gpt-4o-mini",
        temperature=parsed if math.isfinite(parsed) else 0.2,
        max_tokens=max_tokens,
    )


class OpenAICompatibleLLM:
    """Talks to any OpenAI-compatible /chat/completions endpoint via httpx."""

    def __init__(self, config: LLMConfig) -> None:
        self._config = config

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

    async def complete(self, request: LLMRequest) -> str:
        base_url = self._config.base_url.strip()
        if not base_url.lower().startswith("https://"):
            raise ValueError("LLM base URL must use https")
        url = f"{base_url.rstrip('/')}/chat/completions"
        payload = self._build_payload(request)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self._config.api_key}"},
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise RuntimeError("LLM request timed out") from exc
        if not response.is_success:
            raise RuntimeError(
                f"LLM request failed: {response.status_code} {response.reason_phrase}"
            )
        data = response.json()
        choices = data.get("choices") or []
        content = (choices[0].get("message", {}) or {}).get("content") if choices else None
        if not isinstance(content, str):
            raise RuntimeError("LLM response missing message content")
        return content


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

    async def complete(self, request: LLMRequest) -> str:
        self.calls.append(request)
        if callable(self._responder):
            return self._responder(request)
        return self._responder
