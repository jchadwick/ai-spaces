import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'fs';
import * as path from 'path';
import type { SpaceConfig } from '@ai-spaces/shared';
import { computeSpaceId } from '../space-id.js';
import { config } from '../config.js';
import {
  getSpace,
  listSpaces,
  deleteSpace,
  insertSpace,
  getSpaceByPath,
  type SpaceRecord,
} from '../space-store.js';
import { authMiddleware } from '../middleware/auth.js';

export const spacesRouter = new Hono();
spacesRouter.use('*', authMiddleware);

export function getSpaceById(id: string): SpaceRecord | null {
  return getSpace(id);
}

const createSpaceSchema = z.object({
  path: z.string().min(1),
  agentId: z.string().optional(),
  agentType: z.string().optional(),
});

spacesRouter.get('/', (c) => {
  const spaces = listSpaces().map(s => ({
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

  const fullPath = dirPath ? `${space.path}/${dirPath}` : space.path;

  try {
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: entry.name,
    }));
    return c.json({ files });
  } catch {
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

spacesRouter.get('/:id/files/:filePath{.*}', async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const space = getSpace(id);

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
      contentType = 'text';
    }

    const size = stats.size;
    const modified = stats.mtime.toISOString();

    if (contentType === 'image') {
      const imageBuffer = await fs.promises.readFile(fullPath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = getMimeType(filePath);
      return c.json({ path: filePath, content: base64, contentType: 'image', mimeType, size, modified });
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8');
    return c.json({ path: filePath, content, contentType, size, modified });
  } catch {
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
  const space = getSpace(id);

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
  } catch {
    return c.json({ error: 'Failed to write file' }, 500);
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

  const fullPath = path.join(space.path, dirPath);
  const normalizedSpacePath = path.normalize(space.path);
  const normalizedFullPath = path.normalize(fullPath);

  if (!normalizedFullPath.startsWith(normalizedSpacePath)) {
    return c.json({ error: 'Access denied: path escape attempt' }, 403);
  }

  try {
    await fs.promises.mkdir(fullPath, { recursive: true });
    return c.json({ success: true, path: dirPath });
  } catch {
    return c.json({ error: 'Failed to create directory' }, 500);
  }
});

const deleteFileSchema = z.object({});

spacesRouter.delete('/:id/files/:filePath{.*}', async (c) => {
  const id = c.req.param('id');
  const filePath = c.req.param('filePath');
  const space = getSpace(id);

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
    await fs.promises.unlink(fullPath);
    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Failed to delete file' }, 500);
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

  const fullPath = path.join(space.path, filePath);
  const newFullPath = path.join(space.path, newPath);
  const normalizedSpacePath = path.normalize(space.path);

  if (!path.normalize(fullPath).startsWith(normalizedSpacePath) || !path.normalize(newFullPath).startsWith(normalizedSpacePath)) {
    return c.json({ error: 'Access denied: path escape attempt' }, 403);
  }

  try {
    const newDir = path.dirname(newFullPath);
    await fs.promises.mkdir(newDir, { recursive: true });
    await fs.promises.rename(fullPath, newFullPath);
    return c.json({ success: true, path: newPath });
  } catch {
    return c.json({ error: 'Failed to rename file' }, 500);
  }
});

spacesRouter.delete('/:id/directories/:dirPath{.*}', async (c) => {
  const id = c.req.param('id');
  const dirPath = c.req.param('dirPath');
  const space = getSpace(id);

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
    await fs.promises.rm(fullPath, { recursive: true, force: true });
    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Failed to delete directory' }, 500);
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

  const fullPath = path.join(space.path, dirPath);
  const newFullPath = path.join(space.path, newPath);
  const normalizedSpacePath = path.normalize(space.path);

  if (!path.normalize(fullPath).startsWith(normalizedSpacePath) || !path.normalize(newFullPath).startsWith(normalizedSpacePath)) {
    return c.json({ error: 'Access denied: path escape attempt' }, 403);
  }

  try {
    await fs.promises.rename(fullPath, newFullPath);
    return c.json({ success: true, path: newPath });
  } catch {
    return c.json({ error: 'Failed to rename directory' }, 500);
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
  const resolvedAgentId = agentId || 'default';

  const existing = getSpaceByPath(resolvedAgentId, spacePath);
  if (existing) {
    return c.json({ error: 'Space already exists', spaceId: existing.id }, 409);
  }

  const id = computeSpaceId(resolvedAgentId, spacePath);
  const now = new Date().toISOString();

  const space = insertSpace({
    id,
    agentId: resolvedAgentId,
    agentType: agentType || 'default',
    path: spacePath,
    configPath: path.join(spacePath, '.space', 'spaces.json'),
    config: { name: path.basename(spacePath) },
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ space }, 201);
});

spacesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteSpace(id);

  if (!deleted) {
    return c.json({ error: 'Space not found' }, 404);
  }

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
            const spaceConfig: SpaceConfig = JSON.parse(configContent);
            const spacePathRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const id = computeSpaceId(agentName, spacePathRel);

            spaces.push({
              id,
              agentName,
              spaceName: spaceConfig.name || entry.name,
              spacePath: spacePathRel,
              configPath: spaceConfigPath,
              config: spaceConfig,
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

function getAgentWorkspace(agentName: string): string | null {
  const agentFile = path.join(config.OPENCLAW_HOME, 'agents', agentName, 'agent.json');

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
  const agentsHome = path.join(openclawHome, 'agents');

  if (!fs.existsSync(agentsHome)) {
    return c.json({ discovered: [], registered: 0 });
  }

  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  const allSpaces: DiscoveredSpace[] = [];

  for (const agentName of agentDirs) {
    const workspacePath = agentName === 'main'
      ? path.join(openclawHome, 'workspace')
      : (getAgentWorkspace(agentName) ?? path.join(openclawHome, 'workspace', agentName));

    const spaces = await findSpacesInWorkspace(workspacePath, agentName);
    allSpaces.push(...spaces);
  }

  let registered = 0;

  for (const space of allSpaces) {
    const existing = getSpaceByPath(space.agentName, space.spacePath);

    if (!existing) {
      const now = new Date().toISOString();
      insertSpace({
        id: space.id,
        agentId: space.agentName,
        agentType: space.agentName === 'main' ? 'main' : 'agent',
        path: space.spacePath,
        configPath: space.configPath,
        config: space.config,
        createdAt: now,
        updatedAt: now,
      });
      registered++;
    }
  }

  return c.json({
    discovered: allSpaces.map(space => ({
      id: space.id,
      name: space.spaceName,
      agent: space.agentName,
      path: space.spacePath,
      config: space.config,
    })),
    registered,
  });
});

export type SpacesRouter = typeof spacesRouter;
