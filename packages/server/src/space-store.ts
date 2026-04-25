import * as fs from 'fs';
import * as path from 'path';
import type { SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';
import { computeSpaceId } from './space-id.js';
import { logAudit } from './audit.js';
import { db, schema } from './db/connection.js';
import { eq, and } from 'drizzle-orm';

export interface SpaceRecord {
  id: string;
  agentId: string;
  agentType: string;
  path: string;
  configPath: string | null;
  config: SpaceConfig;
  createdAt: string;
  updatedAt: string;
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

function rowToRecord(row: typeof schema.spaces.$inferSelect): SpaceRecord {
  let parsedConfig: SpaceConfig = {};
  try {
    parsedConfig = JSON.parse(row.config) as SpaceConfig;
  } catch {
    console.error(`[space-store] Failed to parse config for space ${row.id}`);
  }
  return {
    id: row.id,
    agentId: row.agentId,
    agentType: row.agentType,
    path: row.path,
    configPath: row.configPath ?? null,
    config: parsedConfig,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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

  const existing = getSpaceByPath(input.agentId, validation.relativePath);

  if (existing) {
    return {
      success: false,
      error: 'Space already registered',
      details: `Space ID: ${existing.id}, Path: ${existing.path}`
    };
  }

  const id = computeSpaceId(input.agentId, validation.relativePath);
  const now = new Date().toISOString();
  const configPath = path.join(validation.absolutePath, '.space', 'spaces.json');

  db.insert(schema.spaces).values({
    id,
    agentId: input.agentId,
    agentType: input.agentType,
    path: validation.relativePath,
    configPath,
    config: JSON.stringify(validation.config),
    createdAt: now,
    updatedAt: now,
  }).run();

  const space: SpaceRecord = {
    id,
    agentId: input.agentId,
    agentType: input.agentType,
    path: validation.relativePath,
    configPath,
    config: validation.config,
    createdAt: now,
    updatedAt: now,
  };

  logAudit('space.create', userId, { spaceId: id, path: space.path });

  return { success: true, space };
}

export function insertSpace(data: {
  id: string;
  agentId: string;
  agentType: string;
  path: string;
  configPath: string | null;
  config: SpaceConfig;
  createdAt: string;
  updatedAt: string;
}): SpaceRecord {
  db.insert(schema.spaces).values({
    id: data.id,
    agentId: data.agentId,
    agentType: data.agentType,
    path: data.path,
    configPath: data.configPath ?? null,
    config: JSON.stringify(data.config),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }).onConflictDoNothing().run();

  return {
    id: data.id,
    agentId: data.agentId,
    agentType: data.agentType,
    path: data.path,
    configPath: data.configPath ?? null,
    config: data.config,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function getSpace(id: string, userId: string = 'system'): SpaceRecord | null {
  const row = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();

  if (!row) return null;

  const space = rowToRecord(row);
  logAudit('space.access', userId, { spaceId: id, path: space.path });

  return space;
}

export function getSpaceByPath(agentId: string, spacePath: string): SpaceRecord | null {
  const row = db.select().from(schema.spaces)
    .where(and(eq(schema.spaces.agentId, agentId), eq(schema.spaces.path, spacePath)))
    .get();

  return row ? rowToRecord(row) : null;
}

export function listSpaces(agentId?: string): SpaceRecord[] {
  const rows = agentId
    ? db.select().from(schema.spaces).where(eq(schema.spaces.agentId, agentId)).all()
    : db.select().from(schema.spaces).all();

  return rows.map(rowToRecord);
}

export function deleteSpace(id: string, userId: string = 'system'): boolean {
  const row = db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get();

  if (!row) return false;

  db.delete(schema.spaces).where(eq(schema.spaces.id, id)).run();

  logAudit('space.delete', userId, { spaceId: id, path: row.path });

  return true;
}
