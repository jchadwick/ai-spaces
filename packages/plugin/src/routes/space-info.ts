import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createSpace, type CreateSpaceInput } from '../space-store.js';
import { SpaceConfigSchema } from '@ai-spaces/shared';
import { logSpaceAccessed } from '../audit-logger.js';
import { validateSession } from '../session-middleware.js';

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
          } catch {}
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

export async function handleListSpaces(req: IncomingMessage, res: ServerResponse) {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  const agentsHome = getAgentsHome();
  
  if (!fs.existsSync(agentsHome)) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ spaces: [] }));
    return true;
  }
  
  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
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
  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({
    spaces: allSpaces.map(space => ({
      id: space.id,
      name: space.spaceName,
      agent: space.agentName,
      path: space.spacePath,
      config: space.config
    }))
  }));
  
  return true;
}

export async function handleGetSpace(req: IncomingMessage, res: ServerResponse, spaceId: string) {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  const agentsHome = getAgentsHome();
  
  if (!fs.existsSync(agentsHome)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }
  
  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  for (const agentName of agentDirs) {
    let workspacePath: string;
    
    if (agentName === 'main') {
      workspacePath = path.join(openclawHome, 'workspace');
    } else {
      workspacePath = getAgentWorkspace(agentName, openclawHome) || 
                       path.join(openclawHome, 'workspace', agentName);
    }
    
    const spaces = await findSpacesInWorkspace(workspacePath, agentName);
    const space = spaces.find(s => s.id === spaceId);
    
    if (space) {
      logSpaceAccessed(spaceId, 'unknown', 'view');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        id: space.id,
        name: space.spaceName,
        agent: space.agentName,
        path: space.spacePath,
        config: space.config
      }));
      return true;
    }
  }
  
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ error: 'Space not found' }));
  return true;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export async function handleCreateSpace(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    
    let data: unknown;
    try {
      data= JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return true;
    }
    
    if (!data || typeof data !== 'object') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'Request body must be an object' }));
      return true;
    }
    
    const input = data as Record<string, unknown>;
    
    if (!input.agentId || typeof input.agentId !== 'string') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'agentId is required and must be a string' }));
      return true;
    }
    
    if (!input.agentType || typeof input.agentType !== 'string') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'agentType is required and must be a string' }));
      return true;
    }
    
    if (!input.path || typeof input.path !== 'string') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'path is required and must be a string' }));
      return true;
    }
    
    if (!input.config || typeof input.config !== 'object') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'config is required and must be an object' }));
      return true;
    }
    
    const configResult = SpaceConfigSchema.safeParse(input.config);
    if (!configResult.success) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ 
        error: 'Invalid config schema',
        details: configResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      }));
      return true;
    }
    
    const createInput: CreateSpaceInput ={
      agentId: input.agentId as string,
      agentType: input.agentType as string,
      path: input.path as string,
      config: configResult.data,
    };
    
    const result = createSpace(createInput);
    
    if (!result.success) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ 
        error: result.error,
        details: result.details 
      }));
      return true;
    }
    
    const payload = validateSession(req);
    const userId = payload?.userId as string | undefined;
    if (userId) {
      logSpaceAccessed(result.space.id, userId, 'create');
    }
    
    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({
      spaceId: result.space.id,
      name: result.space.config.name,
      path: result.space.path,
      agentId: result.space.agentId,
      agentType: result.space.agentType,
      createdAt: result.space.createdAt,
    }));
    
    return true;
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }));
    return true;
  }
}