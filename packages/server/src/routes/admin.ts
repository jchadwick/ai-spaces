import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { acpConnectionPool } from "../adapters/acp-connection-pool.js";
import { DEFAULT_SERVER_ID } from "../db/constants.js";
import { type AuthVariables, authMiddleware } from "../middleware/auth.js";
import {
  createRegistrationToken,
  listRuntimeServers,
  revokeOrDeleteRuntimeServer,
  updateRuntimeServer,
} from "../runtime-servers.js";
import { listUsers, updateUserServerRole } from "../user-service.js";

export const adminRouter = new Hono<{ Variables: AuthVariables }>();
adminRouter.use("*", authMiddleware);
adminRouter.use("*", async (c, next) => {
  if (c.get("user").serverRole !== "admin") return c.json({ error: "Forbidden" }, 403);
  return next();
});

adminRouter.get("/users", (c) => {
  return c.json({ users: listUsers() });
});

function redactMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      /token|secret|password|credential/i.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

const updateRoleSchema = z.object({ role: z.enum(["admin", "user"]) });

// @ts-expect-error -- tsgo TS2589
adminRouter.patch("/users/:id/role", zValidator("json", updateRoleSchema), (c) => {
  const { id } = c.req.param();
  const { role } = c.req.valid("json");
  const updated = updateUserServerRole(id, DEFAULT_SERVER_ID, role);
  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true });
});

adminRouter.get("/servers", (c) => {
  const servers = listRuntimeServers().map((server) => ({
    id: server.id,
    name: server.name,
    runtimeType: server.runtimeType,
    status: server.status,
    endpointUrl: server.endpointUrl,
    pluginUrl: server.pluginUrl,
    acpBaseUrl: server.acpBaseUrl,
    gatewayUrl: server.gatewayUrl,
    metadata: redactMetadata(server.metadata),
    lastSeenAt: server.lastSeenAt,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    revokedAt: server.revokedAt,
    hasCallbackToken: server.hasCallbackToken,
  }));
  return c.json({ servers });
});

const createRegistrationSchema = z.object({
  ttlSeconds: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60)
    .optional(),
});

// @ts-expect-error -- tsgo TS2589
adminRouter.post("/servers/registrations", zValidator("json", createRegistrationSchema), (c) => {
  const ttlMs = (c.req.valid("json").ttlSeconds ?? 15 * 60) * 1000;
  const registration = createRegistrationToken(c.get("user").userId, ttlMs);
  return c.json(
    {
      registrationId: registration.id,
      registrationToken: registration.token,
      expiresAt: registration.expiresAt,
    },
    201,
  );
});

const updateServerSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "revoked", "unavailable"]).optional(),
});

// @ts-expect-error -- tsgo TS2589
adminRouter.patch("/servers/:id", zValidator("json", updateServerSchema), (c) => {
  const { id } = c.req.param();
  const updated = updateRuntimeServer(id, c.req.valid("json"));
  if (!updated) return c.json({ error: "Server not found" }, 404);
  if (updated.status !== "active") acpConnectionPool.disposeServer(id);
  return c.json({ server: updated });
});

adminRouter.delete("/servers/:id", (c) => {
  const { id } = c.req.param();
  try {
    const result = revokeOrDeleteRuntimeServer(id, c.req.query("physical") === "true");
    acpConnectionPool.disposeServer(id);
    if (!result.deleted && !result.server) return c.json({ error: "Server not found" }, 404);
    return c.json({ success: true, deleted: result.deleted, server: result.server });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to delete server" }, 400);
  }
});

export type AdminRouter = typeof adminRouter;
