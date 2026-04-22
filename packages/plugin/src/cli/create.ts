import * as fs from 'fs';
import * as path from 'path';
import { computeSpaceId } from '../space-id.js';
import { config } from '../config.js';

interface CreateSpaceOptions {
  json?: boolean;
  name?: string;
  description?: string;
}

function getAgentWorkspace(): string {
  const openclawHome = config.OPENCLAW_HOME;
  return path.join(openclawHome, 'workspace');
}

function getAgentName(): string {
  return 'main';
}

export async function createSpace(spacePath: string, options: CreateSpaceOptions = {}) {
  const workspaceDir = getAgentWorkspace();
  const agentName = getAgentName();
  
  const absolutePath = path.isAbsolute(spacePath) 
    ? spacePath 
    : path.join(workspaceDir, spacePath);
  
  const relativePath = path.relative(workspaceDir, absolutePath);
  
  if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
    throw new Error(
      `Path must be within the workspace directory\nWorkspace: ${workspaceDir}\nProvided: ${spacePath}`
    );
  }
  
  if (fs.existsSync(path.join(absolutePath, '.space', 'spaces.json'))) {
    throw new Error(
      `This path is already a space\nPath: ${spacePath}\n\nUse "openclaw spaces list" to see existing spaces.`
    );
  }
  
  const spaceName = options.name || path.basename(absolutePath);
  const spaceDescription = options.description;
  
  const config: any = {
    name: spaceName
  };
  
  if (spaceDescription) {
    config.description = spaceDescription;
  }
  
  try {
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }
    
    const spaceDir = path.join(absolutePath, '.space');
    if (!fs.existsSync(spaceDir)) {
      fs.mkdirSync(spaceDir, { recursive: true });
    }
    
    const configPath = path.join(spaceDir, 'spaces.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    const spaceId = computeSpaceId(agentName, relativePath);
    
    if (options.json) {
      console.log(JSON.stringify({
        id: spaceId,
        name: spaceName,
        description: spaceDescription || null,
        agent: agentName,
        path: relativePath,
        configPath: absolutePath,
        created: true
      }, null, 2));
    } else {
      console.log('');
      console.log(`Space created successfully!`);
      console.log('');
      console.log(`  ID:          ${spaceId}`);
      console.log(`  Name:        ${spaceName}`);
      if (spaceDescription) {
        console.log(`  Description: ${spaceDescription}`);
      }
      console.log(`  Agent:       ${agentName}`);
      console.log(`  Path:        ${relativePath}`);
      console.log(`  Config:      ${configPath}`);
      console.log('');
      console.log(`Created: ${path.join(absolutePath, '.space', 'spaces.json')}`);
      console.log('');
      console.log(`Next steps:`);
      console.log(`  1. Add files to ${spacePath}`);
      console.log(`  2. View space: openclaw spaces show ${spaceId}`);
      console.log(`  3. Create share link: openclaw spaces share create ${spaceId}`);
      console.log('');
    }
  } catch (error) {
    throw new Error(
      `Failed to create space: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}