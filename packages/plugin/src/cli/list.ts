import { listSpaces as getSpaces } from '../space-store.js';

export async function listSpaces(options: { json?: boolean } = {}) {
  const allSpaces = getSpaces();

  if (allSpaces.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ spaces: [] }, null, 2));
    } else {
      console.log('No spaces discovered.');
      console.log('');
      console.log('To create a space:');
      console.log('  1. Create a directory in your workspace: mkdir -p MySpace/.space');
      console.log('  2. Add a spaces.json config: echo \'{"name": "My Space"}\' > MySpace/.space/spaces.json');
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({
      spaces: allSpaces.map(space => ({
        id: space.id,
        name: space.config.name,
        agent: space.agentId,
        path: space.path,
        config: space.config,
      })),
    }, null, 2));
  } else {
    console.log('Discovered Spaces:\n');
    console.log('  ' + 'Space ID'.padEnd(10) + '  ' + 'Name'.padEnd(25) + '  ' + 'Agent'.padEnd(15) + 'Path');
    console.log('  ' + '-'.repeat(80));

    for (const space of allSpaces) {
      console.log('  ' + space.id.slice(0, 8).padEnd(10) + '  ' + space.config.name.padEnd(25) + '  ' + space.agentId.padEnd(15) + space.path);
    }

    console.log('\nTotal: %d space(s)', allSpaces.length);
  }
}
