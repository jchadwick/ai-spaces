import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'fs';
import * as path from 'path';
import type { SpaceConfig } from '@ai-spaces/shared';
import { computeSpaceId } from '@ai-spaces/shared';
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
import { agentAdapter } from '../agent-adapter-instance.js';

export const spacesRouter = new Hono();
spacesRouter.use('*', authMiddleware);

export function getSpaceById(id: string): SpaceRecord | null {
  return getSpace(id);
}

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
            const id = spaceConfig.id ?? computeSpaceId(agentName, spacePathRel);

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
