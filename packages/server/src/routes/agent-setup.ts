import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config, normalizeServerUrl } from '../config.js';

export const agentSetupRouter = new Hono();

agentSetupRouter.get('/', (c) => {
  const serverUrl = resolveAgentBaseUrl(new URL(c.req.url).origin);
  const doc = readRemoteAgentsTemplate().replaceAll('%%SERVER_URL%%', serverUrl);
  return c.text(doc, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

function resolveAgentBaseUrl(requestOrigin: string): string {
  if (config.AI_SPACES_AGENT_BASE_URL) return config.AI_SPACES_AGENT_BASE_URL;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[config] AI_SPACES_AGENT_BASE_URL is required in production.');
  }
  return normalizeServerUrl(requestOrigin, 'request origin');
}

function readRemoteAgentsTemplate(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'REMOTE_AGENTS.md'),
    path.resolve(thisDir, '..', 'assets', 'REMOTE_AGENTS.md'),
  ];

  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error(`REMOTE_AGENTS.md not found. Checked: ${candidates.join(', ')}`);
  }

  return fs.readFileSync(filePath, 'utf-8');
}
