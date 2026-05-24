import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { listSpaces, initSpaceStore } from '../space-store.js';
import { registerWithServer } from '../registration.js';
import { config } from '../config.js';
import { createAcpWsServer, handleAcpUpgrade } from './acp-ws.js';

function initSpaceStoreFromConfig(): void {
  const configPath = path.join(config.OPENCLAW_HOME, '.openclaw', 'openclaw.json');
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const agentList: { id: string; workspace?: string }[] = raw?.agents?.list ?? [];
    const defaultWorkspace: string = raw?.agents?.defaults?.workspace ?? '';
    const agentWorkspaces = agentList.map((a) => ({
      agentId: a.id,
      workspaceRoot: a.workspace ?? defaultWorkspace,
    }));
    initSpaceStore(agentWorkspaces);
    console.log('[ai-spaces] Space store initialized for agents:', agentWorkspaces.map(w => w.agentId).join(', '));
  } catch (err) {
    throw new Error(`[ai-spaces] Could not initialize space store from config (${configPath}): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Starts a dedicated HTTP+WebSocket server for the plugin.
 * Handles the ACP WebSocket endpoint and basic HTTP endpoints.
 */
export function startSpacesServer(port: number): void {
  initSpaceStoreFromConfig();

  console.log(`[ai-spaces] Starting spaces server on port ${port}`);
  const httpServer = http.createServer(async (_req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(_req.url ?? '/', `http://localhost:${port}`);

    if (_req.method === 'GET' && url.pathname === '/api/spaces') {
      const spaces = listSpaces();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ spaces }));
      return;
    }

    if (_req.method === 'GET' && url.pathname === '/api/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.on('error', (err) => {
    console.error(`[ai-spaces] WebSocket server error:`, err.message);
  });

  const acpWss = createAcpWsServer();

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    const acpMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/acp$/);
    if (acpMatch) {
      handleAcpUpgrade(acpWss, req, socket, head, acpMatch[1]);
      return;
    }

    socket.destroy();
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[ai-spaces] WebSocket server listening on ws://0.0.0.0:${port}`);
  });
}

export async function registerAndStartSpacesServer(port: number): Promise<void> {
  const { serverId, callbackToken } = await registerWithServer();
  startSpacesServer(port);
  try {
    await fetch(`${config.AI_SPACES_URL}/api/internal/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.GATEWAY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaces: listSpaces(), serverId, callbackToken }),
    });
  } catch (err) {
    console.warn('[ai-spaces] Initial reconcile failed:', err instanceof Error ? err.message : String(err));
  }
}
