import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { aiSpacesPlugin } from './channel.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { setRuntime } from './runtime.js';
import { listSpaces, initSpaceStore } from './space-store.js';
import { proxyRequest } from './routes/proxy.js';
import { startSpacesServer } from './routes/space-ws.js';
import { config } from './config.js';
import { SpaceWatcher } from './space-watcher.js';
import { registerWithServer, clearRegistrationState, loadRegistrationState } from './registration.js';
import { logger as rootLogger } from './logger.js';
import { cleanOrphanedFiles } from './cleanup.js';
import { runPluginPreflightChecks } from './preflight.js';

const log = rootLogger.child({ component: 'plugin' });

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: aiSpacesPlugin,
  setRuntime,

  async registerFull(api) {
    log.info('Registering proxy plugin');
    log.info({ url: config.AI_SPACES_URL }, 'Proxying to server');

    startSpacesServer(config.AI_SPACES_WS_PORT);

    const agentList = api.config.agents?.list ?? [];
    const agentWorkspaces = agentList
      .filter((a): a is typeof a & { workspace: string } => typeof a.workspace === 'string')
      .map(a => ({ agentId: a.id, workspaceRoot: a.workspace }));

    await runPluginPreflightChecks(agentWorkspaces);

    const registration = await registerWithServer();
    const { serverId, callbackToken } = registration;

    initSpaceStore(agentWorkspaces);

    // Clean up orphaned .tmp and .lock files from any previous crashed processes
    for (const { workspaceRoot } of agentWorkspaces) {
      cleanOrphanedFiles(workspaceRoot);
    }

    type ConnectionState = 'connected' | 'degraded' | 'reconnecting';
    let connectionState: ConnectionState = 'connected';

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
            log.warn('Server rejected callbackToken — clearing registration state and restarting');
            clearRegistrationState();
            process.exit(1);
          }
          if (connectionState !== 'connected') {
            connectionState = 'connected';
            log.info('Server connection restored');
          }
        }
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Reconcile trigger failed');
        if (connectionState === 'connected') {
          connectionState = 'degraded';
          log.warn('Entering degraded (read-only) mode — server unreachable');
        }
      } finally {
        reconcileInFlight = false;
      }
    }

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
      path: '/health',
      auth: 'plugin',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        // Check filesystem
        let filesystemStatus: 'ok' | 'error' = 'ok';
        for (const { workspaceRoot } of agentWorkspaces) {
          try {
            const { accessSync, constants: fsConstants } = await import('fs');
            accessSync(workspaceRoot, fsConstants.R_OK);
          } catch {
            filesystemStatus = 'error';
            break;
          }
        }

        // Check server reachability
        let serverStatus: 'ok' | 'unreachable' = 'ok';
        try {
          const serverRes = await fetch(`${config.AI_SPACES_URL}/health`, {
            signal: AbortSignal.timeout(2000),
          });
          serverStatus = serverRes.ok ? 'ok' : 'unreachable';
        } catch {
          serverStatus = 'unreachable';
        }

        const registration = loadRegistrationState();
        const degraded = filesystemStatus !== 'ok' || serverStatus === 'unreachable' || connectionState === 'degraded';

        const body = JSON.stringify({
          status: degraded ? 'degraded' : 'ok',
          filesystem: filesystemStatus,
          server: serverStatus,
          connection: connectionState,
          registration: registration ? 'registered' : 'unregistered',
          uptime: Math.floor(process.uptime()),
        });

        res.statusCode = degraded ? 503 : 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
        return true;
      },
    });

    api.registerHttpRoute({
      path: '/api/spaces',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        return proxyRequest(req, res, `${config.AI_SPACES_URL}${url.pathname}`);
      },
    });

    api.registerHttpRoute({
      path: '/api/spaces/',
      auth: 'plugin',
      match: 'prefix',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        // OPTIONS preflight
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, PUT, POST, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.writeHead(204);
          res.end();
          return true;
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
        res.statusCode = 410;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Legacy chat endpoint disabled. Use ACP chat.' }));
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
