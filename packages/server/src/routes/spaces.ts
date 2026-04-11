import { Router, type Request, type Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Space, SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';

export const spacesRouter = Router();

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

function getDataDir(): string {
  return process.env.AI_SPACES_DATA || path.join(process.env.HOME || '', '.ai-spaces');
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

spacesRouter.get('/', (_req: Request, res: Response) => {
  const store = loadStore();
  const spaces = Object.values(store.spaces).map(s => ({
    id: s.id,
    path: s.path,
    config: s.config,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
  res.json({ spaces });
});

spacesRouter.get('/:id', (req: Request, res: Response) => {
  const store = loadStore();
  const space = store.spaces[req.params.id];
  
  if (!space) {
    res.status(404).json({ error: 'Space not found' });
    return;
  }
  
  res.json({ space });
});

spacesRouter.post('/', async (req: Request, res: Response) => {
  const { path: spacePath, agentId, agentType } = req.body;
  
  if (!spacePath) {
    res.status(400).json({ error: 'Path is required' });
    return;
  }
  
  const store = loadStore();
  const pathKey = `${agentId}:${spacePath}`;
  
  if (store.byAgentPath[pathKey]) {
    const existingId = store.byAgentPath[pathKey];
    res.status(409).json({ error: 'Space already exists', spaceId: existingId });
    return;
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
  
  res.status(201).json({ space });
});

spacesRouter.delete('/:id', (req: Request, res: Response) => {
  const store = loadStore();
  const space = store.spaces[req.params.id];
  
  if (!space) {
    res.status(404).json({ error: 'Space not found' });
    return;
  }
  
  const pathKey = `${space.agentId}:${space.path}`;
  delete store.byAgentPath[pathKey];
  delete store.spaces[req.params.id];
  saveStore(store);
  
  res.json({ success: true });
});