import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core';
import { aiSpacesPlugin } from './channel.js';

export default defineChannelPluginEntry({
  id: 'ai-spaces',
  name: 'AI Spaces',
  description: 'Share portions of your agent workspace with collaborators',
  plugin: aiSpacesPlugin,

  registerFull(api) {
    api.logger.info('[ai-spaces] Registering full plugin');

    // Register CLI commands for space management
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

        const share = spaces.command('share').description('Manage share links');

        share
          .command('create <spaceId>')
          .description('Create a share link')
          .option('--role <role>', 'Role: editor or viewer', 'editor')
          .option('--expires <duration>', 'Expiration (e.g., 7d)', '7d')
          .action(async (spaceId: string, options: { role: string; expires: string }) => {
            const { createShare } = await import('./cli/share-create.js');
            await createShare(spaceId, options);
          });

        share
          .command('list <spaceId>')
          .description('List share links for a space')
          .action(async (spaceId: string) => {
            const { listShares } = await import('./cli/share-list.js');
            await listShares(spaceId);
          });

        share
          .command('revoke <spaceId> <shareId>')
          .description('Revoke a share link')
          .action(async (spaceId: string, shareId: string) => {
            const { revokeShare } = await import('./cli/share-revoke.js');
            await revokeShare(spaceId, shareId);
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