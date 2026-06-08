import * as crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/connection.js";
import { confirmationNonces, inviteTokens, notifications } from "../db/index.js";
import type { AuthVariables } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { authenticateRuntimeCallback, getRuntimeAuthFromRequest } from "../runtime-servers.js";
import { getSpace } from "../space-store.js";

export const confirmRouter = new Hono<{ Variables: AuthVariables }>();

// Internal-only nonce issuance
const issueNonceSchema = z.object({
  serverId: z.string().min(1).optional(),
  callbackToken: z.string().min(1).optional(),
  spaceId: z.string().min(1),
  issuingUserId: z.string().min(1),
  action: z.string().min(1),
  params: z.unknown(),
});

confirmRouter.post(
  "/internal/confirm/issue",
  // @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
  zValidator("json", issueNonceSchema),
  async (c) => {
    const { spaceId, issuingUserId, action, params, serverId, callbackToken } = c.req.valid("json");
    const headerAuth = getRuntimeAuthFromRequest(c);
    const runtimeServer = authenticateRuntimeCallback(
      serverId ?? headerAuth.serverId,
      callbackToken ?? headerAuth.callbackToken,
    );
    if (!runtimeServer) return c.json({ error: "Unauthorized" }, 401);

    const space = getSpace(spaceId);
    if (!space || space.serverId !== runtimeServer.id) {
      return c.json({ error: "Space not found" }, 404);
    }

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + config.CONFIRMATION_NONCE_TTL_MS).toISOString();

    db.insert(confirmationNonces)
      .values({
        id,
        spaceId,
        issuingUserId,
        action,
        payload: JSON.stringify({ action, params, spaceId, issuingUserId }),
        expiresAt,
        redeemedAt: null,
      })
      .run();

    return c.json({ nonceId: id, expiresAt });
  },
);

// Authenticated nonce redemption
const redeemNonceSchema = z.object({
  nonceId: z.string().min(1),
});

confirmRouter.post(
  "/confirm/redeem",
  authMiddleware,
  // @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
  zValidator("json", redeemNonceSchema),
  async (c) => {
    const user = c.get("user");
    const { nonceId } = c.req.valid("json");
    const now = new Date().toISOString();

    // Atomic redeem — same user who issued it
    const result = db.run(
      sql`UPDATE confirmation_nonces SET redeemed_at = ${now}
          WHERE id = ${nonceId} AND issuing_user_id = ${user.userId}
          AND redeemed_at IS NULL AND expires_at > ${now}`,
    );
    if ((result as { changes: number }).changes !== 1) {
      return c.json({ error: "Nonce invalid, expired, or already redeemed" }, 400);
    }

    // Fetch the nonce to get its payload
    const nonce = db
      .select()
      .from(confirmationNonces)
      .where(eq(confirmationNonces.id, nonceId))
      .get();
    if (!nonce) return c.json({ error: "Nonce not found" }, 404);

    let payload: { action: string; params: unknown; spaceId: string; issuingUserId: string };
    try {
      payload = JSON.parse(nonce.payload) as typeof payload;
    } catch {
      return c.json({ error: "Invalid nonce payload" }, 500);
    }

    const ACTION_HANDLERS: Record<string, (params: unknown) => Promise<unknown>> = {
      "space.member.invite": async (params) => {
        const p = params as { spaceId: string; role: string; recipientUserId?: string };
        const space = getSpace(p.spaceId);
        if (!space) throw new Error("Space not found");

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const inviteId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        db.insert(inviteTokens)
          .values({
            id: inviteId,
            spaceId: p.spaceId,
            tokenHash,
            role: p.role,
            recipientUserId: p.recipientUserId ?? null,
            expiresAt,
            consumedAt: null,
          })
          .run();

        const notificationId = crypto.randomUUID();
        db.insert(notifications)
          .values({
            id: notificationId,
            type: "invite",
            recipientUserId: p.recipientUserId ?? null,
            spaceId: p.spaceId,
            role: p.role,
            inviteId,
            read: "false",
          })
          .run();

        const inviteUrl = `${config.BASE_URL}/invite#token=${rawToken}`;
        process.stderr.write(`\n[INVITE] Invite URL (deliver out-of-band):\n  ${inviteUrl}\n\n`);
        return { inviteId, inviteUrl };
      },

      "space.member.remove": async (params) => {
        const p = params as { spaceId: string; userId: string };
        const removeResult = db.run(
          sql`DELETE FROM space_members
              WHERE space_id = ${p.spaceId} AND user_id = ${p.userId}
              AND ((SELECT role FROM space_members WHERE space_id = ${p.spaceId} AND user_id = ${p.userId}) != 'admin'
                OR (SELECT COUNT(*) FROM space_members WHERE space_id = ${p.spaceId} AND role = 'admin') > 1)`,
        );
        if ((removeResult as { changes: number }).changes === 0) {
          throw new Error("Cannot remove the last admin");
        }
        return { success: true };
      },
    };

    const handler = ACTION_HANDLERS[payload.action];
    if (!handler) return c.json({ error: "Unknown action" }, 400);

    try {
      const actionResult = await handler(payload.params);
      return c.json({ success: true, result: actionResult });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Action failed" }, 500);
    }
  },
);

export type ConfirmRouter = typeof confirmRouter;
