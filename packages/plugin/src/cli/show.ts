import { getSpace } from '../space-store.js';

export async function showSpace(spaceId: string, options: { json?: boolean } = {}) {
  const space = getSpace(spaceId);

  if (!space) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Space not found', spaceId }, null, 2));
    } else {
      console.log(`Space not found: ${spaceId}`);
      console.log('');
      console.log('Use "openclaw spaces list" to see all available spaces.');
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({
      id: space.id,
      name: space.config.name,
      agent: space.agentId,
      path: space.path,
      configPath: space.configPath,
      config: space.config,
    }, null, 2));
  } else {
    console.log('');
    console.log(`Space: ${space.config.name}`);
    console.log('');
    console.log(`  ID:          ${space.id}`);
    console.log(`  Agent:       ${space.agentId}`);
    console.log(`  Path:        ${space.path}`);
    console.log(`  Config:      ${space.configPath}`);

    if (space.config.description) {
      console.log('');
      console.log(`  Description: ${space.config.description}`);
    }

    if (space.config.agent) {
      console.log('');
      console.log('  Agent Configuration:');
      if (space.config.agent.capabilities && space.config.agent.capabilities.length > 0) {
        console.log(`    Capabilities: ${space.config.agent.capabilities.join(', ')}`);
      }
      if (space.config.agent.denied && space.config.agent.denied.length > 0) {
        console.log(`    Denied Tools: ${space.config.agent.denied.join(', ')}`);
      }
    }

    if (space.config.collaborators && space.config.collaborators.length > 0) {
      console.log('');
      console.log(`  Collaborators: ${space.config.collaborators.join(', ')}`);
    }

    console.log('');
  }
}
