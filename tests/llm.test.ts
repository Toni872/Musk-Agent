// Tests for the optional LLM provider configuration (src/llm.ts).
//
// The provider is the ONLY network dependency in the harness, so the contract
// that matters is: no keys means no provider, a half-written config never turns
// the model on by accident, and a non-HTTPS endpoint is rejected before any
// request leaves the process. All tests run offline.

import { describe, expect, it } from 'vitest';

import { loadLLMConfigFromEnv, OpenAICompatibleLLM } from '../src/llm';

// A clean env per case: process.env must not leak into the assertions.
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...values } as NodeJS.ProcessEnv;
}

const GROQ = {
  MUSK_LLM_BASE_URL: 'https://api.groq.com/openai/v1',
  MUSK_LLM_API_KEY: 'test-key',
  MUSK_LLM_MODEL: 'openai/gpt-oss-120b',
  MUSK_LLM_TEMPERATURE: '0.2',
};

describe('configuración del proveedor LLM', () => {
  it('sin claves no hay proveedor: el arnés queda determinista', () => {
    expect(loadLLMConfigFromEnv(env({}))).toBeNull();
  });

  // Half a config is the dangerous case: a base URL copied from .env.example
  // with an empty key must NOT enable the provider.
  it('una configuración a medias no activa el modelo', () => {
    expect(loadLLMConfigFromEnv(env({ MUSK_LLM_BASE_URL: GROQ.MUSK_LLM_BASE_URL }))).toBeNull();
    expect(loadLLMConfigFromEnv(env({ MUSK_LLM_API_KEY: GROQ.MUSK_LLM_API_KEY }))).toBeNull();
    expect(
      loadLLMConfigFromEnv(
        env({ MUSK_LLM_BASE_URL: GROQ.MUSK_LLM_BASE_URL, MUSK_LLM_API_KEY: '   ' }),
      ),
    ).toBeNull();
  });

  it('carga la configuración de Groq tal cual', () => {
    expect(loadLLMConfigFromEnv(env(GROQ))).toEqual({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'test-key',
      model: 'openai/gpt-oss-120b',
      temperature: 0.2,
    });
  });

  it('sin MUSK_LLM_MODEL usa un modelo por defecto y no una cadena vacía', () => {
    const config = loadLLMConfigFromEnv(
      env({ MUSK_LLM_BASE_URL: GROQ.MUSK_LLM_BASE_URL, MUSK_LLM_API_KEY: 'test-key' }),
    );

    expect(config?.model).toBe('gpt-4o-mini');
    expect(config?.temperature).toBe(0.2);
  });

  it('una temperatura ilegible cae al valor por defecto', () => {
    const config = loadLLMConfigFromEnv(env({ ...GROQ, MUSK_LLM_TEMPERATURE: 'caliente' }));

    expect(config?.temperature).toBe(0.2);
  });

  it('una temperatura válida se respeta', () => {
    const config = loadLLMConfigFromEnv(env({ ...GROQ, MUSK_LLM_TEMPERATURE: '0.7' }));

    expect(config?.temperature).toBe(0.7);
  });

  // The key would travel in clear text, so this is refused before the fetch.
  it('una URL sin https se rechaza antes de cualquier petición', async () => {
    const provider = new OpenAICompatibleLLM({
      baseUrl: 'http://api.groq.com/openai/v1',
      apiKey: 'test-key',
      model: 'openai/gpt-oss-120b',
      temperature: 0.2,
    });

    await expect(provider.complete({ system: 'sistema', messages: [] })).rejects.toThrow(/https/);
  });
});
