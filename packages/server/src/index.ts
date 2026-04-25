import { serve } from '@hono/node-server';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { spacesRouter, getSpaceById } from './routes/spaces.js';
import { filesRouter, setFileProvider } from './routes/files.js';
import { chatRouter } from './routes/chat.js';
import { auditRouter } from './routes/audit.js';
import { createFileProvider } from './file-provider.js';
import { seedAdmin } from './seed-admin.js';
import { runMigrations } from './db/migrate.js';
import { seedFromJsonIfNeeded } from './db/seed-from-json.js';
import { fileWatcher, type FileChangedEvent } from './file-watcher.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';


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
app.route('/api/spaces', spacesRouter);
app.route('/api/files', filesRouter);
app.route('/api/chat', chatRouter);
app.route('/api/audit', auditRouter);

if (fs.existsSync(config.WEB_DIST)) {
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) {
      return next();
    }
    const filePath = path.join(config.WEB_DIST, c.req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath);
      return c.text(content, 200, {
        'Content-Type': getContentType(filePath),
      });
    }
    const indexContent = fs.readFileSync(path.join(config.WEB_DIST, 'index.html'), 'utf-8');
    return c.text(indexContent, 200, {
      'Content-Type': 'text/html',
    });
  });
  console.log(`Serving static files from: ${config.WEB_DIST}`);
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

runMigrations();
seedFromJsonIfNeeded();
await seedAdmin();

function rawDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(String(data), 'utf8');
}

const wss = new WebSocketServer({ noServer: true });

// Track browser WebSocket clients per space for broadcasting file change events
const spaceClients = new Map<string, Set<WebSocket>>();

function addSpaceClient(spaceId: string, ws: WebSocket): void {
  let clients = spaceClients.get(spaceId);
  if (!clients) {
    clients = new Set();
    spaceClients.set(spaceId, clients);
  }
  clients.add(ws);
}

function removeSpaceClient(spaceId: string, ws: WebSocket): void {
  const clients = spaceClients.get(spaceId);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) {
    spaceClients.delete(spaceId);
  }
}

// Broadcast file change events to all browser clients connected to a space
fileWatcher.on('file:changed', (event: FileChangedEvent) => {
  const clients = spaceClients.get(event.spaceId);
  if (!clients || clients.size === 0) return;

  const message = JSON.stringify({
    type: 'file:changed',
    spaceId: event.spaceId,
    path: event.path,
    action: event.action,
  });

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
});

wss.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathMatch = url.pathname.match(/^\/ws\/spaces\/([^/]+)$/);

  if (!pathMatch) {
    socket.destroy();
    return;
  }

  const spaceId = pathMatch[1];

  const serverSpace = getSpaceById(spaceId);
  if (!serverSpace) {
    socket.destroy();
    return;
  }

  // Require JWT — check Authorization header first, then ?token= query param
  const authHeader = request.headers.authorization;
  const rawToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : url.searchParams.get('token');

  if (!rawToken) {
    wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, 'Authentication required'));
    return;
  }

  let userId: string;
  let userRole: string;
  try {
    const decoded = jwt.verify(rawToken, config.JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.userId) throw new Error('Missing userId');
    userId = decoded.userId as string;
    userRole = (decoded.role as string) || 'viewer';
  } catch {
    wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, 'Invalid token'));
    return;
  }

  const pluginWsUrl = `${config.PLUGIN_WS_URL}/api/spaces/${spaceId}/ws`;

  console.log('[WS-PROXY] Proxying WebSocket to plugin:', pluginWsUrl, '(userId:', userId, 'role:', userRole, ')');

  const gatewayWs = new WebSocket(pluginWsUrl, {
    headers: {
      Authorization: `Bearer ${rawToken}`,
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

  gatewayWs.on('message', (data, isBinary) => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    } else {
      pendingToClient.push(rawDataToBuffer(data));
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

    // Register this client for file change broadcasts
    addSpaceClient(spaceId, ws);

    // Start watching the space directory if not already watching
    fileWatcher.watch(spaceId, serverSpace.path);

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
      removeSpaceClient(spaceId, ws);
      gatewayWs.close();
    });

    ws.on('error', (err) => {
      console.error('[WS-PROXY] Browser WebSocket error:', err.message);
      removeSpaceClient(spaceId, ws);
      gatewayWs.close();
    });
  });
});

const server = serve({
  fetch: app.fetch,
  port: config.AI_SPACES_PORT,
  overrideGlobalObjects: false,
});

server.on('upgrade', (request, socket, head) => {
  wss.emit('upgrade', request, socket, head);
});

console.log(`Server started on port ${config.AI_SPACES_PORT}`);

export { app };
