import * as fs from 'fs';
import * as path from 'path';
import { getSpace } from '../space-store.js';

interface RemoveSpaceOptions {
  json?: boolean;
  force?: boolean;
}

export async function removeSpace(spaceId: string, options: RemoveSpaceOptions = {}) {
  const space = getSpace(spaceId);

  if (!space) {
    throw new Error(
      `Space not found: ${spaceId}\n\nUse "openclaw spaces list" to see all available spaces.`
    );
  }

  const spaceDir = path.dirname(space.configPath);

  if (!options.force) {
    if (options.json) {
      console.log(JSON.stringify({
        id: spaceId,
        name: space.config.name,
        path: space.path,
        requiresForce: true,
        message: 'Use --force to confirm deletion',
      }, null, 2));
    } else {
      console.log('');
      console.log(`Warning: This will remove the space "${space.config.name}".`);
      console.log('');
      console.log(`  Space:    ${space.config.name}`);
      console.log(`  Path:     ${space.path}`);
      console.log(`  Config:   ${space.configPath}`);
      console.log('');
      console.log('This action cannot be undone. The .space directory will be deleted.');
      console.log('');
      console.log('Use --force to confirm deletion:');
      console.log(`  openclaw spaces remove ${spaceId} --force`);
    }
    return;
  }

  try {
    if (fs.existsSync(spaceDir)) {
      fs.rmSync(spaceDir, { recursive: true, force: true });
    }

    if (options.json) {
      console.log(JSON.stringify({ id: spaceId, name: space.config.name, path: space.path, removed: true }, null, 2));
    } else {
      console.log('');
      console.log(`Space removed successfully.`);
      console.log('');
      console.log(`  ID:      ${spaceId}`);
      console.log(`  Name:    ${space.config.name}`);
      console.log(`  Path:    ${space.path}`);
      console.log('');
      console.log(`Deleted: ${spaceDir}`);
      console.log('');
    }
  } catch (error) {
    throw new Error(
      `Failed to remove space: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
