import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { FileProvider } from '@ai-spaces/shared';

let fileProvider: FileProvider;

export function setFileProvider(provider: FileProvider) {
  fileProvider = provider;
}

export const filesRouter = new Hono();

const readSchema = z.object({
  path: z.string(),
});

const writeSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const listQuerySchema = z.object({
  path: z.string().optional(),
});

filesRouter.get('/read', zValidator('query', readSchema), async (c) => {
  const { path: filePath } = c.req.valid('query');
  
  try {
    const content = await fileProvider.read(filePath);
    return c.json({ content });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not found')) {
      return c.json({ error: 'File not found' }, 404);
    }
    if (message.includes('Access denied')) {
      return c.json({ error: 'Access denied' }, 403);
    }
    return c.json({ error: message }, 500);
  }
});

filesRouter.post('/write', zValidator('json', writeSchema), async (c) => {
  const { path: filePath, content } = c.req.valid('json');
  
  try {
    await fileProvider.write(filePath, content);
    return c.json({ success: true });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Access denied')) {
      return c.json({ error: 'Access denied' }, 403);
    }
    return c.json({ error: message }, 500);
  }
});

filesRouter.get('/list', zValidator('query', listQuerySchema), async (c) => {
  const { path: dirPath } = c.req.valid('query');
  
  try {
    const files = await fileProvider.list(dirPath || '');
    return c.json({ files });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not found')) {
      return c.json({ error: 'Directory not found' }, 404);
    }
    if (message.includes('Access denied')) {
      return c.json({ error: 'Access denied' }, 403);
    }
    return c.json({ error: message }, 500);
  }
});

export type FilesRouter = typeof filesRouter;