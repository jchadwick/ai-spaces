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
  const authHeader = request.headers.authorization || '';

  console.log('[WS-PROXY] Proxying WebSocket to gateway:', gatewayWsUrl);

  const gatewayWs = new WebSocket(gatewayWsUrl, {
    headers: {
      Authorization: authHeader,
    },
  });

  let pendingNonce: string | null = null;
  let gatewayReady = false;
  let clientWs: WebSocket | null = null;

  gatewayWs.on('open', () => {
    console.log('[WS-PROXY] Gateway connection open');
  });

  gatewayWs.on('message', (data) => {
    const msgStr = data.toString();
    const msg = JSON.parse(msgStr);
    console.log('[WS-PROXY] Message from gateway:', msg.type, msg.event || msg.id || '');
    
    // Handle gateway connect challenge - forward to browser
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      pendingNonce = msg.payload.nonce;
      gatewayReady = true;
      console.log('[WS-PROXY] Gateway handshake complete, nonce:', pendingNonce);
      // Forward challenge to browser
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        console.log('[WS-PROXY] Forwarding challenge to browser');
        clientWs.send(msgStr);
      } else {
        console.log('[WS-PROXY] Client WebSocket not ready, cannot forward challenge');
      }
      return;
    }
    
    // Handle gateway connect response
    if (msg.id === 'connect') {
      console.log('[WS-PROXY] Gateway connect response:', msg.ok);
      if (msg.ok) {
        // Send connected event to browser
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          console.log('[WS-PROXY] Sending connected event to browser');
          clientWs.send(JSON.stringify({
            type: 'event',
            event: 'connected',
            payload: { spaceId },
          }));
        }
      } else {
        // Connect failed, notify browser
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          console.log('[WS-PROXY] Connection failed, notifying browser');
          clientWs.send(JSON.stringify({
            type: 'event',
            event: 'error',
            payload: { message: msg.error?.message || 'Connection failed' },
          }));
        }
      }
      return;
    }
    
    // Forward all other messages to browser
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      console.log('[WS-PROXY] Forwarding message to browser:', msg.type, msg.event || msg.id || '');
      clientWs.send(msgStr);
    }
  });

  gatewayWs.on('error', (err) => {
    console.error('[WS-PROXY] Gateway WebSocket error:', err.message);
    if (clientWs) clientWs.close();
    socket.destroy();
  });

  gatewayWs.on('close', () => {
    console.log('[WS-PROXY] Gateway WebSocket closed');
    if (clientWs) clientWs.close();
  });

  // Wait for upgrade from browser
  wss.handleUpgrade(request, socket, head, (ws) => {
    clientWs = ws;
    console.log('[WS-PROXY] Browser WebSocket connected');

    ws.on('message', (data) => {
      const msgStr = data.toString();
      console.log('[WS-PROXY] Message from browser:', msgStr.substring(0, 200));
      
      // Don't process until gateway handshake is complete
      if (!gatewayReady || pendingNonce === null) {
        console.log('[WS-PROXY] Browser message received but gateway not ready yet. gatewayReady:', gatewayReady, 'pendingNonce:', pendingNonce);
        return;
      }
      
      const msg = JSON.parse(msgStr);
      
      // Intercept browser's connect request to transform it
      if (msg.type === 'req' && msg.method === 'connect') {
        console.log('[WS-PROXY] Transforming browser connect request');
        const transformedMsg = {
          type: 'req',
          id: 'connect',
          method: 'connect',
          params: {
            auth: {
              nonce: pendingNonce,
            },
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'webchat',
              platform: 'web',
              mode: 'webchat',
              version: '1.0',
            },
          },
        };
        pendingNonce = null; // Use nonce only once
        console.log('[WS-PROXY] Sending transformed message to gateway:', JSON.stringify(transformedMsg));
        gatewayWs.send(JSON.stringify(transformedMsg));
        return;
      }
      
      // Forward all other messages to gateway if connected
      if (gatewayWs.readyState === WebSocket.OPEN) {
        console.log('[WS-PROXY] Forwarding message to gateway');
        gatewayWs.send(data);
      } else {
        console.log('[WS-PROXY] Gateway not connected, cannot forward message');
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
