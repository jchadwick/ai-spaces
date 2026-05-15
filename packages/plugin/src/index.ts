import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { aiSpacesPlugin } from './channel.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { setRuntime, tryGetRuntime } from './runtime.js';
import { getSpace, listSpaces, initSpaceStore, resolveSpaceRoot } from './space-store.js';
import { proxyRequest } from './routes/proxy.js';
import { handleSpaceWebSocket, startSpacesServer } from './routes/space-ws.js';
import { handleFileContent, handleFileTree, handleFileWrite, handleGetMetadata, handlePatchMetadata } from './routes/space-files.js';
import { validateSession } from './session-middleware.js';
import type { SpaceRole } from '@ai-spaces/shared';
import { toSpaceRole } from '@ai-spaces/shared';
import * as crypto from 'crypto';
import * as path from 'path';
import { config } from './config.js';
import { SpaceWatcher } from './space-watcher.js';
import { registerWithServer, clearRegistrationState } from './registration.js';

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: aiSpacesPlugin,
  setRuntime,

  async registerFull(api) {
    console.log('[ai-spaces] Registering proxy plugin');
    console.log('[ai-spaces] Proxying to:', config.AI_SPACES_URL);

    startSpacesServer(config.AI_SPACES_WS_PORT);

    const registration = await registerWithServer();
    const { serverId, callbackToken } = registration;

    // Build agent→workspace mapping from gateway config (authoritative source)
    const agentList = api.config.agents?.list ?? [];
    const agentWorkspaces = agentList
      .filter((a): a is typeof a & { workspace: string } => typeof a.workspace === 'string')
      .map(a => ({ agentId: a.id, workspaceRoot: a.workspace }));

    initSpaceStore(agentWorkspaces);

    // Start one watcher per unique workspace root
    const watchers: SpaceWatcher[] = [];
    const watchedRoots = new Set<string>();

    for (const { agentId, workspaceRoot } of agentWorkspaces) {
      if (watchedRoots.has(workspaceRoot)) continue;
      watchedRoots.add(workspaceRoot);
      const watcher = new SpaceWatcher(workspaceRoot, agentId);
      watcher.on('space:added', () => { void triggerReconcile(); });
      watcher.on('space:removed', () => { void triggerReconcile(); });
      watcher.start();
      watchers.push(watcher);
    }

    let reconcileInFlight = false;
    let reconcileDirty = false;

    async function triggerReconcile(): Promise<void> {
      reconcileDirty = true;
      if (reconcileInFlight) return;
      reconcileInFlight = true;
      try {
        while (reconcileDirty) {
          reconcileDirty = false;
          const resp = await fetch(`${config.AI_SPACES_URL}/api/internal/reconcile`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ spaces: listSpaces(), serverId, callbackToken }),
          });
          if (resp.status === 401) {
            console.warn('[ai-spaces] Server rejected callbackToken — clearing registration state and restarting');
            clearRegistrationState();
            process.exit(1);
          }
        }
      } catch (err) {
        console.warn('[ai-spaces] Reconcile trigger failed:', err instanceof Error ? err.message : String(err));
      } finally {
        reconcileInFlight = false;
      }
    }

    // Periodic reconciliation loop: re-sync every 60s regardless of file events
    const reconcileTimer = setInterval(() => { void triggerReconcile(); }, 60_000);

    const stopWatchers = () => {
      clearInterval(reconcileTimer);
      watchers.forEach(w => w.stop());
    };
    process.once('SIGTERM', stopWatchers);
    process.once('SIGINT', stopWatchers);

    void triggerReconcile();

    api.registerHttpRoute({
      path: '/api/spaces',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const isWebSocketUpgrade = req.headers.upgrade?.toLowerCase() === 'websocket';
        const isWsPath = url.pathname.match(/\/api\/spaces\/[^\/]+\/ws$/);
        
        if (isWebSocketUpgrade && isWsPath) {
          console.log('[ai-spaces] WebSocket upgrade request for:', url.pathname);
          return handleSpaceWebSocket(req, res);
        }
        
        return proxyRequest(req, res, `${config.AI_SPACES_URL}${url.pathname}`);
      },
    });

    api.registerHttpRoute({
      path: '/spaces-ws/:spaceId',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const isWebSocketUpgrade = req.headers.upgrade?.toLowerCase() === 'websocket';
        
        if (isWebSocketUpgrade) {
          return handleSpaceWebSocket(req, res);
        }
        
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found' }));
        return true;
      },
    });

    api.registerHttpRoute({
      path: '/api/spaces/',
      auth: 'plugin',
      match: 'prefix',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        if (req.headers.upgrade?.toLowerCase() === 'websocket') {
          if (url.pathname.match(/\/api\/spaces\/[^\/]+\/ws$/)) {
            return handleSpaceWebSocket(req, res);
          }
        }

        // OPTIONS preflight for metadata endpoint
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, PUT, POST, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.writeHead(204);
          res.end();
          return true;
        }

        // File content: plugin owns all file I/O
        if (req.method === 'PUT') {
          const fileWriteMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/files\/(.+)$/);
          if (fileWriteMatch) {
            const [, spaceId, filePath] = fileWriteMatch;
            return handleFileWrite(req, res, spaceId, decodeURIComponent(filePath));
          }
        }

        if (req.method === 'PATCH') {
          const metaPatchMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/metadata$/);
          if (metaPatchMatch) {
            const [, spaceId] = metaPatchMatch;
            return handlePatchMetadata(req, res, spaceId);
          }
        }

        if (req.method === 'GET') {
          const metaGetMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/metadata$/);
          if (metaGetMatch) {
            const [, spaceId] = metaGetMatch;
            return handleGetMetadata(req, res, spaceId);
          }

          const fileContentMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/files\/(.+)$/);
          if (fileContentMatch) {
            const [, spaceId, filePath] = fileContentMatch;
            return handleFileContent(req, res, spaceId, decodeURIComponent(filePath));
          }

          const fileTreeMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/files$/);
          if (fileTreeMatch) {
            const [, spaceId] = fileTreeMatch;
            const roleParam = url.searchParams.get('role');
            const role: SpaceRole = toSpaceRole(roleParam);
            return handleFileTree(req, res, spaceId, role);
          }
        }

        return proxyRequest(req, res, `${config.AI_SPACES_URL}${url.pathname}${url.search}`);
      },
    });

    api.registerHttpRoute({
      path: '/api/auth/login',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        return proxyRequest(req, res, `${config.AI_SPACES_URL}/api/auth/login`);
      },
    });

    api.registerHttpRoute({
      path: '/api/auth/logout',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        return proxyRequest(req, res, `${config.AI_SPACES_URL}/api/auth/logout`);
      },
    });

    api.registerHttpRoute({
      path: '/api/auth/refresh',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        return proxyRequest(req, res, `${config.AI_SPACES_URL}/api/auth/refresh`);
      },
    });

    api.registerHttpRoute({
      path: '/api/chat/send',
      auth: 'plugin' as any,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const runtime = tryGetRuntime();
        if (!runtime?.agent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Agent runtime not available' }));
          return true;
        }

        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        let params: { spaceId: string; content: string };
        try {
          params = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return true;
        }

        const { spaceId, content } = params;
        const space = getSpace(spaceId);
        if (!space) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Space not found' }));
          return true;
        }

        const fullSpacePath = resolveSpaceRoot(space);
        const messageId = crypto.randomBytes(8).toString('hex');

        let responseText = '';

        await runtime.agent.runEmbeddedPiAgent({
          sessionId: `space:${spaceId}:http`,
          runId: messageId,
          sessionFile: path.join(fullSpacePath, '.sessions', `space-${spaceId}-http.jsonl`),
          workspaceDir: fullSpacePath,
          prompt: content,
          timeoutMs: 120000,
          onPartialReply: (payload: { text?: string }) => {
            if (payload.text) responseText += payload.text;
          },
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ response: responseText, messageId }));
        return true;
      },
    });

    api.registerCli(
      ({ program }) => {
        const spaces = program.command('spaces').description('Manage AI Spaces');

        spaces
          .command('list')
          .description('List discovered spaces')
          .option('--json', 'Output as JSON')
          .action(async (options: { json?: boolean }) => {
            const { listSpaces } = await import('./cli/list.js');
            await listSpaces(options);
          });

        spaces
          .command('show <spaceId>')
          .description('Show space details')
          .option('--json', 'Output as JSON')
          .action(async (spaceId: string, options: { json?: boolean }) => {
            const { showSpace } = await import('./cli/show.js');
            await showSpace(spaceId, options);
          });

        spaces
          .command('create <path>')
          .description('Create a new space')
          .option('--json', 'Output as JSON')
          .option('--name <name>', 'Display name for the space')
          .option('--description <description>', 'Description of the space')
          .action(async (spacePath: string, options: { json?: boolean; name?: string; description?: string }) => {
            const { createSpace } = await import('./cli/create.js');
            await createSpace(spacePath, options);
          });

        spaces
          .command('remove <spaceId>')
          .description('Remove a space')
          .option('--json', 'Output as JSON')
          .option('--force', 'Confirm deletion')
          .action(async (spaceId: string, options: { json?: boolean; force?: boolean }) => {
            const { removeSpace } = await import('./cli/remove.js');
            await removeSpace(spaceId, options);
          });

        spaces
          .command('invite <spaceId>')
          .description('Create an invite for a space')
          .option('--role <role>', 'Role for invite (viewer/editor/owner)', 'editor')
          .option('--json', 'Output as JSON')
          .action(async (spaceId: string, options: { json?: boolean; role?: string }) => {
            const { createInvite } = await import('./cli/invite.js');
            await createInvite(spaceId, options);
          });
      },
      {
        commands: ['spaces'],
        descriptors: [
          {
            name: 'spaces',
            description: 'Manage AI Spaces',
            hasSubcommands: true,
          },
        ],
      }
    );
  },
});