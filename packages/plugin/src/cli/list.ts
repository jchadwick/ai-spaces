import * as fs from 'fs';
import * as path from 'path';

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
  agentName: string;
  spaceName: string;
  spacePath: string;
  configPath: string;
  config: SpaceConfig;
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
            
            spaces.push({
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

export async function listSpaces() {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  const agentsHome = getAgentsHome();
  
  if (!fs.existsSync(agentsHome)) {
    console.log('No agents found. Run this command from within an OpenClaw environment.');
    return;
  }
  
  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  if (agentDirs.length === 0) {
    console.log('No agents configured.');
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
    console.log('No spaces discovered.');
    console.log('');
    console.log('To create a space:');
    console.log('  1. Create a directory in your workspace: mkdir -p MySpace/.space');
    console.log('  2. Add a spaces.json config: echo \'{"name": "My Space"}\' > MySpace/.space/spaces.json');
    return;
  }
  
  console.log('Discovered Spaces:\n');
  console.log('  Name'.padEnd(30) + 'Agent'.padEnd(20) + 'Path');
  console.log('  ' + '-'.repeat(70));
  
  for (const space of allSpaces) {
    console.log('  ' + space.spaceName.padEnd(30) + space.agentName.padEnd(20) + space.spacePath);
  }
  
  console.log('\nTotal: %d space(s)', allSpaces.length);
}