import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { aiSpacesPlugin } from './channel.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { setRuntime, tryGetRuntime } from './runtime.js';
import { getSpace } from './space-store.js';
import { proxyRequest } from './routes/proxy.js';
import { handleSpaceWebSocket, startWebSocketServer } from './routes/space-ws.js';
import * as crypto from 'crypto';
import * as path from 'path';
import { config } from './config.js';

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: aiSpacesPlugin,
  setRuntime,

  async registerFull(api) {
    console.log('[ai-spaces] Registering proxy plugin');
    console.log('[ai-spaces] Proxying to:', config.AI_SPACES_URL);

    startWebSocketServer(config.AI_SPACES_WS_PORT);

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
        const isWebSocketUpgrade = req.headers.upgrade?.toLowerCase() === 'websocket';
        const isWsPath = url.pathname.match(/\/api\/spaces\/[^\/]+\/ws$/);
        
        if (isWebSocketUpgrade && isWsPath) {
          return handleSpaceWebSocket(req, res);
        }
        
        const targetPath = url.pathname.replace(/^\/api/, '/api');
        return proxyRequest(req, res, `${config.AI_SPACES_URL}${targetPath}`);
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

        const fullSpacePath = path.join(config.OPENCLAW_HOME, 'workspace', space.path);
        const messageId = crypto.randomBytes(8).toString('hex');

        let responseText = '';

        await runtime.agent.runEmbeddedPiAgent({
          sessionId: `space:${spaceId}:http`,
          runId: messageId,
          sessionFile: path.join(config.OPENCLAW_HOME, 'sessions', `space-${spaceId}-http.jsonl`),
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