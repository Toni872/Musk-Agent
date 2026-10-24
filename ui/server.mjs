// Tiny static server for the built UI (ui/dist).
//
// A real HTTP server is required: opening index.html over file:// blocks ES
// modules (CORS), so the page would not load. No external dependencies.

import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(uiDir, 'dist');
const basePort = Number(process.env.PORT ?? 4173);

const CONTENT_TYPES = {
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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = resolve(distDir, normalize(relative));

    if (target !== distDir && !target.startsWith(distDir + sep)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('403 Forbidden');
      return;
    }

    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 Not Found');
  }
});

// Try a few ports so a busy default does not block the caller.
let port = basePort;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port < basePort + 10) {
    port += 1;
server.listen(port, '127.0.0.1');
    return;
  }
  console.error(`Server error: ${error.message}`);
  process.exit(1);
});

server.on('listening', () => {
  console.log(`MUSK UI: http://localhost:${port}/`);
  console.log('Ctrl+C para detener el servidor.');
});

server.listen(port);
