// Build script for the MUSK static UI.
//
// Produces ui/dist/ as a self-contained folder that can be published as-is
// (e.g. GitHub Pages under a subpath): index.html + styles.css + app.js.
// index.html references ./app.js and ./styles.css with RELATIVE paths, so the
// page works both at a domain root and under /callsagents/musk-ui/.

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(uiDir, 'dist');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

// Minified by default: the bundle is served to the browser, so shipping it
// unminified would expose internal source comments (editorial notes, pending
// sign-off markers) to anyone opening devtools. Set MUSK_UI_NO_MINIFY=1 to get
// a readable bundle when debugging in the browser.
const minify = process.env.MUSK_UI_NO_MINIFY !== '1';

await build({
  entryPoints: [join(uiDir, 'main.ts')],
  outfile: join(distDir, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify,
  legalComments: 'none',
  logLevel: 'info',
});

await cp(join(uiDir, 'index.html'), join(distDir, 'index.html'));
await cp(join(uiDir, 'styles.css'), join(distDir, 'styles.css'));

console.log(`ui/dist ready: ${distDir}`);
