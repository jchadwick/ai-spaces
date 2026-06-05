import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type CancelNotification,
  type InitializeRequest,
  type NewSessionRequest,
  type PromptRequest,
} from "@agentclientprotocol/sdk";
import { expect, test } from "@playwright/test";
import { WebSocketServer, type WebSocket } from "ws";
import { API_BASE } from "./helpers/constants.js";
import { createOwnedSpace } from "./helpers/spaces.js";

async function ensureUser(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@ai-spaces.test",
      password: "ai-spaces",
      displayName: "E2E Admin",
    }),
  });
}

function wsToAcpStream(ws: WebSocket): {
  output: WritableStream<Uint8Array>;
  input: ReadableStream<Uint8Array>;
} {
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        ws.send(chunk, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  });

  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      ws.on("message", (data) => {
        if (closed) return;
        if (typeof data === "string") {
          streamController.enqueue(new TextEncoder().encode(data));
        } else if (data instanceof ArrayBuffer) {
          streamController.enqueue(new Uint8Array(data));
        } else if (Array.isArray(data)) {
          streamController.enqueue(Buffer.concat(data));
        } else {
          streamController.enqueue(data);
        }
      });
      ws.on("close", () => {
        closed = true;
        try {
          streamController.close();
        } catch {
          /* already closed */
        }
      });
      ws.on("error", (error) => {
        closed = true;
        streamController.error(error);
      });
    },
  });

  return { output, input };
}

class EchoAgent implements Agent {
  constructor(private readonly connection: AgentSideConnection) {}

  async initialize(_params: InitializeRequest) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false },
      authMethods: [],
    };
  }

  async newSession(_params: NewSessionRequest) {
    return { sessionId: crypto.randomUUID() };
  }

  async authenticate() {
    return {};
  }

  async prompt(params: PromptRequest) {
    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello from test agent" },
      },
    });
    return { stopReason: "end_turn" as const };
  }

  async cancel(_params: CancelNotification) {
    return;
  }

  async extMethod(method: string, params: Record<string, unknown>) {
    if (method === "workspace/get_metadata") {
      return { files: {} };
    }

    if (method === "workspace/list_files") {
      return {
        files: [
          {
            name: "README.md",
            path: "README.md",
            type: "file",
            size: 40,
            modifiedAt: new Date().toISOString(),
          },
        ],
      };
    }

    if (method === "workspace/read_file") {
      return { content: "# E2E Space\nUsed by automated tests.\n", contentType: "text/markdown" };
    }

    if (method === "workspace/resolve_path") {
      const requestedPath = typeof params.path === "string" ? params.path : "";
      const isRoot = requestedPath.length === 0;
      return {
        requestedPath,
        canonicalRelativePath: requestedPath,
        targetType: isRoot ? "directory" : "file",
        exists: true,
        contained: true,
        hidden: false,
        symlinkEscaped: false,
        size: isRoot ? undefined : 40,
        contentType: isRoot ? undefined : "text/markdown",
      };
    }

    return {};
  }
}

async function startAcpTestServer(): Promise<{
  pluginUrl: string;
  close: () => Promise<void>;
}> {
  const wss = new WebSocketServer({ port: 0 });
  const clients = new Set<WebSocket>();
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  const address = wss.address();
  if (!address || typeof address === "string") throw new Error("Failed to bind test ACP server");

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    const { output, input } = wsToAcpStream(ws);
    new AgentSideConnection((connection) => new EchoAgent(connection), ndJsonStream(output, input));
  });

  return {
    pluginUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of clients) client.terminate();
        wss.close(() => resolve());
      }),
  };
}

async function registerTestServer(
  request: import("@playwright/test").APIRequestContext,
  pluginUrl: string,
): Promise<{ id: string; callbackToken: string }> {
  const response = await request.post("/api/internal/register", {
    headers: {
      Authorization: "Bearer secret",
    },
    data: { pluginUrl, gatewayUrl: pluginUrl, name: "e2e-acp-test-server" },
  });
  if (!response.ok()) {
    throw new Error(`Server registration failed: ${response.status()} ${await response.text()}`);
  }
  const data = (await response.json()) as { serverId: string; callbackToken: string };
  return { id: data.serverId, callbackToken: data.callbackToken };
}

test.describe("Space WebSocket (dev stack)", () => {
  test("login, open space, WebSocket reaches connected", async ({ page, request }) => {
    await ensureUser();
    const acpServer = await startAcpTestServer();
    const registeredServer = await registerTestServer(request, acpServer.pluginUrl);
    const { id: spaceId } = await createOwnedSpace(request, registeredServer);

    test.info().annotations.push({ type: "acp-server", description: acpServer.pluginUrl });

    await page.goto("/login");
    try {
      await page.getByLabel("Email").fill("admin@ai-spaces.test");
      await page.getByLabel("Password").fill("ai-spaces");
      await page.getByRole("button", { name: "Sign In" }).click();

      await expect(page).toHaveURL(/\/spaces$/);

      const wsEvent = page.waitForEvent("websocket", {
        predicate: (ws) => ws.url().includes(`/ws/spaces/${spaceId}`),
      });

      await page.goto(`/space/${spaceId}`);

      await expect(page.getByText("Error Loading Space")).toHaveCount(0);
      await expect(page.getByText("Space Not Found")).toHaveCount(0);

      const ws = await wsEvent;
      expect(ws.url()).toMatch(/\/\/(?:127\.0\.0\.1|localhost):/);
      expect(ws.url()).toContain(`/ws/spaces/${spaceId}`);

      const status = page.getByTestId("chat-ws-status");
      await expect(status).toHaveAttribute("data-status", "connected", { timeout: 30_000 });

      await page.getByPlaceholder("Ask AI anything...").fill("Hello from Playwright");
      await page.locator('aside form button[type="submit"]').click();

      await expect(page.getByText("Hello from Playwright")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Hello from test agent")).toBeVisible({ timeout: 15_000 });
      await expect(status).toHaveAttribute("data-status", "connected", { timeout: 30_000 });
    } finally {
      await acpServer.close();
    }
  });
});
