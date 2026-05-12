import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { servers, inviteTokens, notifications, spaces } from '../db/index.js';
import { DEFAULT_SERVER_ID } from '../db/constants.js';
import { reconcileFromSpaceList } from '../reconcile.js';
import { getServerById } from '../db/queries.js';
import { getSpace } from '../space-store.js';
import { config } from '../config.js';

export const internalRouter = new Hono();

const RegisterBodySchema = z.object({
  pluginUrl: z.string().url(),
  gatewayUrl: z.string().url(),
  name: z.string().optional(),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
internalRouter.post('/register', zValidator('json', RegisterBodySchema), async (c) => {
  const { pluginUrl, gatewayUrl, name } = c.req.valid('json');

  const existing = db.select().from(servers).where(eq(servers.pluginUrl, pluginUrl)).get();
  if (existing) {
    return c.json({ serverId: existing.id, callbackToken: existing.callbackToken, gatewayUrl: existing.gatewayUrl });
  }

  const serverId = crypto.randomUUID();
  const callbackToken = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();

  db.insert(servers).values({
    id: serverId,
    name: name ?? pluginUrl,
    pluginUrl,
    gatewayUrl,
    callbackToken,
    createdAt: now,
  }).run();

  return c.json({ serverId, callbackToken, gatewayUrl }, 201);
});

const ReconcileBodySchema = z.object({
  spaces: z.array(z.unknown()).optional(),
  serverId: z.string().optional(),
  callbackToken: z.string().optional(),
});

function timingSafeTokenEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
internalRouter.post('/reconcile', zValidator('json', ReconcileBodySchema), async (c) => {
  const { spaces, serverId, callbackToken } = c.req.valid('json');

  if (!Array.isArray(spaces)) return c.json({ success: true });

  const effectiveServerId = serverId ?? DEFAULT_SERVER_ID;

  if (serverId && serverId !== DEFAULT_SERVER_ID) {
    const serverRow = getServerById(serverId);
    if (!serverRow?.callbackToken) return c.json({ error: 'Unknown server' }, 401);
    if (!callbackToken || !timingSafeTokenEqual(callbackToken, serverRow.callbackToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  await reconcileFromSpaceList(spaces as Parameters<typeof reconcileFromSpaceList>[0], effectiveServerId);
  return c.json({ success: true });
});

const CreateInviteBodySchema = z.object({
  spaceId: z.string().min(1),
  role: z.enum(['owner', 'editor', 'viewer']),
  serverId: z.string(),
  callbackToken: z.string(),
});

// POST /api/internal/invites — create invite token (plugin-authenticated)
// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
internalRouter.post('/invites', zValidator('json', CreateInviteBodySchema), async (c) => {
  const { spaceId, role, serverId, callbackToken } = c.req.valid('json');

  // Authenticate the server by callbackToken
  const serverRow = getServerById(serverId);
  if (!serverRow?.callbackToken) return c.json({ error: 'Unknown server' }, 401);
  if (!timingSafeTokenEqual(callbackToken, serverRow.callbackToken)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Verify space exists on this server
  const space = getSpace(spaceId);
  if (!space) return c.json({ error: 'Space not found' }, 404);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.insert(inviteTokens).values({
    id: inviteId,
    spaceId,
    tokenHash,
    role,
    expiresAt,
    consumedAt: null,
  }).run();

  const inviteUrl = `${config.INVITE_BASE_URL}/invite#token=${rawToken}`;

  return c.json({ inviteId, inviteUrl });
});
