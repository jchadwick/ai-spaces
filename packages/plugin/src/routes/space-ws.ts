import * as fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as http from "node:http";
import * as path from "node:path";
import { config } from "../config.js";
import { logger as rootLogger } from "../logger.js";
import { registerWithServer } from "../registration.js";
import { initSpaceStore, listSpaces } from "../space-store.js";
import { createAcpWsServer, handleAcpUpgrade } from "./acp-ws.js";

const log = rootLogger.child({ component: "space-ws" });

function safeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    if (!res.headersSent) {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(body));
  } catch {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
}

function initSpaceStoreFromConfig(): void {
  const configPath = path.join(config.OPENCLAW_HOME, ".openclaw", "openclaw.json");
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const agentList: { id: string; workspace?: string }[] = raw?.agents?.list ?? [];
    const defaultWorkspace: string = raw?.agents?.defaults?.workspace ?? "";
    const agentWorkspaces = agentList.map((a) => ({
      agentId: a.id,
      workspaceRoot: a.workspace ?? defaultWorkspace,
    }));
    initSpaceStore(agentWorkspaces);
    log.info(
      { agents: agentWorkspaces.map((w) => w.agentId) },
      "Space store initialized from OpenClaw config",
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), configPath },
      "Could not initialize space store from config; continuing degraded",
    );
  }
}

/**
 * Starts a dedicated HTTP+WebSocket server for the plugin.
 * Handles the ACP WebSocket endpoint and basic HTTP endpoints.
 */
export function startSpacesServer(port: number): void {
  try {
    initSpaceStoreFromConfig();
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Space store init failed unexpectedly",
    );
  }

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    log.warn({ port }, "Invalid spaces server port; skipping server startup");
    return;
  }

  log.info({ port }, "Starting spaces server");
  const httpServer = http.createServer(async (_req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try {
      url = new URL(_req.url ?? "/", `http://localhost:${port}`);
    } catch {
      safeJson(res, 400, { error: "Invalid request URL" });
      return;
    }

    try {
      if (_req.method === "GET" && url.pathname === "/api/spaces") {
        const spaces = listSpaces();
        safeJson(res, 200, { spaces });
        return;
      }

      if (_req.method === "GET" && url.pathname === "/api/health") {
        safeJson(res, 200, { status: "ok" });
        return;
      }

      safeJson(res, 404, { error: "Not found" });
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Spaces server request failed",
      );
      safeJson(res, 500, { error: "Spaces server request failed" });
    }
  });

  httpServer.on("error", (err) => {
    log.warn({ err: err.message }, "WebSocket server error");
  });

  const acpWss = createAcpWsServer();

  httpServer.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }

    const acpMatch = url.pathname.match(/^\/api\/spaces\/([^/]+)\/acp$/);
    if (acpMatch) {
      try {
        handleAcpUpgrade(acpWss, req, socket, head, acpMatch[1]);
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "ACP upgrade failed");
        socket.destroy();
      }
      return;
    }

    socket.destroy();
  });

  try {
    httpServer.listen(port, config.AI_SPACES_WS_HOST, () => {
      log.info({ port, host: config.AI_SPACES_WS_HOST }, "WebSocket server listening");
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), port },
      "Could not listen on spaces server port",
    );
  }
}

export async function registerAndStartSpacesServer(port: number): Promise<void> {
  const registration = await registerWithServer();
  startSpacesServer(port);
  if (!registration) return;
  try {
    await fetch(`${config.AI_SPACES_URL}/api/internal/reconcile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spaces: listSpaces(),
        serverId: registration.serverId,
        callbackToken: registration.callbackToken,
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "Initial reconcile failed");
  }
}
