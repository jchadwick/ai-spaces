import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getSpace,
  listSpaces,
  deleteSpace,
  updateSpaceConfig,
  type SpaceRecord,
} from '../space-store.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { agentAdapter } from '../agent-adapter-instance.js';
import type { SpaceRole, FileMetadataEntry } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';
import { getUserSpaceRole, getUserSpaceRoles } from '../db/queries.js';

export interface SpaceVariables extends AuthVariables {
  spaceRole: SpaceRole;
}

export const spacesRouter = new Hono<{ Variables: SpaceVariables }>();
spacesRouter.use('*', authMiddleware);

export function getSpaceById(id: string): SpaceRecord | null {
  return getSpace(id);
}

// Space access middleware — resolves spaceRole for /:id and all sub-routes
spacesRouter.use('/:id', async (c, next) => {
  const { userId } = c.get('user');
  const spaceId = c.req.param('id');
  const role = getUserSpaceRole(userId, spaceId);
  if (!role) return c.json({ error: 'Forbidden' }, 403);
  c.set('spaceRole', role);
  return next();
});

spacesRouter.use('/:id/*', async (c, next) => {
  const { userId } = c.get('user');
  const spaceId = c.req.param('id');
  const role = getUserSpaceRole(userId, spaceId);
  if (!role) return c.json({ error: 'Forbidden' }, 403);
  c.set('spaceRole', role);
  return next();
});

spacesRouter.get('/', (c) => {
  const { userId } = c.get('user');
  const allSpaces = listSpaces();
  const membershipMap = getUserSpaceRoles(userId, allSpaces.map(s => s.id));
  const accessibleSpaces = allSpaces.filter(s => membershipMap.has(s.id));

  const spaces = accessibleSpaces.map(s => {
    const parent = accessibleSpaces
      .filter(other => other.id !== s.id && s.path.startsWith(other.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return {
      id: s.id,
      path: s.path,
      config: s.config,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      parentSpaceId: parent?.id ?? null,
      userRole: membershipMap.get(s.id) ?? 'viewer',
    };
  });
  return c.json({ spaces });
});

spacesRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  const spaceRole = c.get('spaceRole');
  return c.json({ space, userRole: spaceRole });
});

spacesRouter.get('/:id/metadata', async (c) => {
  const id = c.req.param('id');
  const space = getSpace(id);
  if (!space) return c.json({ error: 'Space not found' }, 404);
  try {
    const metadata = await agentAdapter.getMetadata(space);
    return c.json(metadata);
  } catch (err: any) {
    return c.json({ files: {} });
  }
});

const patchMetadataSchema = z.object({
  files: z.record(z.string(), z.object({
    displayName: z.string().optional(),
    summary: z.string().optional(),
  })),
});

// @ts-ignore -- tsgo TS2589
spacesRouter.patch('/:id/metadata', zValidator('json', patchMetadataSchema), async (c) => {
  const id = c.req.param('id');
  const { files } = c.req.valid('json');
  const space = getSpace(id);
  if (!space) return c.json({ error: 'Space not found' }, 404);
  try {
    await agentAdapter.patchMetadata(space, files as Record<string, Partial<FileMetadataEntry>>);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to update metadata' }, 500);
  }
});

spacesRouter.get('/:id/files', async (c) => {
  const id = c.req.param('id');
  const dirPath = c.req.query('path') || '';
  const space = getSpace(id);
  const role = c.get('spaceRole');

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    const files = await agentAdapter.listFiles(space, dirPath, role);
    return c.json({ files });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to list files' }, 500);
  }
});

spacesRouter.get('/:id/files/:filePath{.*}', async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    const { content, contentType } = await agentAdapter.readFile(space, filePath);
    c.header('Content-Type', contentType);
    return c.body(content);
  } catch (err: any) {
    return c.json({ error: err.message ?? 'File not found' }, 404);
  }
});

const writeFileSchema = z.object({
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']).optional(),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.put('/:id/files/:filePath{.*}', zValidator('json', writeFileSchema), async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const { content, encoding } = c.req.valid('json');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    await agentAdapter.writeFile(space, filePath, content, encoding);
    return c.json({ success: true, path: filePath });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to write file' }, 500);
  }
});

const createDirSchema = z.object({
  path: z.string().min(1),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.post('/:id/directories', zValidator('json', createDirSchema), async (c) => {
  const id = c.req.param('id');
  const { path: dirPath } = c.req.valid('json');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    await agentAdapter.createDirectory(space, dirPath);
    return c.json({ success: true, path: dirPath });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to create directory' }, 500);
  }
});

spacesRouter.delete('/:id/files/:filePath{.*}', async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    await agentAdapter.deleteFile(space, filePath);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to delete file' }, 500);
  }
});

const renameFileSchema = z.object({
  newPath: z.string().min(1),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.patch('/:id/files/:filePath{.*}', zValidator('json', renameFileSchema), async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const { newPath } = c.req.valid('json');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    await agentAdapter.renameFile(space, filePath, newPath);
    return c.json({ success: true, path: newPath });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to rename file' }, 500);
  }
});

spacesRouter.delete('/:id/directories/:dirPath{.*}', async (c) => {
  const id = c.req.param('id');
  const dirPath = c.req.param('dirPath');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    await agentAdapter.deleteDirectory(space, dirPath);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to delete directory' }, 500);
  }
});

const renameDirSchema = z.object({
  newPath: z.string().min(1),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.patch('/:id/directories/:dirPath{.*}', zValidator('json', renameDirSchema), async (c) => {
  const id = c.req.param('id');
  const dirPath = c.req.param('dirPath');
  const { newPath } = c.req.valid('json');
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    await agentAdapter.renameDirectory(space, dirPath, newPath);
    return c.json({ success: true, path: newPath });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to rename directory' }, 500);
  }
});

const patchConfigSchema = z.object({
  notificationIgnorePatterns: z.array(z.string()).optional(),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.patch('/:id/config', zValidator('json', patchConfigSchema), async (c) => {
  const id = c.req.param('id');
  const space = getSpace(id);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const patch = c.req.valid('json');
  const updatedConfig = { ...space.config, ...patch };
  const validated = SpaceConfigSchema.safeParse(updatedConfig);
  if (!validated.success) {
    return c.json({ error: 'Invalid config', details: validated.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
  }

  try {
    const updated = updateSpaceConfig(id, validated.data, c.get('user').userId);
    if (!updated) return c.json({ error: 'Space not found' }, 404);

    // Also write updated config to the space's spaces.json file
    try {
      const configPath = '.space/spaces.json';
      await agentAdapter.writeFile(space, configPath, JSON.stringify(validated.data, null, 2));
    } catch (writeErr: any) {
      console.error('[spaces] Failed to write config file to space:', writeErr.message);
      // Config DB updated even if file write fails — space watcher will re-sync on next scan
    }

    return c.json({ space: updated });
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Failed to update config' }, 500);
  }
});

spacesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteSpace(id);

  if (!deleted) {
    return c.json({ error: 'Space not found' }, 404);
  }

  return c.json({ success: true });
});

export type SpacesRouter = typeof spacesRouter;
