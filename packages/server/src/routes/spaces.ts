import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getSpace,
  listSpaces,
  deleteSpace,
  type SpaceRecord,
} from '../space-store.js';
import { authMiddleware } from '../middleware/auth.js';
import { agentAdapter } from '../agent-adapter-instance.js';
import { reconcileFromSpaceList } from '../reconcile.js';

export const spacesRouter = new Hono();
spacesRouter.use('*', authMiddleware);

export function getSpaceById(id: string): SpaceRecord | null {
  return getSpace(id);
}

spacesRouter.get('/', (c) => {
  const allSpaces = listSpaces();
  const spaces = allSpaces.map(s => {
    const parent = allSpaces
      .filter(other => other.id !== s.id && s.path.startsWith(other.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return {
      id: s.id,
      path: s.path,
      config: s.config,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      parentSpaceId: parent?.id ?? null,
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

  return c.json({ space });
});

spacesRouter.get('/:id/files', async (c) => {
  const id = c.req.param('id');
  const dirPath = c.req.query('path') || '';
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: 'Space not found' }, 404);
  }

  try {
    const files = await agentAdapter.listFiles(space, dirPath);
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


spacesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteSpace(id);

  if (!deleted) {
    return c.json({ error: 'Space not found' }, 404);
  }

  return c.json({ success: true });
});

spacesRouter.post('/scan', async (c) => {
  const spaces = await agentAdapter.scanSpaces();
  const before = listSpaces().length;
  await reconcileFromSpaceList(spaces);
  const after = listSpaces().length;
  const registered = Math.max(0, after - before);

  return c.json({
    discovered: spaces.map(s => ({
      id: s.id,
      name: s.config?.name ?? s.path,
      agent: s.agentId,
      path: s.path,
      config: s.config,
    })),
    registered,
  });
});

export type SpacesRouter = typeof spacesRouter;
