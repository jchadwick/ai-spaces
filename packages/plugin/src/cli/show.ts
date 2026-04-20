import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from '../config.js';

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

async function findSpaceById(spaceId: string): Promise<DiscoveredSpace | null> {
  const openclawHome = config.OPENCLAW_HOME;
  const agentsHome = path.join(openclawHome, 'agents');
  
  if (!fs.existsSync(agentsHome)) {
    return null;
  }
  
  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  for (const agentName of agentDirs) {
    let workspacePath: string;
    
    if (agentName === 'main') {
      workspacePath = path.join(openclawHome, 'workspace');
    } else {
      workspacePath = path.join(openclawHome, 'workspace', agentName);
    }
    
    const space = await findSpaceInWorkspace(workspacePath, agentName, spaceId);
    if (space) {
      return space;
    }
  }
  
  return null;
}

async function findSpaceInWorkspace(workspaceDir: string, agentName: string, targetId: string): Promise<DiscoveredSpace | null> {
  if (!fs.existsSync(workspaceDir)) {
    return null;
  }
  
  async function scanDir(dir: string, relativePath: string = ''): Promise<DiscoveredSpace | null> {
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
            
            if (id === targetId) {
              return {
                id,
                agentName,
                spaceName: config.name || entry.name,
                spacePath,
                configPath: spaceConfigPath,
                config,
              };
            }
          } catch (error) {
            console.error(`Error reading space config at ${spaceConfigPath}:`, error);
          }
        }
        
        const found = await scanDir(spaceDir, relativePath ? `${relativePath}/${entry.name}` : entry.name);
        if (found) {
          return found;
        }
      }
    }
    
    return null;
  }
  
  return await scanDir(workspaceDir);
}

export async function showSpace(spaceId: string, options: { json?: boolean } = {}) {
  const space = await findSpaceById(spaceId);
  
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
      name: space.spaceName,
      agent: space.agentName,
      path: space.spacePath,
      configPath: space.configPath,
      config: space.config
    }, null, 2));
  } else {
    console.log('');
    console.log(`Space: ${space.spaceName}`);
    console.log('');
    console.log(`  ID:          ${space.id}`);
    console.log(`  Agent:       ${space.agentName}`);
    console.log(`  Path:        ${space.spacePath}`);
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