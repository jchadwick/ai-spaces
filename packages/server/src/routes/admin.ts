import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_SERVER_ID } from "../db/constants.js";
import { type AuthVariables, authMiddleware } from "../middleware/auth.js";
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

const updateRoleSchema = z.object({ role: z.enum(["admin", "user"]) });

// @ts-expect-error -- tsgo TS2589
adminRouter.patch("/users/:id/role", zValidator("json", updateRoleSchema), (c) => {
  const { id } = c.req.param();
  const { role } = c.req.valid("json");
  const updated = updateUserServerRole(id, DEFAULT_SERVER_ID, role);
  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true });
});

export type AdminRouter = typeof adminRouter;
