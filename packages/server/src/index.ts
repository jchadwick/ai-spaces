import 'dotenv/config';
import { serve } from '@hono/node-server';
import * as fs from 'fs';
import * as path from 'path';
import { app } from './app.js';
import { seedAdmin } from './seed-admin.js';

const PORT = parseInt(process.env.AI_SPACES_PORT || '3001', 10);
const WEB_DIST = process.env.WEB_DIST || path.join(process.env.HOME || '', 'ai-spaces', 'packages', 'web', 'dist');

if (fs.existsSync(WEB_DIST)) {
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) {
      return next();
    }
    const filePath = path.join(WEB_DIST, c.req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath);
      return c.text(content, 200, {
        'Content-Type': getContentType(filePath),
      });
    }
    const indexContent = fs.readFileSync(path.join(WEB_DIST, 'index.html'), 'utf-8');
    return c.text(indexContent, 200, {
      'Content-Type': 'text/html',
    });
  });
  console.log(`Serving static files from: ${WEB_DIST}`);
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };
  return types[ext] || 'text/plain';
}

seedAdmin();

console.log(`AI Spaces server running on port ${PORT}`);

serve({
  fetch: app.fetch,
  port: PORT,
});

export { app };