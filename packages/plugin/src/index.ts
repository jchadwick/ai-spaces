import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { aiSpacesPlugin } from './channel.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleListSpaces, handleGetSpace, handleCreateSpace } from './routes/space-info.js';
import { handleFileTree, handleFileContent } from './routes/space-files.js';
import { handleSpaceWebSocket } from './routes/space-ws.js';
import { handleLogin, handleLogout } from './routes/auth.js';
import { setRuntime } from './runtime.js';
import { seedAdminUser } from './seed-admin.js';

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: aiSpacesPlugin,
  setRuntime,

  async registerFull(api) {
    api.logger.info('[ai-spaces] Registerizing full plugin');

    api.registerHttpRoute({
      path: '/api/spaces',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return true;
        }
        
        if (req.method === 'GET') {
          return handleListSpaces(req, res);
        }
        
        if (req.method === 'POST') {
          return handleCreateSpace(req, res);
        }
        
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return true;
      },
    });

    api.registerHttpRoute({
      path: '/api/spaces/',
      auth: 'plugin',
      match: 'prefix',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return true;
        }
        
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        
        const wsMatch = url.pathname.match(/^\/api\/spaces\/([^\/]+)\/ws$/);
        if (wsMatch && req.headers.upgrade?.toLowerCase() === 'websocket') {
          return handleSpaceWebSocket(req, res);
        }
        
        const fileTreeMatch = url.pathname.match(/^\/api\/spaces\/([^\/]+)\/files$/);
        if (fileTreeMatch && req.method === 'GET') {
          const spaceId = fileTreeMatch[1];
          const role = (url.searchParams.get('role') as 'viewer' | 'editor' | 'admin') || 'viewer';
          return handleFileTree(req, res, spaceId, role);
        }
        
        const fileContentMatch = url.pathname.match(/^\/api\/spaces\/([^\/]+)\/files\/(.+)$/);
        if (fileContentMatch && req.method === 'GET') {
          const spaceId = fileContentMatch[1];
          const filePath = fileContentMatch[2];
          return handleFileContent(req, res, spaceId, filePath);
        }
        
        const pathMatch = url.pathname.match(/^\/api\/spaces\/([^\/]+)$/);
        if (pathMatch && req.method === 'GET') {
          const spaceId = pathMatch[1];
          return handleGetSpace(req, res, spaceId);
        }
        
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: 'Not found' }));
        return true;
      },
    });

    api.registerHttpRoute({
      path: '/api/auth/login',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return true;
        }
        return handleLogin(req, res);
      },
    });

    api.registerHttpRoute({
      path: '/api/auth/logout',
      auth: 'plugin',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return true;
        }
        return handleLogout(req, res);
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

    await seedAdminUser();
  },
});