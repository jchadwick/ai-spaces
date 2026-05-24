import { build } from 'esbuild';
import { glob } from 'glob';
import { copyFileSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

rmSync('dist', { recursive: true, force: true });

const files = await glob('src/**/*.ts', { ignore: ['**/*.test.ts', '**/*.spec.ts'] });

await build({
  entryPoints: files,
  outdir: 'dist',
  outbase: 'src',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: false,
  sourcemap: true,
  logLevel: 'info',
});

mkdirSync('dist/assets', { recursive: true });
copyFileSync(resolve('..', '..', 'REMOTE_AGENTS.md'), 'dist/assets/REMOTE_AGENTS.md');
