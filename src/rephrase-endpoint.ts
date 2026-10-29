// Server-side rephrase proxy logic. Pure, testable: no Node HTTP, no Vercel
// types, only an injected fetch. Business rules live here so the thin Vercel
// adapter cannot leak them.
//
// Access control is delegated to the deployment (Vercel Password Protection):
// whoever reaches this function already passed the site-wide password, so the
// function itself carries no token check.

import { loadLLMConfigFromEnv } from './llm';

const MAX_BODY_CHARS = 30000;
const MAX_MESSAGES = 60;
const MAX_CALLS_PER_MINUTE = 30;
const UPSTREAM_TIMEOUT_MS = 30000;
const MAX_TOKENS = 700;

type RateLimitEntry = {
  count: number;
  windowStart: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) {
    const first = forwarded[0];
    if (typeof first === 'string' && first.trim()) {
      const ip = first.split(',')[0];
      return (ip && ip.trim()) || 'unknown';
    }
    return 'unknown';
  }
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const ip = forwarded.split(',')[0];
    return (ip && ip.trim()) || 'unknown';
  }
  const realIp = headers['x-real-ip'];
  if (Array.isArray(realIp)) {
    const first = realIp[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    return 'unknown';
  }
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return 'unknown';
}

function isRateLimited(ip: string, now: number): boolean {
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (now - entry.windowStart >= 60000) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_CALLS_PER_MINUTE) {
    return true;
  }
  entry.count += 1;
  return false;
}

export interface ServerConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export function loadServerConfigFromEnv(env: Record<string, string | undefined>): ServerConfig | null {
  const llm = loadLLMConfigFromEnv(env as NodeJS.ProcessEnv);
  if (!llm) return null;
  return {
    apiKey: llm.apiKey,
    baseUrl: llm.baseUrl,
    model: llm.model,
    temperature: llm.temperature,
  };
}

export interface RephraseRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface RephraseDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
}

type ErrorBody = { error: string };

function errorBody(code: string): ErrorBody {
  return { error: code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBody(
  body: unknown,
): body is { system: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> } {
  if (!isRecord(body)) return false;
  const system = body['system'];
  if (typeof system !== 'string' || system.length === 0) return false;
  const messages = body['messages'];
  if (!Array.isArray(messages)) return false;
  if (messages.length === 0 || messages.length > MAX_MESSAGES) return false;
  for (const msg of messages) {
    if (!isRecord(msg)) return false;
    const role = msg['role'];
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return false;
    const content = msg['content'];
    if (typeof content !== 'string') return false;
  }
  return true;
}

export async function handleRephrase(request: RephraseRequest, deps: RephraseDeps): Promise<{ status: number; body: unknown }> {
  if (request.method !== 'POST') {
    return { status: 405, body: errorBody('method_not_allowed') };
  }

  const config = loadServerConfigFromEnv(deps.env);
  if (!config) {
    return { status: 503, body: errorBody('service_unavailable') };
  }

  if (!isValidBody(request.body)) {
    return { status: 400, body: errorBody('bad_request') };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(request.body);
  } catch {
    return { status: 400, body: errorBody('bad_request') };
  }
  if (serialized.length > MAX_BODY_CHARS) {
    return { status: 413, body: errorBody('payload_too_large') };
  }

  if (!config.baseUrl.toLowerCase().startsWith('https://')) {
    return { status: 502, body: errorBody('bad_gateway') };
  }

  const ip = getClientIp(request.headers);
  const now = Date.now();
  isRateLimited(ip, now);

  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await deps.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: request.body.system }, ...request.body.messages],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    if (!isRecord(data)) {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    const choices = data['choices'];
    if (!Array.isArray(choices) || choices.length === 0) {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    const first = choices[0];
    if (!isRecord(first)) {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    const message = first['message'];
    if (!isRecord(message)) {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    const content = message['content'];
    if (typeof content !== 'string') {
      return { status: 502, body: errorBody('bad_gateway') };
    }
    return { status: 200, body: { text: content } };
  } catch {
    return { status: 502, body: errorBody('bad_gateway') };
  } finally {
    clearTimeout(timeoutId);
  }
}
