import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Space, SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';
import { config } from './config.js';

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
  byPath: Record<string, string>;
}

function getOpenClawHome(): string {
  return config.OPENCLAW_HOME;
}

function getStoreFilePath(): string {
  return path.join(getOpenClawHome(), 'spaces.json');
}

function loadStore(): SpaceStore {
  const filePath = getStoreFilePath();
  
  if (!fs.existsSync(filePath)) {
    return { spaces: {}, byPath: {} };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { spaces: {}, byPath: {} };
  }
}

function saveStore(store: SpaceStore): void {
  const filePath = getStoreFilePath();
  const openclawHome = getOpenClawHome();
  
  if (!fs.existsSync(openclawHome)) {
    fs.mkdirSync(openclawHome, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export function generateSpaceId(): string {
  return crypto.randomBytes(16).toString('hex');
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

export function validatePath(inputPath: string): { valid: true; absolutePath: string } | { valid: false; error: string } {
  if (!inputPath || inputPath.trim() === '') {
    return { valid: false, error: 'Path is required' };
  }
  
  if (inputPath.includes('..')) {
    return { valid: false, error: 'Path cannot contain ".." segments' };
  }
  
  if (inputPath.includes('\0')) {
    return { valid: false, error: 'Path cannot contain null bytes' };
  }
  
  let absolutePath: string;
  
  if (path.isAbsolute(inputPath)) {
    absolutePath = path.resolve(inputPath);
  } else {
    const workspaceDir = getWorkspaceForAgent();
    if (!workspaceDir) {
      return { valid: false, error: 'Cannot determine workspace directory' };
    }
    absolutePath = path.resolve(workspaceDir, inputPath);
  }
  
  return { valid: true, absolutePath };
}

export function validateSpacePath(spacePath: string): { valid: true; config: SpaceConfig; absolutePath: string; relativePath: string } | { valid: false; error: string; details?: string } {
  const pathValidation = validatePath(spacePath);
  
  if (!pathValidation.valid) {
    return pathValidation;
  }
  
  const { absolutePath } = pathValidation;
  const workspaceDir = getWorkspaceForAgent();
  
  if (!workspaceDir) {
    return { valid: false, error: 'Cannot determine workspace directory' };
  }
  
  if (!absolutePath.startsWith(workspaceDir)) {
    return { 
      valid: false, 
      error: 'Path must be within the workspace',
      details: `Workspace: ${workspaceDir}, Path: ${absolutePath}`
    };
  }
  
  if (!fs.existsSync(absolutePath)) {
    return { 
      valid: false, 
      error: 'Path does not exist',
      details: absolutePath
    };
  }
  
  const configPath = path.join(absolutePath, '.space', 'spaces.json');
  
  if (!fs.existsSync(configPath)) {
    return { 
      valid: false, 
      error: 'Space config not found',
      details: `Expected: ${configPath}`
    };
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
    
    const relativePath = path.relative(workspaceDir, absolutePath);
    
    return {
      valid: true,
      config: parseResult.data,
      absolutePath,
      relativePath
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Failed to read space config',
      details: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

function getWorkspaceForAgent(): string | null {
  const openclawHome = getOpenClawHome();
  return path.join(openclawHome, 'workspace');
}

export function createSpace(input: CreateSpaceInput): CreateSpaceResult {
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
  
  if (store.byPath[pathKey]) {
    const existingId = store.byPath[pathKey];
    const existing = store.spaces[existingId];
    
    return {
      success: false,
      error: 'Space already registered',
      details: `Space ID: ${existingId}, Path: ${existing.path}`
    };
  }
  
  const id = generateSpaceId();
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
  store.byPath[pathKey] = id;
  
  saveStore(store);
  
  return { success: true, space };
}

export function getSpace(id: string): SpaceRecord | null {
  const store = loadStore();
  return store.spaces[id] || null;
}

export function getSpaceByPath(agentId: string, spacePath: string): SpaceRecord | null {
  const store = loadStore();
  const pathKey = `${agentId}:${spacePath}`;
  const id = store.byPath[pathKey];
  
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

export function deleteSpace(id: string): boolean {
  const store = loadStore();
  const space = store.spaces[id];
  
  if (!space) {
    return false;
  }
  
  const pathKey = `${space.agentId}:${space.path}`;
  delete store.byPath[pathKey];
  delete store.spaces[id];
  
  saveStore(store);
  return true;
}