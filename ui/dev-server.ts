// Local development server for the built UI.
//
// It serves `ui/dist` AND answers `POST /api/rephrase` with the exact same pure
// handler the deployed Vercel function runs (`src/rephrase-endpoint.ts`). That
// is what makes a local browser test faithful: same token check, same body
// validation, same rate limit, same upstream call, same safety caps. A static
// file server alone cannot do this, which is why the browser used to fall back
// to the deterministic text in local.
//
// `.env` is git-ignored and optional. Without it the proxy answers 503 and the
// UI degrades to the approved deterministic text, exactly like the deployment.

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleRephrase } from '../src/rephrase-endpoint';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env: the proxy will answer 503 and the UI falls back to approved text.
}

const uiDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(uiDir, 'dist');
const basePort = Number(process.env.PORT ?? 4173);
const MAX_BODY_BYTES = 64 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

try {
  await access(join(distDir, 'index.html'));
} catch {
  console.error('ui/dist is missing. Run first: npm run build:ui');
  process.exit(1);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejectBody(new Error('payload too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(distDir, normalize(relative));

  if (target !== distDir && !target.startsWith(distDir + sep)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('403 Forbidden');
    return;
  }

  const body = await readFile(target);
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
  });
  response.end(body);
}

async function serveRephrase(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    const raw = await readBody(request);
    body = raw === '' ? undefined : JSON.parse(raw);
  } catch {
    body = undefined; // the handler answers 400 for a missing or invalid body
  }

  const headers: Record<string, string | string[] | undefined> = {};
  for (const [name, value] of Object.entries(request.headers)) headers[name] = value;

  const result = await handleRephrase(
    { method: request.method ?? 'GET', headers, body },
    { env: process.env, fetchImpl: fetch, bypassAuth: true },
  );

  response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(result.body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/api/rephrase') {
      await serveRephrase(request, response);
      return;
    }
    await serveStatic(pathname, response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 Not Found');
  }
});

// Try a few ports so a busy default does not block the caller.
let port = basePort;
let attemptsLeft = 10;

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
    attemptsLeft -= 1;
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(`Server error: ${error.message}`);
  process.exit(1);
});

server.on('listening', () => {
  const address = server.address();
  const actual = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`MUSK UI: http://localhost:${actual}/`);
  console.log(
    process.env.MUSK_LLM_API_KEY !== undefined
      ? 'Model enabled (local, bound to 127.0.0.1): just open the URL, no token needed.'
      : 'No MUSK_LLM_API_KEY in .env: the UI runs in deterministic mode (no model).',
  );
  console.log('Ctrl+C para detener el servidor.');
});

server.listen(port, '127.0.0.1');
