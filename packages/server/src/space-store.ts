import * as fs from 'fs';
import * as path from 'path';
import type { Space, SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';
import { computeSpaceId } from './space-id.js';
import { logAudit } from './audit.js';
import { config } from './config.js';

export interface SpaceRecord {
  id: string;
  agentId: string;
  agentType: string;
  path: string;
  configPath: string;
  config: SpaceConfig;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceStore {
  spaces: Record<string, SpaceRecord>;
  byAgentPath: Record<string, string>;
}

function getDataDir(): string {
  return config.AI_SPACES_DATA;
}

function getStoreFilePath(): string {
  return path.join(getDataDir(), 'spaces.json');
}

export function loadStore(): SpaceStore {
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

export function saveStore(store: SpaceStore): void {
  const filePath = getStoreFilePath();
  const dataDir = getDataDir();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export function generateSpaceId(agentId: string, relativePath: string): string {
  return computeSpaceId(agentId, relativePath);
}

export interface CreateSpaceInput {
  agentId: string;
  agentType: string;
  path: string;
  config: SpaceConfig;
}

export type CreateSpaceResult = {
  success: true;
  space: SpaceRecord;
} | {
  success: false;
  error: string;
  details?: string;
};

export function validateSpacePath(inputPath: string): { valid: true; config: SpaceConfig; absolutePath: string; relativePath: string } | { valid: false; error: string; details?: string } {
  if (!fs.existsSync(inputPath)) {
    return { valid: false, error: 'Path does not exist', details: inputPath };
  }
  
  const configPath = path.join(inputPath, '.space', 'spaces.json');
  
  if (!fs.existsSync(configPath)) {
    return { valid: false, error: 'Space config not found', details: configPath };
  }
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const rawConfig = JSON.parse(configContent);
    
    const parseResult = SpaceConfigSchema.safeParse(rawConfig);
    
    if (!parseResult.success) {
      return {
        valid: false,
        error: 'Invalid space config schema',
        details: parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      };
    }
    
    return {
      valid: true,
      config: parseResult.data,
      absolutePath: inputPath,
      relativePath: path.basename(inputPath)
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Failed to read space config',
      details: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

export function createSpace(input: CreateSpaceInput, userId: string = 'system'): CreateSpaceResult {
  const validation = validateSpacePath(input.path);
  
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      details: validation.details
    };
  }
  
  const store = loadStore();
  const pathKey = `${input.agentId}:${validation.relativePath}`;
  
  if (store.byAgentPath[pathKey]) {
    const existingId = store.byAgentPath[pathKey];
    const existing = store.spaces[existingId];
    
    return {
      success: false,
      error: 'Space already registered',
      details: `Space ID: ${existingId}, Path: ${existing.path}`
    };
  }
  
  const id = generateSpaceId(input.agentId, validation.relativePath);
  const now = new Date().toISOString();
  
  const space: SpaceRecord = {
    id,
    agentId: input.agentId,
    agentType: input.agentType,
    path: validation.relativePath,
    configPath: path.join(validation.absolutePath, '.space', 'spaces.json'),
    config: validation.config,
    createdAt: now,
    updatedAt: now,
  };
  
  store.spaces[id] = space;
  store.byAgentPath[pathKey] = id;
  
  saveStore(store);
  
  logAudit('space.create', userId, { spaceId: id, path: space.path });
  
  return { success: true, space };
}

export function getSpace(id: string, userId: string = 'system'): SpaceRecord | null {
  const store = loadStore();
  const space = store.spaces[id] || null;
  
  if (space) {
    logAudit('space.access', userId, { spaceId: id, path: space.path });
  }
  
  return space;
}

export function getSpaceByPath(agentId: string, spacePath: string): SpaceRecord | null {
  const store = loadStore();
  const pathKey = `${agentId}:${spacePath}`;
  const id = store.byAgentPath[pathKey];
  
  if (!id) {
    return null;
  }
  
  return store.spaces[id] || null;
}

export function listSpaces(agentId?: string): SpaceRecord[] {
  const store = loadStore();
  const spaces = Object.values(store.spaces);
  
  if (agentId) {
    return spaces.filter(s => s.agentId === agentId);
  }
  
  return spaces;
}

export function deleteSpace(id: string, userId: string = 'system'): boolean {
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return false;
  }
  
  const pathKey = `${space.agentId}:${space.path}`;
  delete store.byAgentPath[pathKey];
  delete store.spaces[id];
  
  saveStore(store);
  
  logAudit('space.delete', userId, { spaceId: id, path: space.path });
  
  return true;
}