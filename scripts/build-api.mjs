// Bundles the Vercel API entry into a self-contained ESM function.
//
// Why this exists: the project is ESM ("type": "module"), so Vercel compiles
// api/*.ts to api/*.js and keeps relative import specifiers verbatim. Node's
// ESM loader cannot resolve an extensionless specifier like
// `../src/rephrase-endpoint`, so the function crashed at load with
// ERR_MODULE_NOT_FOUND. Bundling with esbuild produces a single file with no
// runtime imports, which the platform deploys as-is.
//
// The output (api/rephrase.js) is committed so the function always exists in
// the uploaded source, independent of the platform's build order. Run
// `npm run build:api` after editing src/api-entry.ts or src/rephrase-endpoint.ts.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src/api-entry.ts')],
  outfile: path.join(root, 'api/rephrase.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
  banner: {
    js: '// GENERATED FILE - do not edit. Source: src/api-entry.ts. Regenerate with `npm run build:api`.',
  },
});

console.log('api/rephrase.js ready');
