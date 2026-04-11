import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from './db/connection.js';
import { spaces } from './db/index.js';
import { eq, and } from 'drizzle-orm';
import type { SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';

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
  space: typeof spaces.$inferSelect;
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

export function createSpace(input: CreateSpaceInput): CreateSpaceResult {
  const validation = validateSpacePath(input.path);
  
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      details: validation.details
    };
  }
  
  const existing = db.select().from(spaces).where(
    and(eq(spaces.agentId, input.agentId), eq(spaces.path, validation.relativePath))
  ).limit(1).get();
  
  if (existing) {
    return {
      success: false,
      error: 'Space already registered',
      details: `Space ID: ${existing.id}, Path: ${existing.path}`
    };
  }
  
  const id = generateSpaceId();
  const now = new Date().toISOString();
  
  db.insert(spaces).values({
    id,
    agentId: input.agentId,
    agentType: input.agentType,
    path: validation.relativePath,
    configPath: path.join(validation.absolutePath, '.space', 'spaces.json'),
    config: JSON.stringify(validation.config),
    createdAt: now,
    updatedAt: now,
  }).run();
  
  const newSpace = db.select().from(spaces).where(eq(spaces.id, id)).limit(1).get();
  
  if (!newSpace) {
    return { success: false, error: 'Failed to create space' };
  }
  
  return { success: true, space: newSpace };
}

export function getSpace(id: string) {
  return db.select().from(spaces).where(eq(spaces.id, id)).limit(1).get();
}

export function getSpaceByPath(agentId: string, spacePath: string) {
  return db.select().from(spaces).where(
    and(eq(spaces.agentId, agentId), eq(spaces.path, spacePath))
  ).limit(1).get();
}

export function listSpaces(agentId?: string) {
  if (agentId) {
    return db.select().from(spaces).where(eq(spaces.agentId, agentId)).all();
  }
  return db.select().from(spaces).all();
}

export function deleteSpace(id: string): boolean {
  const result = db.delete(spaces).where(eq(spaces.id, id)).run();
  return result.changes > 0;
}