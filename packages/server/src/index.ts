import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { BrowserAcpOrchestrator } from "./acp/browser-orchestrator.js";
import { acpConnectionPool } from "./adapters/acp-connection-pool.js";
import { agentAdapter } from "./agent-adapter-instance.js";
import { assertProductionHttps, config } from "./config.js";
import { db } from "./db/connection.js";
import { DEFAULT_SERVER_ID } from "./db/constants.js";
import { servers, users } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { getUserSpaceRole, getUserWithServerRole } from "./db/queries.js";
import { logger as rootLogger } from "./logger.js";
import { runPreflightChecks } from "./preflight.js";
import { adminRouter } from "./routes/admin.js";
import { agentSetupRouter } from "./routes/agent-setup.js";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { confirmRouter } from "./routes/confirm.js";
import { identityRouter } from "./routes/identity.js";
import { internalRouter } from "./routes/internal.js";
import { invitesRouter } from "./routes/invites.js";
import { membersRouter } from "./routes/members.js";
import { pluginsRouter } from "./routes/plugins.js";
import { schemasRouter } from "./routes/schemas.js";
import { getSpaceById, spacesRouter } from "./routes/spaces.js";
import { getActiveRuntimeServerEndpoint, listRuntimeServers } from "./runtime-servers.js";
import { createUser, getUserWithServerRoleByEmail, hashPassword } from "./user-service.js";

type BuildInfo = {
  display: string;
  sha: string;
  branch: string;
  tag: string;
};

const log = rootLogger.child({ component: "server" });

