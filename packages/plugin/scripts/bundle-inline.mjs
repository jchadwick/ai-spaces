import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(__dirname, '..');
const rootDir = resolve(pluginDir, '../..');

async function build() {
  // Bundle plugin with inlined dependencies
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/index.js',
    external: [
      'openclaw',
      'openclaw/*',
      'bcrypt',
      'jsonwebtoken',
    ],
    packages: 'external',
    plugins: [{
      name: 'alias-shared',
      setup(build) {
        build.onResolve({ filter: /^@ai-spaces\/shared$/ }, () => {
          return { path: resolve(rootDir, 'packages/shared/src/index.ts') };
        });
      },
    }],
  });

  // Build setup entry separately
  await esbuild.build({
    entryPoints: ['src/setup-entry.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/setup-entry.js',
    external: ['openclaw', 'openclaw/*'],
  });

  // Copy web assets
  const webDist = resolve(pluginDir, '../web/dist');
  const pluginWebDist = resolve(pluginDir, 'dist/web');
  if (existsSync(webDist)) {
    mkdirSync(pluginWebDist, { recursive: true });
    cpSync(webDist, pluginWebDist, { recursive: true });
    console.log('Bundled web assets into plugin');
  } else {
    console.log('Web dist not found, skipping bundle');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});