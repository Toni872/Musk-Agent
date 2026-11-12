"""Tests for the optional LLM provider configuration (app.llm).

Ported from tests/llm.test.ts. The provider is the ONLY network dependency, so
the contract that matters is: no keys means no provider, a half-written config
never turns the model on by accident, and a non-HTTPS endpoint is rejected
before any request leaves the process. All tests run offline.
"""

from collections.abc import Callable

import httpx
import pytest

from app.agent import MuskAgent
from app.content import APPROVED_CONTENT
from app.llm import (
    LLMConfig,
    LLMRequest,
    LLMResult,
    LLMUsage,
    OpenAICompatibleLLM,
    load_llm_config_from_env,
)

_GROQ = {
    "MUSK_LLM_BASE_URL": "https://api.groq.com/openai/v1",
    "MUSK_LLM_API_KEY": "test-key",
    "MUSK_LLM_MODEL": "openai/gpt-oss-120b",
    "MUSK_LLM_TEMPERATURE": "0.2",
}


def test_no_keys_means_deterministic_mode() -> None:
    assert load_llm_config_from_env({}) is None


def test_half_a_config_does_not_enable_the_model() -> None:
    assert load_llm_config_from_env({"MUSK_LLM_BASE_URL": _GROQ["MUSK_LLM_BASE_URL"]}) is None
    assert load_llm_config_from_env({"MUSK_LLM_API_KEY": _GROQ["MUSK_LLM_API_KEY"]}) is None
    assert (
        load_llm_config_from_env(
            {"MUSK_LLM_BASE_URL": _GROQ["MUSK_LLM_BASE_URL"], "MUSK_LLM_API_KEY": "   "}
        )
        is None
    )


def test_loads_the_groq_config_verbatim() -> None:
    config = load_llm_config_from_env(_GROQ)
    assert config == LLMConfig(
        base_url="https://api.groq.com/openai/v1",
        api_key="test-key",
        model="openai/gpt-oss-120b",
        temperature=0.2,
    )


def test_missing_model_falls_back_to_a_default() -> None:
    config = load_llm_config_from_env(
        {"MUSK_LLM_BASE_URL": _GROQ["MUSK_LLM_BASE_URL"], "MUSK_LLM_API_KEY": "test-key"}
    )
    assert config is not None
    assert config.model == "gpt-4o-mini"
    assert config.temperature == 0.2


def test_unreadable_temperature_falls_back_to_default() -> None:
    config = load_llm_config_from_env({**_GROQ, "MUSK_LLM_TEMPERATURE": "caliente"})
    assert config is not None
    assert config.temperature == 0.2


def test_valid_temperature_is_respected() -> None:
    config = load_llm_config_from_env({**_GROQ, "MUSK_LLM_TEMPERATURE": "0.7"})
    assert config is not None
    assert config.temperature == 0.7


async def test_non_https_url_is_rejected_before_any_request() -> None:
    provider = OpenAICompatibleLLM(
        LLMConfig(
            base_url="http://api.groq.com/openai/v1",
            api_key="test-key",
            model="openai/gpt-oss-120b",
            temperature=0.2,
        )
    )
    with pytest.raises(ValueError, match="https"):
        await provider.complete(LLMRequest(system="sistema", messages=()))


def test_max_tokens_defaults_to_700() -> None:
    config = load_llm_config_from_env(_GROQ)
    assert config is not None
    assert config.max_tokens == 700


def test_max_tokens_is_configurable() -> None:
    config = load_llm_config_from_env({**_GROQ, "MUSK_LLM_MAX_TOKENS": "256"})
    assert config is not None
    assert config.max_tokens == 256


def test_invalid_max_tokens_falls_back_to_default() -> None:
    config = load_llm_config_from_env({**_GROQ, "MUSK_LLM_MAX_TOKENS": "muchos"})
    assert config is not None
    assert config.max_tokens == 700


def test_payload_carries_the_max_tokens_cap() -> None:
    config = load_llm_config_from_env({**_GROQ, "MUSK_LLM_MAX_TOKENS": "512"})
    assert config is not None
    provider = OpenAICompatibleLLM(config)
    payload = provider._build_payload(LLMRequest(system="sistema", messages=()))
    assert payload["max_tokens"] == 512


