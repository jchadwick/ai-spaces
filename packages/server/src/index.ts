import { serve } from '@hono/node-server';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import jwt from 'jsonwebtoken';
import { config, assertProductionHttps } from './config.js';
import { authRouter } from './routes/auth.js';
import { spacesRouter, getSpaceById } from './routes/spaces.js';
import { auditRouter } from './routes/audit.js';
import { membersRouter } from './routes/members.js';
import { invitesRouter } from './routes/invites.js';
import { identityRouter } from './routes/identity.js';
import { confirmRouter } from './routes/confirm.js';
import { adminRouter } from './routes/admin.js';
import { internalRouter } from './routes/internal.js';
import { runMigrations } from './db/migrate.js';
import { getUserSpaceRole, getServerBySpaceId } from './db/queries.js';
import { createInternalMiddleware } from './middleware/ip-allowlist.js';
import { db } from './db/connection.js';
import { servers } from './db/index.js';
import { DEFAULT_SERVER_ID } from './db/constants.js';
import { agentAdapter } from './agent-adapter-instance.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';


assertProductionHttps(config.INVITE_BASE_URL, 'INVITE_BASE_URL');

const app = new Hono();

// WS logger with token redaction
app.use('*', logger((str, ...rest) => {
  const redacted = str.replace(/[?&]token=[^&\s]*/g, (m) => m.replace(/token=[^&\s]*/, 'token=[REDACTED]'));
  console.log(redacted, ...rest);
}));

app.use('/api/*', cors({
  origin: '*',
  credentials: true,
}));

// CSP middleware for invite and login routes — register before static file serving
// Note: Hono's use() does not accept an array of paths; register each path separately
app.use('/invite*', async (c, next) => {
  await next();
  c.res.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
});
app.use('/login*', async (c, next) => {
  await next();
  c.res.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
});
app.use('/register*', async (c, next) => {
  await next();
  c.res.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
});

const internalMiddleware = createInternalMiddleware(config.GATEWAY_TOKEN);
app.use('/api/internal/*', internalMiddleware);
app.route('/api/internal', internalRouter);

app.get('/health', async (c) => {
  const startedAt = Date.now();

  // Check DB
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    db.run('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  // Check plugin reachability
  let pluginStatus: 'ok' | 'unreachable' | 'unknown' = 'unknown';
  try {
    const registeredServer = db.select().from(servers).get();
    if (registeredServer?.pluginUrl) {
      const res = await fetch(`${registeredServer.pluginUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      pluginStatus = res.ok ? 'ok' : 'unreachable';
    }
  } catch {
    pluginStatus = 'unreachable';
  }

  const circuitBreaker = agentAdapter.getCircuitStatus().toLowerCase() as 'closed' | 'open' | 'half_open';
  const degraded = dbStatus !== 'ok' || pluginStatus === 'unreachable' || circuitBreaker === 'open';

  return c.json(
    {
      status: degraded ? 'degraded' : 'ok',
      db: dbStatus,
      plugin: pluginStatus,
      circuitBreaker,
      uptime: Math.floor(process.uptime()),
    },
    degraded ? 503 : 200,
  );
});

app.route('/api/auth', authRouter);
app.route('/api/admin', adminRouter);
app.route('/api/spaces', spacesRouter);
app.route('/api/spaces', membersRouter);
app.route('/api/spaces', identityRouter);
app.route('/api/audit', auditRouter);
app.route('/api/invites', invitesRouter);
app.route('/api', confirmRouter);

if (fs.existsSync(config.WEB_DIST)) {
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/ws/')) {
      return next();
    }
    const filePath = path.join(config.WEB_DIST, c.req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath, 'utf-8');
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

runMigrations();

db.insert(servers).values({
  id: DEFAULT_SERVER_ID,
  name: 'God Server',
  createdAt: new Date().toISOString(),
}).onConflictDoNothing().run();

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

  console.log('[WS-UPGRADE] url:', request.url, 'headers:', JSON.stringify({ upgrade: request.headers.upgrade, authorization: request.headers.authorization ? 'present' : 'absent', tokenParam: url.searchParams.has('token') ? 'present' : 'absent' }));

  if (!pathMatch) {
    console.log('[WS-UPGRADE] no path match, destroying');
    socket.destroy();
    return;
  }

  const spaceId = pathMatch[1];

  const serverSpace = getSpaceById(spaceId);
  if (!serverSpace) {
    console.log('[WS-UPGRADE] space not found:', spaceId);
    socket.destroy();
    return;
  }

  let userId: string;
  let rawToken: string | null = null;

  // In non-production dev mode with DEV_VIRTUAL_USER, bypass JWT validation
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_VIRTUAL_USER === 'true') {
    userId = 'dev-user-00000000-0000-0000-0000-000000000000';
  } else {
    // Require JWT — check Authorization header first, then ?token= query param
    const authHeader = request.headers.authorization;
    rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : url.searchParams.get('token');

    if (!rawToken) {
      console.log('[WS-UPGRADE] no token, closing 1008');
      wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, 'Authentication required'));
      return;
    }

    try {
      const decoded = jwt.verify(rawToken, config.JWT_SECRET) as jwt.JwtPayload;
      if (!decoded.userId) throw new Error('Missing userId');
      userId = decoded.userId as string;
      console.log('[WS-UPGRADE] auth ok, userId:', userId);
    } catch (err) {
      console.log('[WS-UPGRADE] invalid token:', (err as Error).message);
      wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, 'Invalid token'));
      return;
    }
  }

  // Resolve the user's actual SpaceRole from the DB (admin → 'owner' handled here)
  const spaceRole = getUserSpaceRole(userId, spaceId);
  if (!spaceRole) {
    console.log('[WS-UPGRADE] no space access, userId:', userId, 'spaceId:', spaceId);
    wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, 'Forbidden'));
    return;
  }

  const pluginServer = getServerBySpaceId(spaceId);
  if (!pluginServer?.pluginUrl) {
    console.log('[WS-PROXY] No plugin URL for space:', spaceId);
    wss.handleUpgrade(request, socket, head, (ws) => ws.close(1011, 'No plugin registered for this space'));
    return;
  }
  const pluginWsUrl = `${pluginServer.pluginUrl.replace(/^http/, 'ws')}/api/spaces/${spaceId}/ws`;

  // Mint a forwarding token with the resolved SpaceRole so the plugin gets the correct role
  const forwardToken = jwt.sign(
    { userId, role: spaceRole },
    config.JWT_SECRET,
    { expiresIn: '1h' },
  );

  const gatewayWs = new WebSocket(pluginWsUrl, {
    headers: {
      Authorization: `Bearer ${forwardToken}`,
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
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, 'Gateway closed');
    }
  });

  wss.handleUpgrade(request, socket, head, (ws) => {
    clientWs = ws;
    flushToClient();

    ws.on('message', (data) => {
      if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.send(data);
      } else {
        pendingToGateway.push(rawDataToBuffer(data));
      }
    });

    ws.on('close', () => {
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
  port: config.AI_SPACES_PORT,
  hostname: '0.0.0.0',
  overrideGlobalObjects: false,
});

server.on('upgrade', (request, socket, head) => {
  wss.emit('upgrade', request, socket, head);
});

console.log(`Server started on port ${config.AI_SPACES_PORT}`);

export { app };
