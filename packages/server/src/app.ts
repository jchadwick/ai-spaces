import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { authRouter } from './routes/auth.js';
import { spacesRouter } from './routes/spaces.js';
import { filesRouter, setFileProvider } from './routes/files.js';
import { chatRouter } from './routes/chat.js';
import { auditRouter } from './routes/audit.js';
import { authMiddleware } from './middleware/auth.js';
import { createFileProvider } from './file-provider.js';

setFileProvider(createFileProvider());

export const app = new Hono();

app.use('*', logger());

app.use('/api/*', cors({
  origin: '*',
  credentials: true,
}));

app.route('/api/auth', authRouter);
app.route('/api/spaces', spacesRouter.use(authMiddleware));
app.route('/api/files', filesRouter.use(authMiddleware));
app.route('/api/chat', chatRouter.use(authMiddleware));
app.route('/api/audit', auditRouter.use(authMiddleware));

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.onError((err, c) => {
  console.error('Server error:', err);
  
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  
  return c.json({ error: 'Internal server error' }, 500);
});

export type App = typeof app;