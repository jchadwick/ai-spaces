import { build } from 'esbuild';
import { glob } from 'glob';
import { rmSync } from 'fs';

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
