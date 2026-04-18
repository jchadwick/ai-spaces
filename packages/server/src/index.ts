import 'dotenv/config';
import { serve } from '@hono/node-server';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { authRouter } from './routes/auth.js';
import { spacesRouter } from './routes/spaces.js';
import { filesRouter, setFileProvider } from './routes/files.js';
import { chatRouter } from './routes/chat.js';
import { auditRouter } from './routes/audit.js';
import { authMiddleware } from './middleware/auth.js';
import { createFileProvider } from './file-provider.js';
import { seedAdmin } from './seed-admin.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:19000';
/** OpenClaw gateway HTTP/WS auth (browser WebSockets cannot set headers). */
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'secret';
const PORT = parseInt(process.env.AI_SPACES_PORT || '3001', 10);
const WEB_DIST = process.env.WEB_DIST || path.join(process.env.HOME || '', 'ai-spaces', 'packages', 'web', 'dist');

setFileProvider(createFileProvider());

const app = new Hono();

app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/chat')) {
    console.log('[MAIN] Chat request:', c.req.path, c.req.method);
  }
  await next();
});

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

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

seedAdmin();

function rawDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(String(data), 'utf8');
}

const wss = new WebSocketServer({ noServer: true });

wss.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathMatch = url.pathname.match(/^\/ws\/spaces\/([^/]+)$/);

  if (!pathMatch) {
    socket.destroy();
    return;
  }

  const spaceId = pathMatch[1];
  const gatewayWsUrl = `${GATEWAY_URL.replace(/^http/, 'ws')}/api/spaces/${spaceId}/ws`;
  const browserAuth = request.headers.authorization?.trim() || '';
  const gatewayAuth = browserAuth || `Bearer ${GATEWAY_TOKEN}`;

  console.log('[WS-PROXY] Proxying WebSocket to gateway:', gatewayWsUrl);

  const gatewayWs = new WebSocket(gatewayWsUrl, {
    headers: {
      Authorization: gatewayAuth,
    },
  });

  let clientWs: WebSocket | null = null;
  const pendingToClient: Buffer[] = [];
  const pendingToGateway: Buffer[] = [];

  const flushToClient = () => {
    if (!clientWs || clientWs.readyState !== WebSocket.OPEN) return;
    for (const chunk of pendingToClient) {
      clientWs.send(chunk);
    }
    pendingToClient.length = 0;
  };

  const flushToGateway = () => {
    if (gatewayWs.readyState !== WebSocket.OPEN) return;
    for (const chunk of pendingToGateway) {
      gatewayWs.send(chunk);
    }
    pendingToGateway.length = 0;
  };

  gatewayWs.on('open', () => {
    console.log('[WS-PROXY] Gateway connection open');
    flushToGateway();
  });

  gatewayWs.on('message', (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(buf);
    } else {
      pendingToClient.push(buf);
    }
  });

  gatewayWs.on('error', (err) => {
    console.error('[WS-PROXY] Gateway WebSocket error:', err.message);
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Gateway error');
    }
    socket.destroy();
  });

  gatewayWs.on('close', () => {
    console.log('[WS-PROXY] Gateway WebSocket closed');
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, 'Gateway closed');
    }
  });

  wss.handleUpgrade(request, socket, head, (ws) => {
    clientWs = ws;
    console.log('[WS-PROXY] Browser WebSocket connected');
    flushToClient();

    ws.on('message', (data) => {
      if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.send(data);
      } else {
        pendingToGateway.push(rawDataToBuffer(data));
      }
    });

    ws.on('close', () => {
      console.log('[WS-PROXY] Browser WebSocket closed');
      gatewayWs.close();
    });

    ws.on('error', (err) => {
      console.error('[WS-PROXY] Browser WebSocket error:', err.message);
      gatewayWs.close();
    });
  });
});

const server = serve({
  fetch: app.fetch,
  port: PORT,
  overrideGlobalObjects: false,
});

server.on('upgrade', (request, socket, head) => {
  wss.emit('upgrade', request, socket, head);
});

console.log(`Server started on port ${PORT}`);

export { app };
