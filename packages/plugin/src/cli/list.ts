import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface SpaceConfig {
  name: string;
  description?: string;
  collaborators?: string[];
  agent?: {
    capabilities?: string[];
    denied?: string[];
  };
}

interface DiscoveredSpace {
  id: string;
  agentName: string;
  spaceName: string;
  spacePath: string;
  configPath: string;
  config: SpaceConfig;
}

function generateSpaceId(agentName: string, spacePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${agentName}:${spacePath}`);
  const hex = hash.digest('hex');
  return hex.slice(0, 8);
}

async function findSpacesInWorkspace(workspaceDir: string, agentName: string): Promise<DiscoveredSpace[]> {
  const spaces: DiscoveredSpace[] = [];
  
  if (!fs.existsSync(workspaceDir)) {
    return spaces;
  }
  
  async function scanDir(dir: string, relativePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const spaceDir = path.join(dir, entry.name);
        const spaceConfigPath = path.join(spaceDir, '.space', 'spaces.json');
        
        if (fs.existsSync(spaceConfigPath)) {
          try {
            const configContent = fs.readFileSync(spaceConfigPath, 'utf-8');
            const config: SpaceConfig = JSON.parse(configContent);
            const spacePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const id = generateSpaceId(agentName, spacePath);
            
spaces.push({
              id,
              agentName,
              spaceName: config.name || entry.name,
              spacePath,
              configPath: spaceConfigPath,
              config,
            });
          } catch (error) {
            console.error(`Error reading space config at ${spaceConfigPath}:`, error);
          }
        }
        
        await scanDir(spaceDir, relativePath ? `${relativePath}/${entry.name}` : entry.name);
      }
    }
  }
  
  await scanDir(workspaceDir);
  return spaces;
}

function getAgentsHome(): string {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  return path.join(openclawHome, 'agents');
}

function getAgentWorkspace(agentName: string, openclawHome: string): string | null {
  const agentsDir = getAgentsHome();
  const agentFile = path.join(agentsDir, agentName, 'agent.json');
  
  if (!fs.existsSync(agentFile)) {
    return null;
  }
  
  try {
    const agentData = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
    return agentData.workspace || null;
  } catch {
    return null;
  }
}

export async function listSpaces(options: { json?: boolean } = {}) {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  const agentsHome = getAgentsHome();
  
  if (!fs.existsSync(agentsHome)) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No agents found', spaces: [] }, null, 2));
    } else {
      console.log('No agents found. Run this command from within an OpenClaw environment.');
    }
    return;
  }
  
  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  if (agentDirs.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ spaces: [] }, null, 2));
    } else {
      console.log('No agents configured.');
    }
    return;
  }
  
  const allSpaces: DiscoveredSpace[] = [];
  
  for (const agentName of agentDirs) {
    let workspacePath: string;
    
    if (agentName === 'main') {
      workspacePath = path.join(openclawHome, 'workspace');
    } else {
      workspacePath = getAgentWorkspace(agentName, openclawHome) || 
                       path.join(openclawHome, 'workspace', agentName);
    }
    
    const spaces = await findSpacesInWorkspace(workspacePath, agentName);
    allSpaces.push(...spaces);
  }
  
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
        name: space.spaceName,
        agent: space.agentName,
        path: space.spacePath,
        config: space.config
      }))
    }, null, 2));
  } else {
    console.log('Discovered Spaces:\n');
    console.log('  ' + 'Space ID'.padEnd(10) + '  ' + 'Name'.padEnd(25) + '  ' + 'Agent'.padEnd(15) + 'Path');
    console.log('  ' + '-'.repeat(80));
    
    for (const space of allSpaces) {
      console.log('  ' + space.id.padEnd(10) + '  ' + space.spaceName.padEnd(25) + '  ' + space.agentName.padEnd(15) + space.spacePath);
    }
    
    console.log('\nTotal: %d space(s)', allSpaces.length);
  }
}