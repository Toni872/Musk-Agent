// GENERATED FILE - do not edit. Source: src/api-entry.ts. Regenerate with `npm run build:api`.

// src/rephrase-endpoint.ts
import { createHash, timingSafeEqual } from "node:crypto";

// src/llm.ts
function loadLLMConfigFromEnv(env = process.env) {
  const baseUrl = env.MUSK_LLM_BASE_URL?.trim();
  const apiKey = env.MUSK_LLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  const parsed = env.MUSK_LLM_TEMPERATURE !== void 0 ? Number(env.MUSK_LLM_TEMPERATURE) : 0.2;
  return {
    baseUrl,
    apiKey,
    // Default target: an OpenAI-compatible /v1 endpoint. Override via env.
    model: env.MUSK_LLM_MODEL?.trim() || "gpt-4o-mini",
    temperature: Number.isFinite(parsed) ? parsed : 0.2
  };
}

// src/rephrase-endpoint.ts
var MAX_BODY_CHARS = 8e3;
var MAX_MESSAGES = 4;
var MAX_CALLS_PER_MINUTE = 30;
var UPSTREAM_TIMEOUT_MS = 15e3;
var MAX_TOKENS = 320;
var rateLimitMap = /* @__PURE__ */ new Map();
function getClientIp(headers) {
  const forwarded = headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    const first = forwarded[0];
    if (typeof first === "string" && first.trim()) {
      const ip = first.split(",")[0];
      return ip && ip.trim() || "unknown";
    }
    return "unknown";
  }
  if (typeof forwarded === "string" && forwarded.trim()) {
    const ip = forwarded.split(",")[0];
    return ip && ip.trim() || "unknown";
  }
  const realIp = headers["x-real-ip"];
  if (Array.isArray(realIp)) {
    const first = realIp[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    return "unknown";
  }
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return "unknown";
}
function isRateLimited(ip, now) {
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (now - entry.windowStart >= 6e4) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_CALLS_PER_MINUTE) {
    return true;
  }
  entry.count += 1;
  return false;
}
function hashToBuffer(value) {
  return createHash("sha256").update(value).digest();
}
function tokensMatch(provided, expected) {
  const providedHash = hashToBuffer(provided);
  const expectedHash = hashToBuffer(expected);
  try {
    return timingSafeEqual(providedHash, expectedHash);
  } catch {
    return false;
  }
}
function loadServerConfigFromEnv(env) {
  const token = env.MUSK_DEMO_TOKEN?.trim();
  if (!token) return null;
  const llm = loadLLMConfigFromEnv(env);
  if (!llm) return null;
  return {
    apiKey: llm.apiKey,
    baseUrl: llm.baseUrl,
    model: llm.model,
    temperature: llm.temperature,
    token
  };
}
function errorBody(code) {
  return { error: code };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isValidBody(body) {
  if (!isRecord(body)) return false;
  const system = body["system"];
  if (typeof system !== "string" || system.length === 0) return false;
  const messages = body["messages"];
  if (!Array.isArray(messages)) return false;
  if (messages.length === 0 || messages.length > MAX_MESSAGES) return false;
  for (const msg of messages) {
    if (!isRecord(msg)) return false;
    const role = msg["role"];
    if (role !== "system" && role !== "user" && role !== "assistant") return false;
    const content = msg["content"];
    if (typeof content !== "string") return false;
  }
  return true;
}
function getHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : void 0;
      }
      return typeof value === "string" ? value : void 0;
    }
  }
  return void 0;
}
async function handleRephrase(request, deps) {
  if (request.method !== "POST") {
    return { status: 405, body: errorBody("method_not_allowed") };
  }
  const config = loadServerConfigFromEnv(deps.env);
  if (!config) {
    return { status: 503, body: errorBody("service_unavailable") };
  }
  const demoToken = getHeader(request.headers, "x-demo-token");
  if (typeof demoToken !== "string" || demoToken.length === 0) {
    return { status: 401, body: errorBody("unauthorized") };
  }
  if (demoToken.length !== config.token.length || !tokensMatch(demoToken, config.token)) {
    return { status: 401, body: errorBody("unauthorized") };
  }
  if (!isValidBody(request.body)) {
    return { status: 400, body: errorBody("bad_request") };
  }
  let serialized;
  try {
    serialized = JSON.stringify(request.body);
  } catch {
    return { status: 400, body: errorBody("bad_request") };
  }
  if (serialized.length > MAX_BODY_CHARS) {
    return { status: 413, body: errorBody("payload_too_large") };
  }
  if (!config.baseUrl.toLowerCase().startsWith("https://")) {
    return { status: 502, body: errorBody("bad_gateway") };
  }
  const ip = getClientIp(request.headers);
  const now = Date.now();
  isRateLimited(ip, now);
  const url = config.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await deps.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "system", content: request.body.system }, ...request.body.messages]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    let data;
    try {
      data = await response.json();
    } catch {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    if (!isRecord(data)) {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    const choices = data["choices"];
    if (!Array.isArray(choices) || choices.length === 0) {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    const first = choices[0];
    if (!isRecord(first)) {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    const message = first["message"];
    if (!isRecord(message)) {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    const content = message["content"];
    if (typeof content !== "string") {
      return { status: 502, body: errorBody("bad_gateway") };
    }
    return { status: 200, body: { text: content } };
  } catch {
    return { status: 502, body: errorBody("bad_gateway") };
  } finally {
    clearTimeout(timeoutId);
  }
}

// src/api-entry.ts
async function handler(req, res) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = value;
  }
  let body = void 0;
  if (req.body !== void 0 && req.body !== null) {
    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = req.body;
      }
    } else {
      body = req.body;
    }
  }
  const result = await handleRephrase(
    {
      method: typeof req.method === "string" ? req.method : "GET",
      headers,
      body
    },
    {
      env: process.env,
      fetchImpl: fetch
    }
  );
  res.status(result.status).json(result.body);
}
export {
  handler as default
};
