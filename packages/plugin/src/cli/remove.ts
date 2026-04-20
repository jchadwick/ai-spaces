import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from '../config.js';

interface RemoveSpaceOptions {
  json?: boolean;
  force?: boolean;
}

function generateSpaceId(agentName: string, spacePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${agentName}:${spacePath}`);
  const hex = hash.digest('hex');
  return hex.slice(0, 8);
}

async function findSpaceById(spaceId: string): Promise<{ spacePath: string; configPath: string; spaceName: string } | null> {
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
    
    const result = await findSpaceInWorkspace(workspacePath, agentName, spaceId);
    if (result) {
      return result;
    }
  }
  
  return null;
}

async function findSpaceInWorkspace(workspaceDir: string, agentName: string, targetId: string): Promise<{ spacePath: string; configPath: string; spaceName: string } | null> {
  if (!fs.existsSync(workspaceDir)) {
    return null;
  }
  
  async function scanDir(dir: string, relativePath: string = ''): Promise<{ spacePath: string; configPath: string; spaceName: string } | null> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const spaceDir = path.join(dir, entry.name);
        const spaceConfigPath = path.join(spaceDir, '.space', 'spaces.json');
        
        if (fs.existsSync(spaceConfigPath)) {
          try {
            const configContent = fs.readFileSync(spaceConfigPath, 'utf-8');
            const config = JSON.parse(configContent);
            const spacePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const id = generateSpaceId(agentName, spacePath);
            
            if (id === targetId) {
              return {
                spacePath: spaceDir,
                configPath: spaceConfigPath,
                spaceName: config.name || entry.name
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

export async function removeSpace(spaceId: string, options: RemoveSpaceOptions = {}) {
  const space = await findSpaceById(spaceId);
  
  if (!space) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: 'Space not found',
        spaceId 
      }, null, 2));
    } else {
      console.log(`Error: Space not found: ${spaceId}`);
      console.log('');
      console.log('Use "openclaw spaces list" to see all available spaces.');
    }
    process.exit(1);
    return;
  }
  
  const { spacePath, configPath, spaceName } = space;
  const spaceDir = path.dirname(configPath);
  
  if (!options.force) {
    if (options.json) {
      console.log(JSON.stringify({
        id: spaceId,
        name: spaceName,
        path: spacePath,
        requiresForce: true,
        message: 'Use --force to confirm deletion'
      }, null, 2));
    } else {
      console.log('');
      console.log(`Warning: This will remove the space "${spaceName}".`);
      console.log('');
      console.log(`  Space:    ${spaceName}`);
      console.log(`  Path:     ${spacePath}`);
      console.log(`  Config:   ${configPath}`);
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
      console.log(JSON.stringify({
        id: spaceId,
        name: spaceName,
        path: spacePath,
        removed: true
      }, null, 2));
    } else {
      console.log('');
      console.log(`Space removed successfully.`);
      console.log('');
      console.log(`  ID:      ${spaceId}`);
      console.log(`  Name:    ${spaceName}`);
      console.log(`  Path:    ${spacePath}`);
      console.log('');
      console.log(`Deleted: ${spaceDir}`);
      console.log('');
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: 'Failed to remove space',
        spaceId,
        message: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2));
    } else {
      console.log(`Error: Failed to remove space`);
      console.log(error instanceof Error ? error.message : 'Unknown error');
    }
    process.exit(1);
  }
}