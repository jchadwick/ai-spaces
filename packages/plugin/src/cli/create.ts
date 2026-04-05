import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface CreateSpaceOptions {
  json?: boolean;
  name?: string;
  description?: string;
}

function getAgentWorkspace(): string {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  return path.join(openclawHome, 'workspace');
}

function getAgentName(): string {
  return 'main';
}

function generateSpaceId(agentName: string, spacePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${agentName}:${spacePath}`);
  const hex = hash.digest('hex');
  return hex.slice(0, 8);
}

export async function createSpace(spacePath: string, options: CreateSpaceOptions = {}) {
  const workspaceDir = getAgentWorkspace();
  const agentName = getAgentName();
  
  const absolutePath = path.isAbsolute(spacePath) 
    ? spacePath 
    : path.join(workspaceDir, spacePath);
  
  const relativePath = path.relative(workspaceDir, absolutePath);
  
  if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: 'Invalid path', 
        message: 'Path must be within the workspace directory' 
      }, null, 2));
    } else {
      console.log(`Error: Path must be within the workspace directory`);
      console.log(`Workspace: ${workspaceDir}`);
      console.log(`Provided: ${spacePath}`);
    }
    process.exit(1);
    return;
  }
  
  if (fs.existsSync(path.join(absolutePath, '.space', 'spaces.json'))) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: 'Space already exists',
        message: 'This path is already a space',
        path: spacePath
      }, null, 2));
    } else {
      console.log(`Error: This path is already a space`);
      console.log(`Path: ${spacePath}`);
      console.log(`\nUse "openclaw spaces list" to see existing spaces.`);
    }
    process.exit(1);
    return;
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
    
    const spaceId = generateSpaceId(agentName, relativePath);
    
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
    if (options.json) {
      console.log(JSON.stringify({ 
        error: 'Failed to create space',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2));
    } else {
      console.log(`Error: Failed to create space`);
      console.log(error instanceof Error ? error.message : 'Unknown error');
    }
    process.exit(1);
  }
}