# --- reliability and observability -----------------------------------------


def _ok_body(text: str = "hola", prompt: int = 10, completion: int = 5) -> dict[str, object]:
    return {
        "choices": [{"message": {"content": text}}],
        "usage": {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
        },
    }


def _provider(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    retries: int = 2,
    input_price: float | None = None,
    output_price: float | None = None,
    delays: list[float] | None = None,
) -> OpenAICompatibleLLM:
    async def _sleep(seconds: float) -> None:
        if delays is not None:
            delays.append(seconds)

    config = LLMConfig(
        base_url="https://api.test/v1",
        api_key="test-key",
        model="test-model",
        temperature=0.0,
        max_retries=retries,
        backoff_base_seconds=0.0,
        backoff_max_seconds=0.0,
        input_price_per_1m=input_price,
        output_price_per_1m=output_price,
    )
    return OpenAICompatibleLLM(
        config, transport=httpx.MockTransport(handler), sleep=_sleep
    )


async def test_retries_a_transient_500_then_succeeds() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(500, json={"error": "boom"})
        return httpx.Response(200, json=_ok_body("vale"))

    result = await _provider(handler).complete(LLMRequest(system="s", messages=()))
    assert result.text == "vale"
    assert result.attempts == 2
    assert len(calls) == 2


async def test_retries_a_rate_limited_429_then_succeeds() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(429, json={})
        return httpx.Response(200, json=_ok_body())

    result = await _provider(handler).complete(LLMRequest(system="s", messages=()))
    assert result.attempts == 2
    assert len(calls) == 2


async def test_does_not_retry_a_definitive_client_error() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(400, json={})

    with pytest.raises(RuntimeError, match="400"):
        await _provider(handler).complete(LLMRequest(system="s", messages=()))
    assert len(calls) == 1


async def test_exhausts_retries_and_raises() -> None:
    calls: list[httpx.Request] = []
    delays: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(503, json={})

    with pytest.raises(RuntimeError):
        await _provider(handler, retries=2, delays=delays).complete(
            LLMRequest(system="s", messages=())
        )
    assert len(calls) == 3
    assert len(delays) == 2


async def test_retries_a_timeout_then_succeeds() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ReadTimeout("slow", request=request)
        return httpx.Response(200, json=_ok_body("por fin"))

    result = await _provider(handler).complete(LLMRequest(system="s", messages=()))
    assert result.text == "por fin"
    assert result.attempts == 2


async def test_parses_usage_and_computes_cost() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_body("x", 1_000_000, 500_000))

    result = await _provider(handler, input_price=0.15, output_price=0.60).complete(
        LLMRequest(system="s", messages=())
    )
    assert result.usage == LLMUsage(
        prompt_tokens=1_000_000, completion_tokens=500_000, total_tokens=1_500_000
    )
    assert result.cost_usd == pytest.approx(0.45)


async def test_cost_is_none_without_configured_prices() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_body())

    result = await _provider(handler).complete(LLMRequest(system="s", messages=()))
    assert result.usage is not None
    assert result.cost_usd is None


async def test_agent_supervision_tracks_llm_usage_and_cost() -> None:
    class _UsageProvider:
        async def complete(self, request: LLMRequest) -> LLMResult:
            return LLMResult(
                text="Claro, te cuento. ¿Te llamamos y te lo explican?",
                usage=LLMUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
                latency_ms=12.5,
                attempts=2,
                cost_usd=0.001,
            )

    agent = MuskAgent(content=APPROVED_CONTENT, provider=_UsageProvider())
    await agent.run_turn("¿Qué formación tenéis?")

    assert agent.metrics.llm_calls == 1
    assert agent.metrics.llm_retries == 1
    assert agent.metrics.llm_total_tokens == 150
    assert agent.metrics.llm_latency_ms == pytest.approx(12.5)
    assert agent.metrics.llm_cost_usd == pytest.approx(0.001)
    assert agent.metrics.llm_cost_known is True
