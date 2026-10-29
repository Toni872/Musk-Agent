// Browser LLM provider that talks to the server-side rephrase proxy. Access
// control lives at the deployment (Vercel Password Protection), so no token is
// sent from the client. On any non-200 response the provider throws so the
// agent falls back to approved text, exactly as requested.

import type { LLMProvider, LLMRequest } from '../src/llm';

export class RemoteRephraseLLM implements LLMProvider {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 15000) {
    this.timeoutMs = timeoutMs;
  }

  async complete(request: LLMRequest): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch('/api/rephrase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system: request.system,
          messages: request.messages,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`rephrase failed: ${response.status}`);
      }
      const data = (await response.json()) as { text?: unknown };
      if (typeof data.text !== 'string') {
        throw new Error('rephrase missing text');
      }
      return data.text;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('rephrase timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
