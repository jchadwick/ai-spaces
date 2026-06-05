import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { spacesRouter } from "./routes/spaces.js";

export const app = new Hono();

app.use("*", logger());

app.use(
  "/api/*",
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.route("/api/auth", authRouter);
app.route("/api/spaces", spacesRouter);
app.route("/api/audit", auditRouter);

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.onError((err, c) => {
  console.error("Server error:", err);

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  return c.json({ error: "Internal server error" }, 500);
});

export type App = typeof app;
