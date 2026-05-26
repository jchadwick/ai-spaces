import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { aiSpacesPlugin } from './channel.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { setRuntime } from './runtime.js';
import { listSpaces, initSpaceStore } from './space-store.js';
import { proxyRequest } from './routes/proxy.js';
import { startSpacesServer } from './routes/space-ws.js';
import { config, configStatus, diagnostics as configDiagnostics } from './config.js';
import { SpaceWatcher } from './space-watcher.js';
import { registerWithServer, clearRegistrationState, loadRegistrationState, type RegistrationState } from './registration.js';
import { logger as rootLogger } from './logger.js';
import { cleanOrphanedFiles } from './cleanup.js';
import { runPluginPreflightChecks } from './preflight.js';

const log = rootLogger.child({ component: 'plugin' });

function safeRouteUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url || '/', 'http://localhost');
  } catch {
    return null;
  }
}

function safeCliAction<TArgs extends unknown[]>(actionName: string, fn: (...args: TArgs) => Promise<void>) {
  return async (...args: TArgs): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err: message, actionName }, 'CLI action failed');
      console.error(`Error: ${message}`);
    }
  };
}

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: aiSpacesPlugin,
  setRuntime,

  async registerFull(api) {
    log.info('Registering proxy plugin');
    log.info({ url: config.AI_SPACES_URL }, 'Proxying to server');

    try {
      startSpacesServer(config.AI_SPACES_WS_PORT);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Could not start spaces server; continuing in degraded mode');
    }

    const agentList = api.config.agents?.list ?? [];
    const agentWorkspaces = agentList
      .filter((a): a is typeof a & { workspace: string } => typeof a.workspace === 'string')
      .map(a => ({ agentId: a.id, workspaceRoot: a.workspace }));

    try {
      await runPluginPreflightChecks(agentWorkspaces);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Preflight failed; continuing in degraded mode');
    }

    let registration: RegistrationState | null = null;
    try {
      registration = await registerWithServer();
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Registration failed; continuing in degraded mode');
    }

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
          if (!registration || !configStatus.hasGatewayToken) {
            if (connectionState === 'connected') {
              connectionState = 'degraded';
            }
            return;
          }

          const resp = await fetch(`${config.AI_SPACES_URL}/api/internal/reconcile`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ spaces: listSpaces(), serverId: registration.serverId, callbackToken: registration.callbackToken }),
          });
          if (resp.status === 401 || resp.status === 403) {
            log.warn('Server rejected callbackToken — clearing registration state and entering degraded mode');
            clearRegistrationState();
            registration = null;
            connectionState = 'degraded';
            return;
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
      try {
        watcher.start();
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err), workspaceRoot }, 'Watcher failed to start; continuing');
        continue;
      }
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
        const degraded =
          filesystemStatus !== 'ok'
          || serverStatus === 'unreachable'
          || connectionState === 'degraded'
          || configStatus.isDegraded;

        const body = JSON.stringify({
          status: degraded ? 'degraded' : 'ok',
          filesystem: filesystemStatus,
          server: serverStatus,
          connection: connectionState,
          registration: registration ? 'registered' : 'unregistered',
          config: {
            status: configStatus.isDegraded ? 'degraded' : 'ok',
            hasGatewayToken: configStatus.hasGatewayToken,
            invalid: configDiagnostics.invalid,
            warnings: configDiagnostics.warnings,
          },
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
        const url = safeRouteUrl(req);
        if (!url) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid request URL' }));
          return true;
        }
        return proxyRequest(req, res, `${config.AI_SPACES_URL}${url.pathname}`);
      },
    });

    api.registerHttpRoute({
      path: '/api/spaces/',
      auth: 'plugin',
      match: 'prefix',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = safeRouteUrl(req);
        if (!url) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid request URL' }));
          return true;
        }

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
          .action(safeCliAction('spaces list', async (options: { json?: boolean }) => {
            const { listSpaces } = await import('./cli/list.js');
            await listSpaces(options);
          }));

        spaces
          .command('show <spaceId>')
          .description('Show space details')
          .option('--json', 'Output as JSON')
          .action(safeCliAction('spaces show', async (spaceId: string, options: { json?: boolean }) => {
            const { showSpace } = await import('./cli/show.js');
            await showSpace(spaceId, options);
          }));

        spaces
          .command('create <path>')
          .description('Create a new space')
          .option('--json', 'Output as JSON')
          .option('--name <name>', 'Display name for the space')
          .option('--description <description>', 'Description of the space')
          .action(safeCliAction('spaces create', async (spacePath: string, options: { json?: boolean; name?: string; description?: string }) => {
            const { createSpace } = await import('./cli/create.js');
            await createSpace(spacePath, options);
          }));

        spaces
          .command('remove <spaceId>')
          .description('Remove a space')
          .option('--json', 'Output as JSON')
          .option('--force', 'Confirm deletion')
          .action(safeCliAction('spaces remove', async (spaceId: string, options: { json?: boolean; force?: boolean }) => {
            const { removeSpace } = await import('./cli/remove.js');
            await removeSpace(spaceId, options);
          }));

        spaces
          .command('invite <spaceId>')
          .description('Create an invite for a space')
          .option('--role <role>', 'Role for invite (viewer/editor/owner)', 'editor')
          .option('--json', 'Output as JSON')
          .action(safeCliAction('spaces invite', async (spaceId: string, options: { json?: boolean; role?: string }) => {
            const { createInvite } = await import('./cli/invite.js');
            await createInvite(spaceId, options);
          }));
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
