import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';

export const pluginsRouter = new Hono();

pluginsRouter.get('/:artifact', (c) => {
  const artifact = c.req.param('artifact');
  const target = resolvePluginArtifact(artifact);
  if (!target) return c.text('Plugin artifact not found', 404);

  const body = fs.readFileSync(target);
  return c.body(body, 200, {
    'Content-Type': getContentType(target),
    'Content-Length': String(body.byteLength),
    'Content-Disposition': `attachment; filename="${path.basename(target)}"`,
    'Cache-Control': path.basename(target).includes('latest') ? 'no-cache' : 'public, max-age=3600',
  });
});

function resolvePluginArtifact(artifact: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(artifact);
  } catch {
    return null;
  }

  if (!decoded || decoded !== path.basename(decoded) || decoded.startsWith('.')) return null;
  if (!fs.existsSync(config.AI_SPACES_PLUGIN_DIR)) return null;

  const base = fs.realpathSync(config.AI_SPACES_PLUGIN_DIR);
  const candidate = path.resolve(base, decoded);
  if (!candidate.startsWith(`${base}${path.sep}`)) return null;
  if (!fs.existsSync(candidate)) return null;

  const realTarget = fs.realpathSync(candidate);
  if (!realTarget.startsWith(`${base}${path.sep}`)) return null;
  const stat = fs.statSync(realTarget);
  return stat.isFile() ? realTarget : null;
}

function getContentType(filePath: string): string {
  if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) return 'application/gzip';
  const ext = path.extname(filePath);
  const types: Record<string, string> = {
    '.json': 'application/json',
    '.zip': 'application/zip',
  };
  return types[ext] || 'application/octet-stream';
}
