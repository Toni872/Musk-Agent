// Tests for the server-side rephrase proxy (src/rephrase-endpoint.ts).
//
// The endpoint must never leak secrets in responses and must enforce the
// approved controls. Access control (who may reach the function at all) is
// delegated to the deployment (Vercel Password Protection), so there is no
// token check inside the function.

import { describe, expect, it } from 'vitest';

import { handleRephrase } from '../src/rephrase-endpoint';

const GROQ_ENV = {
  MUSK_LLM_BASE_URL: 'https://api.groq.com/openai/v1',
  MUSK_LLM_API_KEY: 'super-secret-key',
  MUSK_LLM_MODEL: 'openai/gpt-oss-120b',
  MUSK_LLM_TEMPERATURE: '0.2',
};

function makeFetch(status: number, body: unknown, opts: { ok?: boolean } = {}): typeof fetch {
  return (async () => {
    const ok = opts.ok !== undefined ? opts.ok : status >= 200 && status < 300;
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
}

describe('rephrase endpoint', () => {
  it('returns 405 for non-POST', async () => {
    const result = await handleRephrase(
      { method: 'GET', headers: {}, body: {} },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(405);
    expect(result.body).toEqual({ error: 'method_not_allowed' });
  });

  it('returns 503 when config missing', async () => {
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: [] } },
      { env: {}, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'service_unavailable' });
  });

  it('returns 400 when body missing system', async () => {
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'hi' }] } },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'bad_request' });
  });

  it('returns 400 when messages empty', async () => {
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: [] } },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'bad_request' });
  });

  it('returns 400 when too many messages', async () => {
    const msgs = Array.from({ length: 61 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: String(i),
    }));
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: msgs } },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'bad_request' });
  });

  it('returns 400 for bad role', async () => {
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: [{ role: 'tool', content: 'hi' }] } },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'bad_request' });
  });

  it('returns 413 when serialized body too large', async () => {
    const long = 'a'.repeat(30005);
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: long, messages: [{ role: 'user', content: 'hi' }] } },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, {}) },
    );
    expect(result.status).toBe(413);
    expect(result.body).toEqual({ error: 'payload_too_large' });
  });

  it('happy path posts to upstream and returns text without leaking the API key', async () => {
    let calledUrl = '';
    let calledInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = typeof url === 'string' ? url : url.toString();
      calledInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Respuesta reformulada' } }],
        }),
      } as Response;
    }) as typeof fetch;

    const result = await handleRephrase(
      {
        method: 'POST',
        headers: {},
        body: { system: 'Sistema', messages: [{ role: 'user', content: 'Hola' }] },
      },
      { env: GROQ_ENV, fetchImpl },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ text: 'Respuesta reformulada' });
    expect(calledUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    const headers = (calledInit?.headers || {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer super-secret-key');
    const parsed = JSON.parse(calledInit?.body as string);
    expect(parsed.max_tokens).toBe(700);
    const bodyStr = JSON.stringify(result.body);
    expect(bodyStr.includes('super-secret-key')).toBe(false);
  });

  it('returns 502 when upstream returns non-ok', async () => {
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: [{ role: 'user', content: 'hi' }] } },
      { env: GROQ_ENV, fetchImpl: makeFetch(500, {}, { ok: false }) },
    );
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: 'bad_gateway' });
  });

  it('returns 502 when upstream returns no string content', async () => {
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: [{ role: 'user', content: 'hi' }] } },
      { env: GROQ_ENV, fetchImpl: makeFetch(200, { choices: [{ message: { content: 123 } }] }) },
    );
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: 'bad_gateway' });
  });

  it('refuses http baseUrl', async () => {
    const envHttp = { ...GROQ_ENV, MUSK_LLM_BASE_URL: 'http://api.groq.com/openai/v1' };
    const result = await handleRephrase(
      { method: 'POST', headers: {}, body: { system: 's', messages: [{ role: 'user', content: 'hi' }] } },
      { env: envHttp, fetchImpl: makeFetch(200, { choices: [{ message: { content: 'ok' } }] }) },
    );
    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: 'bad_gateway' });
  });
});
