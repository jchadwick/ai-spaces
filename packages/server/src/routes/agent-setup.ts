import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const agentSetupRouter = new Hono();

agentSetupRouter.get('/', (c) => {
  return c.text(readRemoteAgentsTemplate(), 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

agentSetupRouter.get('/*', (c) => {
  return c.text(readRemoteAgentsTemplate(), 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

function readRemoteAgentsTemplate(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'REMOTE_AGENTS.md'),
    path.resolve(process.cwd(), '..', '..', 'REMOTE_AGENTS.md'),
    path.resolve(thisDir, '..', '..', '..', '..', 'REMOTE_AGENTS.md'),
    path.resolve(thisDir, '..', 'assets', 'REMOTE_AGENTS.md'),
  ];

  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error(`REMOTE_AGENTS.md not found. Checked: ${candidates.join(', ')}`);
  }

  return fs.readFileSync(filePath, 'utf-8');
}
