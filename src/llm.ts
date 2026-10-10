// LLM provider abstraction. No SDK: the concrete provider talks to any
// OpenAI-compatible endpoint through global fetch. MockProvider backs the
// offline tests and the deterministic simulation mode.

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: LLMChatMessage[];
}

export interface LLMProvider {
  complete(request: LLMRequest): Promise<string>;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

// Optional configuration: when MUSK_LLM_BASE_URL / MUSK_LLM_API_KEY are absent
// the harness runs in deterministic mode (approved replies only).
export function loadLLMConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LLMConfig | null {
  const baseUrl = env.MUSK_LLM_BASE_URL?.trim();
  const apiKey = env.MUSK_LLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  const parsed = env.MUSK_LLM_TEMPERATURE !== undefined ? Number(env.MUSK_LLM_TEMPERATURE) : 0.2;
  return {
    baseUrl,
    apiKey,
    // Default target: an OpenAI-compatible /v1 endpoint. Override via env.
    model: env.MUSK_LLM_MODEL?.trim() || 'gpt-4o-mini',
    temperature: Number.isFinite(parsed) ? parsed : 0.2,
  };
}

export class OpenAICompatibleLLM implements LLMProvider {
  constructor(private readonly config: LLMConfig) {}

  async complete(request: LLMRequest): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('LLM response missing message content');
    }
    return content;
  }
}

// Scripted provider for tests: never touches the network. Records every call
// so tests can assert that guarded intents never reach the LLM.
export class MockProvider implements LLMProvider {
  public readonly calls: LLMRequest[] = [];

  constructor(
    private readonly responder: string | ((request: LLMRequest) => string) = 'Respuesta simulada del proveedor.',
  ) {}

  async complete(request: LLMRequest): Promise<string> {
    this.calls.push(request);
    return typeof this.responder === 'string' ? this.responder : this.responder(request);
  }
}
