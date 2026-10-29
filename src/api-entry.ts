import { handleRephrase } from './rephrase-endpoint';

// Minimal structural types for the Vercel Node function signature. Declaring
// them here keeps `@vercel/node` (only needed at build time by the platform)
// out of the project, so `tsc --noEmit` and CI stay clean without a new
// dependency. The runtime passes exactly these fields.
interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): { json(body: unknown): void };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = value as string | string[] | undefined;
  }

  let body: unknown = undefined;
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
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
      method: typeof req.method === 'string' ? req.method : 'GET',
      headers,
      body,
    },
    {
      env: process.env as Record<string, string | undefined>,
      fetchImpl: fetch,
    },
  );

  res.status(result.status).json(result.body);
}