function runGit(command: string): string {
  try {
    return execSync(command, {
      cwd: resolveRepoRoot(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function resolveRepoRoot(): string {
  if (process.env.AI_SPACES_REPO_DIR) return process.env.AI_SPACES_REPO_DIR;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "..", "..", "..");
}

function resolveBuildInfo(): BuildInfo {
  const tag = firstEnv("AI_SPACES_TAG", "GIT_TAG") || runGit("git describe --tags --exact-match");
  const sha =
    firstEnv("AI_SPACES_SHA", "GIT_SHA", "GIT_COMMIT", "SOURCE_VERSION") ||
    runGit("git rev-parse --short HEAD");
  const branch =
    firstEnv("AI_SPACES_BRANCH", "GIT_BRANCH", "BRANCH_NAME") ||
    runGit("git rev-parse --abbrev-ref HEAD");
  const envBuild = firstEnv("AI_SPACES_BUILD", "BUILD_VERSION");
  const packageVersion = process.env.npm_package_version?.trim() ?? "";

  const versionFallback = packageVersion ? `v${packageVersion}` : "unknown";
  const display = envBuild || tag || (sha && branch ? `${branch}-${sha}` : sha || versionFallback);

  return {
    display,
    sha,
    branch,
    tag,
  };
}

function injectBuildMetaTags(html: string, buildInfo: BuildInfo): string {
  const metaTags = [
    `<meta name="ai-spaces-build" content="${escapeHtmlAttribute(buildInfo.display)}">`,
    `<meta name="ai-spaces-sha" content="${escapeHtmlAttribute(buildInfo.sha)}">`,
    `<meta name="ai-spaces-branch" content="${escapeHtmlAttribute(buildInfo.branch)}">`,
    `<meta name="ai-spaces-tag" content="${escapeHtmlAttribute(buildInfo.tag)}">`,
  ].join("\n    ");
  const htmlWithoutBuildMeta = html.replace(
    /\s*<meta name="ai-spaces-(?:build|sha|branch|tag)" content="[^"]*"\s*\/?>/g,
    "",
  );
  return htmlWithoutBuildMeta.replace("</head>", `    ${metaTags}\n  </head>`);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const buildInfo = resolveBuildInfo();

assertProductionHttps(config.BASE_URL, "BASE_URL");

const app = new Hono();

// WS logger with token redaction
app.use(
  "*",
  honoLogger((str) => {
    const redacted = str.replace(/[?&]token=[^&\s]*/g, (m) =>
      m.replace(/token=[^&\s]*/, "token=[REDACTED]"),
    );
    log.info(redacted);
  }),
);

app.use(
  "/api/*",
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.use("/api/*", async (c, next) => {
  await next();
  c.res.headers.set("X-AI-Spaces-Build", buildInfo.display);
  c.res.headers.set("X-AI-Spaces-Sha", buildInfo.sha);
  c.res.headers.set("X-AI-Spaces-Branch", buildInfo.branch);
  c.res.headers.set("X-AI-Spaces-Tag", buildInfo.tag);
});

// CSP middleware for invite and login routes — register before static file serving
// Note: Hono's use() does not accept an array of paths; register each path separately
app.use("/invite*", async (c, next) => {
  await next();
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
});
app.use("/login*", async (c, next) => {
  await next();
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
});
app.use("/register*", async (c, next) => {
  await next();
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
});

app.route("/api/internal", internalRouter);

app.route("/api/agent-setup", agentSetupRouter);
app.route("/api/plugins", pluginsRouter);
app.route("/api/schemas", schemasRouter);
app.route("/plugins", pluginsRouter);
app.route("/schemas", schemasRouter);

app.get("/health", async (c) => {
  const _startedAt = Date.now();

  // Check DB
  let dbStatus: "ok" | "error" = "ok";
  try {
    db.run("SELECT 1");
  } catch {
    dbStatus = "error";
  }

  const runtimeServers = listRuntimeServers().filter(
    (server) => server.id !== DEFAULT_SERVER_ID && server.status === "active" && server.endpointUrl,
  );
  const healthChecks = await Promise.all(
    runtimeServers.map(async (server) => {
      try {
        const res = await fetch(`${server.endpointUrl}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        return { serverId: server.id, status: res.ok ? "ok" : "unreachable" };
      } catch {
        return { serverId: server.id, status: "unreachable" };
      }
    }),
  );
  const pluginStatus: "ok" | "unreachable" | "unknown" =
    healthChecks.length === 0
      ? "unknown"
      : healthChecks.every((check) => check.status === "ok")
        ? "ok"
        : "unreachable";

  const circuitBreaker = agentAdapter.getCircuitStatus().toLowerCase() as
    | "closed"
    | "open"
    | "half_open";
  const degraded = dbStatus !== "ok" || pluginStatus === "unreachable" || circuitBreaker === "open";

  return c.json(
    {
      status: degraded ? "degraded" : "ok",
      db: dbStatus,
      plugin: pluginStatus,
      servers: healthChecks,
      circuitBreaker,
      uptime: Math.floor(process.uptime()),
    },
    degraded ? 503 : 200,
  );
});

app.route("/api/auth", authRouter);
app.route("/api/admin", adminRouter);
app.route("/api/spaces", spacesRouter);
app.route("/api/spaces", membersRouter);
app.route("/api/spaces", identityRouter);
app.route("/api/audit", auditRouter);
app.route("/api/invites", invitesRouter);
app.route("/api", confirmRouter);

if (fs.existsSync(config.WEB_DIST)) {
  app.use("*", async (c, next) => {
    if (
      c.req.path === "/agent-setup" ||
      c.req.path.startsWith("/agent-setup/") ||
      c.req.path.startsWith("/api/") ||
      c.req.path.startsWith("/ws/") ||
      c.req.path.startsWith("/plugins/") ||
      c.req.path.startsWith("/schemas/")
    ) {
      return next();
    }
    const filePath = path.join(config.WEB_DIST, c.req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath, "utf-8");
      const responseContent = filePath.endsWith(".html")
        ? injectBuildMetaTags(content, buildInfo)
        : content;
      const isAsset = c.req.path.startsWith("/assets/");
      return c.text(responseContent, 200, {
        "Content-Type": getContentType(filePath),
        "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
      });
    }

    if (c.req.path.startsWith("/assets/")) {
      return c.text("Not found", 404, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
    }

    const indexContent = fs.readFileSync(path.join(config.WEB_DIST, "index.html"), "utf-8");
    return c.text(injectBuildMetaTags(indexContent, buildInfo), 200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
  });
  log.info({ dir: config.WEB_DIST }, "Serving static files");
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
  };
  return types[ext] || "text/plain";
}

await runPreflightChecks();
runMigrations();

db.insert(servers)
  .values({
    id: DEFAULT_SERVER_ID,
    name: "God Server",
    createdAt: new Date().toISOString(),
  })
  .onConflictDoNothing()
  .run();

async function bootstrapAdminIfNeeded(): Promise<void> {
  const email = config.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = config.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = getUserWithServerRoleByEmail(email);
  if (existing) return;

  const existingAnyUser = db.select({ id: users.id }).from(users).limit(1).get();
  if (existingAnyUser) return;

  const passwordHash = await hashPassword(password);
  createUser(email, passwordHash, "admin");
  log.info({ email }, "Bootstrapped initial admin user");
}

await bootstrapAdminIfNeeded();

function rawDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(String(data), "utf8");
}

const wss = new WebSocketServer({ noServer: true });

wss.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const pathMatch = url.pathname.match(/^\/ws\/spaces\/([^/]+)$/);

  const wsLog = log.child({ component: "ws-upgrade" });
  wsLog.info(
    {
      url: request.url,
      host: request.headers.host,
      origin: request.headers.origin,
      hasAuth: !!request.headers.authorization,
      hasToken: url.searchParams.has("token"),
    },
    "WS upgrade",
  );

  if (!pathMatch) {
    wsLog.warn({ url: request.url }, "No path match, destroying");
    socket.destroy();
    return;
  }

  const spaceId = pathMatch[1];

  const serverSpace = getSpaceById(spaceId);
  if (!serverSpace) {
    wsLog.warn({ spaceId }, "Space not found");
    socket.destroy();
    return;
  }

  let userId: string;
  let rawToken: string | null = null;

  // In non-production dev mode with DEV_VIRTUAL_USER, bypass JWT validation
  if (process.env.NODE_ENV !== "production" && process.env.DEV_VIRTUAL_USER === "true") {
    userId = "dev-user-00000000-0000-0000-0000-000000000000";
    wsLog.info({ userId, spaceId }, "WS auth via DEV_VIRTUAL_USER");
  } else {
    // Require JWT — check Authorization header first, then ?token= query param
    const authHeader = request.headers.authorization;
    rawToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : url.searchParams.get("token");

    if (!rawToken) {
      wsLog.warn("No token, closing 1008");
      wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, "Authentication required"));
      return;
    }

    try {
      const decoded = jwt.verify(rawToken, config.JWT_SECRET) as jwt.JwtPayload;
      if (!decoded.userId) throw new Error("Missing userId");
      userId = decoded.userId as string;
      if (!getUserWithServerRole(userId)) throw new Error("User no longer exists");
      wsLog.info(
        { userId, spaceId, tokenSource: authHeader?.startsWith("Bearer ") ? "header" : "query" },
        "WS auth ok",
      );
    } catch (err) {
      wsLog.warn({ err: (err as Error).message }, "Invalid token");
      wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, "Invalid token"));
      return;
    }
  }

  // Resolve the user's actual SpaceRole from the DB (admin → 'owner' handled here)
  const spaceRole = getUserSpaceRole(userId, spaceId);
  if (!spaceRole) {
    wsLog.warn({ userId, spaceId }, "No space access");
    wss.handleUpgrade(request, socket, head, (ws) => ws.close(1008, "Forbidden"));
    return;
  }

  let runtimeEndpointUrl: string;
  try {
    runtimeEndpointUrl = getActiveRuntimeServerEndpoint(serverSpace.serverId);
  } catch (err) {
    wsLog.warn({ spaceId, err: (err as Error).message }, "Runtime server unavailable for space");
    wss.handleUpgrade(request, socket, head, (ws) =>
      ws.close(1011, "Runtime server unavailable for this space"),
    );
    return;
  }
  const pluginWsUrl = `${runtimeEndpointUrl.replace(/^http/, "ws")}/api/spaces/${serverSpace.runtimeSpaceId}/acp`;
  wsLog.info(
    { userId, spaceId, runtimeSpaceId: serverSpace.runtimeSpaceId, pluginWsUrl },
    "Connecting gateway websocket",
  );

  // Mint a forwarding token with the resolved SpaceRole so the plugin gets the correct role
  const forwardToken = jwt.sign({ userId, role: spaceRole }, config.JWT_SECRET, {
    expiresIn: "1h",
  });

  const gatewayWs = new WebSocket(pluginWsUrl, {
    headers: {
      Authorization: `Bearer ${forwardToken}`,
    },
  });

  let clientWs: WebSocket | null = null;
  const orchestrator = new BrowserAcpOrchestrator(serverSpace, spaceRole);
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

  gatewayWs.on("open", () => {
    wsLog.info({ userId, spaceId }, "Gateway websocket open");
    flushToGateway();
  });

  gatewayWs.on("message", (data, isBinary) => {
    try {
      orchestrator.observeGatewayChunk(rawDataToBuffer(data));
    } catch (err) {
      wsLog.warn({ err: (err as Error).message }, "Could not inspect gateway ACP packet");
    }
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    } else {
      pendingToClient.push(rawDataToBuffer(data));
    }
  });

  gatewayWs.on("error", (err) => {
    wsLog.error({ userId, spaceId, err: err.message }, "Gateway websocket error");
    log.error({ err: err.message }, "Gateway WebSocket error");
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "Gateway error");
    }
  });

  gatewayWs.on("close", (code, reason) => {
    wsLog.info({ userId, spaceId, code, reason: reason.toString() }, "Gateway websocket close");
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, "Gateway closed");
    }
  });

  wss.handleUpgrade(request, socket, head, (ws) => {
    clientWs = ws;
    wsLog.info({ userId, spaceId }, "Client websocket upgraded");
    flushToClient();

    ws.on("message", async (data) => {
      try {
        const filtered = await orchestrator.filterClientChunk(rawDataToBuffer(data));
        if (filtered.response) ws.send(filtered.response);
        if (!filtered.forward) return;
        if (gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.send(filtered.forward);
        } else {
          pendingToGateway.push(filtered.forward);
        }
      } catch (err) {
        wsLog.warn({ err: (err as Error).message }, "Rejected browser ACP packet");
        ws.send(
          Buffer.from(
            `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32602, message: (err as Error).message } })}\n`,
          ),
        );
      }
    });

    ws.on("close", (code, reason) => {
      wsLog.info({ userId, spaceId, code, reason: reason.toString() }, "Client websocket close");
      gatewayWs.close();
    });

    ws.on("error", (err) => {
      log.error({ err: err.message }, "Browser WebSocket error");
      gatewayWs.close();
    });
  });
});

const server = serve({
  fetch: app.fetch,
  port: config.AI_SPACES_PORT,
  hostname: "0.0.0.0",
  overrideGlobalObjects: false,
});

server.on("upgrade", (request, socket, head) => {
  wss.emit("upgrade", request, socket, head);
});

log.info({ port: config.AI_SPACES_PORT }, "Server started");

const shutdown = () => {
  acpConnectionPool.disposeAll();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
