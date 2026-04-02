/**
 * AI Spaces Plugin Entry Point
 * 
 * Registers AI Spaces as a channel plugin with OpenClaw Gateway.
 */

import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { createSpacesChannelPlugin } from './src/channel.js';

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: createSpacesChannelPlugin(),
  registerCliMetadata(api) {
    // Register CLI commands for space management
    api.registerCli(
      ({ program }) => {
        const spaces = program.command('spaces').description('Manage AI Spaces');
        
        spaces
          .command('list')
          .description('List discovered spaces')
          .action(async () => {
            const { listSpaces } = await import('./src/cli/list.js');
            await listSpaces();
          });
        
        spaces
          .command('show <spaceId>')
          .description('Show space details')
          .action(async (spaceId) => {
            const { showSpace } = await import('./src/cli/show.js');
            await showSpace(spaceId);
          });
        
        spaces
          .command('share create <spaceId>')
          .description('Create a share link')
          .option('--role <role>', 'Role: editor or viewer', 'editor')
          .option('--expires <duration>', 'Expiration (e.g., 7d)', '7d')
          .action(async (spaceId, options) => {
            const { createShare } = await import('./src/cli/share-create.js');
            await createShare(spaceId, options);
          });
        
        spaces
          .command('share list <spaceId>')
          .description('List share links for a space')
          .action(async (spaceId) => {
            const { listShares } = await import('./src/cli/share-list.js');
            await listShares(spaceId);
          });
        
        spaces
          .command('share revoke <spaceId> <shareId>')
          .description('Revoke ashare link')
          .action(async (spaceId, shareId) => {
            const { revokeShare } = await import('./src/cli/share-revoke.js');
            await revokeShare(spaceId, shareId);
          });
      },
      { commands: ['spaces'] }
    );
  },
  registerFull(api) {
    // Register HTTP routes for Space UI
    api.registerHttpRoute({
      method: 'GET',
      path: '/spaces/:spaceId',
      auth: 'plugin',
      match: 'exact',
      handler: async (req, res) => {
        // Handler implementation in src/routes
        const { handleSpaceUI } = await import('./src/routes/space-ui.js');
        return handleSpaceUI(req, res);
      },
    });

    api.registerHttpRoute({
      method: 'GET',
      path: '/spaces/:spaceId/info',
      auth: 'plugin',
      match: 'exact',
      handler: async (req, res) => {
        const { handleSpaceInfo } = await import('./src/routes/space-info.js');
        return handleSpaceInfo(req, res);
      },
    });

    api.registerHttpRoute({
      method: 'GET',
      path: '/spaces/:spaceId/ws',
      auth: 'plugin',
      match: 'exact',
      handler: async (req, res) => {
        const { handleSpaceWebSocket } = await import('./src/routes/space-ws.js');
        return handleSpaceWebSocket(req, res);
      },
    });

    // Register tool hooks for path enforcement
    api.registerHook(['before_tool_call'], async (event) => {
      const { createToolHook } = await import('./src/hooks/path-hook.js');
      const hook = createToolHook();
      return hook(event);
    });
  },
});