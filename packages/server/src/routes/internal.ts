import * as crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { inviteTokens } from "../db/index.js";
import { reconcileFromSpaceList } from "../reconcile.js";
import {
  authenticateRuntimeCallback,
  getRuntimeAuthFromRequest,
  registerRuntimeServer,
} from "../runtime-servers.js";
import { getSpace } from "../space-store.js";

export const internalRouter = new Hono();

const RegisterBodySchema = z.object({
  registrationToken: z.string().min(1),
  runtimeType: z.literal("openclaw"),
  name: z.string().min(1),
  pluginUrl: z.string().url().optional(),
  acpBaseUrl: z.string().url().optional(),
  gatewayUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
internalRouter.post("/register", zValidator("json", RegisterBodySchema), async (c) => {
  try {
    const result = registerRuntimeServer(c.req.valid("json"));
    return c.json(
      {
        serverId: result.server.id,
        callbackToken: result.callbackToken,
        gatewayUrl: result.server.gatewayUrl,
        status: result.server.status,
      },
      result.created ? 201 : 200,
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Registration failed" }, 400);
  }
});

const ReconcileBodySchema = z.object({
  spaces: z.array(z.unknown()).optional(),
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
internalRouter.post("/reconcile", zValidator("json", ReconcileBodySchema), async (c) => {
  const { spaces } = c.req.valid("json");

  const { callbackToken } = getRuntimeAuthFromRequest(c);
  const runtimeServer = authenticateRuntimeCallback(callbackToken);
  if (!runtimeServer) return c.json({ error: "Unauthorized" }, 401);

  if (!Array.isArray(spaces)) return c.json({ success: true });

  await reconcileFromSpaceList(
    spaces as Parameters<typeof reconcileFromSpaceList>[0],
    runtimeServer.id,
  );
  return c.json({ success: true });
});

const CreateInviteBodySchema = z.object({
  spaceId: z.string().min(1),
  role: z.enum(["owner", "editor", "viewer"]),
});

// POST /api/internal/invites — create invite token (plugin-authenticated)
// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
internalRouter.post("/invites", zValidator("json", CreateInviteBodySchema), async (c) => {
  const { spaceId, role } = c.req.valid("json");

  const { callbackToken } = getRuntimeAuthFromRequest(c);
  const runtimeServer = authenticateRuntimeCallback(callbackToken);
  if (!runtimeServer) return c.json({ error: "Unauthorized" }, 401);

  // Verify space exists on this server
  const space = getSpace(spaceId);
  if (!space) return c.json({ error: "Space not found" }, 404);
  if (space.serverId !== runtimeServer.id) return c.json({ error: "Space not found" }, 404);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + config.INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  db.insert(inviteTokens)
    .values({
      id: inviteId,
      spaceId,
      tokenHash,
      role,
      expiresAt,
      consumedAt: null,
    })
    .run();

  const inviteUrl = `${config.BASE_URL}/invite#token=${rawToken}`;

  return c.json({ inviteId, inviteUrl });
});
