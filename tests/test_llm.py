"""Tests for the optional LLM provider configuration (app.llm).

Ported from tests/llm.test.ts. The provider is the ONLY network dependency, so
the contract that matters is: no keys means no provider, a half-written config
never turns the model on by accident, and a non-HTTPS endpoint is rejected
before any request leaves the process. All tests run offline.
"""

import pytest

from app.llm import LLMConfig, LLMRequest, OpenAICompatibleLLM, load_llm_config_from_env

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
