import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Space, SpaceConfig } from '@ai-spaces/shared';
import { config } from '../config.js';

export const spacesRouter = new Hono();

interface SpaceRecord {
  id: string;
  agentId: string;
  agentType: string;
  path: string;
  configPath: string;
  config: SpaceConfig;
  createdAt: string;
  updatedAt: string;
}

interface SpaceStore {
  spaces: Record<string, SpaceRecord>;
  byAgentPath: Record<string, string>;
}

const createSpaceSchema = z.object({
  path: z.string().min(1),
  agentId: z.string().optional(),
  agentType: z.string().optional(),
});

function getDataDir(): string {
  return config.AI_SPACES_DATA;
}

function getStoreFilePath(): string {
  return path.join(getDataDir(), 'spaces.json');
}

function loadStore(): SpaceStore {
  const filePath = getStoreFilePath();
  
  if (!fs.existsSync(filePath)) {
    return { spaces: {}, byAgentPath: {} };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { spaces: {}, byAgentPath: {} };
  }
}

function saveStore(store: SpaceStore): void {
  const filePath = getStoreFilePath();
  const dataDir = getDataDir();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

spacesRouter.get('/', (c) => {
  const store = loadStore();
  const spaces = Object.values(store.spaces).map(s => ({
    id: s.id,
    path: s.path,
    config: s.config,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
  return c.json({ spaces });
});

spacesRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }
  
  return c.json({ space });
});

spacesRouter.get('/:id/files', async (c) => {
  const id = c.req.param('id');
  const path = c.req.query('path') || '';
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }
  
  const fullPath = path ? `${space.path}/${path}` : space.path;
  
  try {
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: entry.name,
    }));
    return c.json({ files });
  } catch (error) {
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

spacesRouter.get('/:id/files/:filePath{.*}', async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }
  
  const fullPath = path.join(space.path, filePath);
  
  try {
    const stats = await fs.promises.stat(fullPath);
    
    if (stats.isDirectory()) {
      return c.json({ error: 'Cannot read directory content' }, 400);
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const markdownExts = ['.md', '.markdown'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const textExts = ['.txt', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.yml', '.yaml', '.xml', '.csv'];
    
    let contentType: string;
    if (markdownExts.includes(ext)) {
      contentType = 'markdown';
    } else if (imageExts.includes(ext)) {
      contentType = 'image';
    } else if (textExts.includes(ext)) {
      contentType = 'text';
    } else {
      contentType = 'binary';
    }
    
    const size = stats.size;
    const modified = stats.mtime.toISOString();
    
    if (contentType === 'binary') {
      return c.json({ path: filePath, contentType, size, modified });
    }
    
    if (contentType === 'image') {
      const imageBuffer = await fs.promises.readFile(fullPath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = getMimeType(filePath);
      return c.json({ path: filePath, content: base64, contentType: 'image', mimeType, size, modified });
    }
    
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    return c.json({ path: filePath, content, contentType, size, modified });
  } catch (error) {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

const writeFileSchema = z.object({
  content: z.string(),
});

spacesRouter.put('/:id/files/:filePath{.*}', zValidator('json', writeFileSchema), async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const { content } = c.req.valid('json');
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }
  
  const fullPath = path.join(space.path, filePath);
  const normalizedSpacePath = path.normalize(space.path);
  const normalizedFullPath = path.normalize(fullPath);
  
  if (!normalizedFullPath.startsWith(normalizedSpacePath)) {
    return c.json({ error: 'Access denied: path escape attempt' }, 403);
  }
  
  try {
    const dir = path.dirname(fullPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf-8');
    return c.json({ success: true, path: filePath });
  } catch (error) {
    return c.json({ error: 'Failed to write file' }, 500);
  }
});

const createDirSchema = z.object({
  path: z.string().min(1),
});

spacesRouter.post('/:id/directories', zValidator('json', createDirSchema), async (c) => {
  const id = c.req.param('id');
  const { path: dirPath } = c.req.valid('json');
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }
  
  const fullPath = path.join(space.path, dirPath);
  const normalizedSpacePath = path.normalize(space.path);
  const normalizedFullPath = path.normalize(fullPath);
  
  if (!normalizedFullPath.startsWith(normalizedSpacePath)) {
    return c.json({ error: 'Access denied: path escape attempt' }, 403);
  }
  
  try {
    await fs.promises.mkdir(fullPath, { recursive: true });
    return c.json({ success: true, path: dirPath });
  } catch (error) {
    return c.json({ error: 'Failed to create directory' }, 500);
  }
});

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

spacesRouter.post('/', zValidator('json', createSpaceSchema), (c) => {
  const { path: spacePath, agentId, agentType } = c.req.valid('json');
  
  const store = loadStore();
  const pathKey = `${agentId || 'default'}:${spacePath}`;
  
  if (store.byAgentPath[pathKey]) {
    const existingId = store.byAgentPath[pathKey];
    return c.json({ error: 'Space already exists', spaceId: existingId }, 409);
  }
  
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  
  const space: SpaceRecord = {
    id,
    agentId: agentId || 'default',
    agentType: agentType || 'default',
    path: spacePath,
    configPath: path.join(spacePath, '.space', 'spaces.json'),
    config: { name: path.basename(spacePath) },
    createdAt: now,
    updatedAt: now,
  };
  
  store.spaces[id] = space;
  store.byAgentPath[pathKey] = id;
  saveStore(store);
  
  return c.json({ space }, 201);
});

spacesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }
  
  const pathKey = `${space.agentId}:${space.path}`;
  delete store.byAgentPath[pathKey];
  delete store.spaces[id];
  saveStore(store);
  
  return c.json({ success: true });
});

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
            const spacePathRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const id = generateSpaceId(agentName, spacePathRel);
            
            spaces.push({
              id,
              agentName,
              spaceName: config.name || entry.name,
              spacePath: spacePathRel,
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
  const openclawHome = config.OPENCLAW_HOME;
  return path.join(openclawHome, 'agents');
}

function getAgentWorkspace(agentName: string): string | null {
  const openclawHome = config.OPENCLAW_HOME;
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

spacesRouter.post('/scan', async (c) => {
  const openclawHome = config.OPENCLAW_HOME;
  const agentsHome = getAgentsHome();
  
  if (!fs.existsSync(agentsHome)) {
    return c.json({ discovered: [], registered: 0 });
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
      workspacePath = getAgentWorkspace(agentName) || 
                     path.join(openclawHome, 'workspace', agentName);
    }
    
    const spaces = await findSpacesInWorkspace(workspacePath, agentName);
    allSpaces.push(...spaces);
  }
  
  const store = loadStore();
  let registered = 0;
  
  for (const space of allSpaces) {
    const pathKey = `${space.agentName}:${space.spacePath}`;
    
    if (!store.byAgentPath[pathKey]) {
      const id = space.id;
      const now = new Date().toISOString();
      
      store.spaces[id] = {
        id,
        agentId: space.agentName,
        agentType: space.agentName === 'main' ? 'main' : 'agent',
        path: space.spacePath,
        configPath: space.configPath,
        config: space.config,
        createdAt: now,
        updatedAt: now,
      };
      
      store.byAgentPath[pathKey] = id;
      registered++;
    }
  }
  
  saveStore(store);
  
  return c.json({
    discovered: allSpaces.map(space => ({
      id: space.id,
      name: space.spaceName,
      agent: space.agentName,
      path: space.spacePath,
      config: space.config
    })),
    registered
  });
});

export type SpacesRouter = typeof spacesRouter;
