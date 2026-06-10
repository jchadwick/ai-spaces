import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/core", () => ({
  defineChannelPluginEntry: (entry: unknown) => entry,
}));

vi.mock("./channel.js", () => ({ aiSpacesPlugin: {} }));
vi.mock("./runtime.js", () => ({ setRuntime: vi.fn() }));

const startSpacesServerMock = vi.fn();
vi.mock("./routes/space-ws.js", () => ({
  startSpacesServer: (...args: unknown[]) => startSpacesServerMock(...args),
}));

const preflightMock = vi.fn(async () => ({ ok: true, warnings: [] }));
vi.mock("./preflight.js", () => ({
  runPluginPreflightChecks: (...args: unknown[]) => preflightMock(...args),
}));

const tryRegisterWithServerMock = vi.fn(async () => ({ status: "unpaired", state: null }));
const clearCredentialsMock = vi.fn();
const loadCredentialsMock = vi.fn(() => []);
vi.mock("./registration.js", () => ({
  tryRegisterWithServer: (...args: unknown[]) => tryRegisterWithServerMock(...args),
  clearCredentials: (...args: unknown[]) => clearCredentialsMock(...args),
  loadCredentials: (...args: unknown[]) => loadCredentialsMock(...args),
  classifyCallbackResponse: (status: number) =>
    status === 401 || status === 403
      ? "stale-callback-token"
      : status === 404 || status === 410
        ? "revoked"
        : null,
}));

const initSpaceStoreMock = vi.fn();
const listSpacesMock = vi.fn(() => []);
vi.mock("./space-store.js", () => ({
  initSpaceStore: (...args: unknown[]) => initSpaceStoreMock(...args),
  listSpaces: (...args: unknown[]) => listSpacesMock(...args),
}));

const proxyRequestMock = vi.fn(async () => true);
vi.mock("./routes/proxy.js", () => ({
  proxyRequest: (...args: unknown[]) => proxyRequestMock(...args),
}));

vi.mock("./cleanup.js", () => ({ cleanOrphanedFiles: vi.fn() }));
vi.mock("./cli/invite.js", () => ({
  createInvite: vi.fn(async () => {
    throw new Error("invite failed");
  }),
}));

class MockSpaceWatcher {
  on = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
vi.mock("./space-watcher.js", () => ({ SpaceWatcher: MockSpaceWatcher }));

vi.mock("./logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

function createFakeApi() {
  const routes: Array<{
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  }> = [];
  let cliBuilder: ((args: { program: unknown }) => void) | null = null;
  return {
    config: {
      agents: {
        list: [{ id: "main", workspace: "/tmp/workspace" }],
      },
    },
    registerHttpRoute: vi.fn(
      (route: {
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
      }) => {
        routes.push(route);
      },
    ),
    registerCli: vi.fn((builder: (args: { program: unknown }) => void) => {
      cliBuilder = builder;
    }),
    routes,
    getCliBuilder: () => cliBuilder,
  };
}

class FakeCommand {
  constructor(
    private readonly actions: Map<string, (...args: unknown[]) => Promise<void>>,
    private readonly key: string,
  ) {}

  description() {
    return this;
  }
  option() {
    return this;
  }
  command(name: string) {
    const cmd = new FakeCommand(this.actions, name);
    return cmd;
  }
  action(handler: (...args: unknown[]) => Promise<void>) {
    this.actionHandler = handler;
    this.actions.set(this.key, handler);
    return this;
  }
}

function createFakeProgram() {
  const actions = new Map<string, (...args: unknown[]) => Promise<void>>();
  return {
    command(name: string) {
      return new FakeCommand(actions, name);
    },
    actions,
  };
}

describe("index registerFull resilience", () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input ?? "");
        if (url.includes("/api/internal/reconcile")) {
          return { ok: false, status: 401 } as Response;
        }
        return { ok: true, status: 200 } as Response;
      }),
    );
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1 as unknown as NodeJS.Timeout),
    );
    vi.stubGlobal("clearInterval", vi.fn());
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registerFull resolves even when startup dependencies fail", async () => {
    startSpacesServerMock.mockImplementationOnce(() => {
      throw new Error("port in use");
    });
    preflightMock.mockImplementationOnce(async () => {
      throw new Error("preflight fail");
    });
    tryRegisterWithServerMock.mockImplementationOnce(async () => {
      throw new Error("registration fail");
    });

    const plugin = (await import("./index.js")).default as {
      registerFull: (api: unknown) => Promise<void>;
    };
    const api = createFakeApi();

    await expect(plugin.registerFull(api)).resolves.toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("spaces route returns 400 for malformed request URL", async () => {
    const plugin = (await import("./index.js")).default as {
      registerFull: (api: ReturnType<typeof createFakeApi>) => Promise<void>;
    };
    const api = createFakeApi();
    await plugin.registerFull(api);

    const spacesRoute = api.routes.find((r) => r.path === "/api/spaces");
    expect(spacesRoute).toBeTruthy();

    const req = { url: "http://[::1", method: "GET", headers: {} } as unknown as IncomingMessage;
    const res = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this.headers[key] = value;
      },
      end: vi.fn(),
    } as unknown as ServerResponse;

    const handled = await spacesRoute!.handler(req, res);
    expect(handled).toBe(true);
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
    expect(proxyRequestMock).not.toHaveBeenCalled();
  });

  it("CLI action wrapper swallows dynamic import failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const plugin = (await import("./index.js")).default as {
      registerFull: (api: ReturnType<typeof createFakeApi>) => Promise<void>;
    };
    const api = createFakeApi();
    await plugin.registerFull(api);

    const builder = api.getCliBuilder();
    expect(builder).toBeTruthy();

    const fakeProgram = createFakeProgram();
    builder!({ program: fakeProgram });

    const inviteAction = fakeProgram.actions.get("invite <spaceId>");
    expect(inviteAction).toBeTruthy();

    await expect(inviteAction!("space-1", { json: true })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("route wrapper catches thrown proxy errors", async () => {
    proxyRequestMock.mockImplementationOnce(async () => {
      throw new Error("proxy failed");
    });
    const plugin = (await import("./index.js")).default as {
      registerFull: (api: ReturnType<typeof createFakeApi>) => Promise<void>;
    };
    const api = createFakeApi();
    await plugin.registerFull(api);

    const loginRoute = api.routes.find((r) => r.path === "/api/auth/login");
    expect(loginRoute).toBeTruthy();

    const req = {
      url: "/api/auth/login",
      method: "POST",
      headers: {},
    } as unknown as IncomingMessage;
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await expect(loginRoute!.handler(req, res)).resolves.toBe(true);
    expect((res as unknown as { statusCode: number }).statusCode).toBe(500);
  });
});

describe("triggerReconcile auth behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1 as unknown as NodeJS.Timeout),
    );
    vi.stubGlobal("clearInterval", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Authorization: Bearer header in reconcile request (not body fields)", async () => {
    const credential = { serverId: "srv-1", token: "jwt-abc" };
    tryRegisterWithServerMock.mockResolvedValueOnce({
      status: "registered",
      state: credential,
    });

    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        capturedInit = init;
        return { ok: true, status: 200 } as Response;
      }),
    );

    const plugin = (await import("./index.js")).default as {
      registerFull: (api: unknown) => Promise<void>;
    };
    const api = createFakeApi();
    await plugin.registerFull(api);

    // Allow the initial triggerReconcile to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(capturedInit).toBeDefined();
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer jwt-abc");

    // Body must NOT contain serverId or callbackToken
    const body = JSON.parse(capturedInit!.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("serverId");
    expect(body).not.toHaveProperty("callbackToken");
    expect(body).toHaveProperty("spaces");
  });

  it("clears credentials and enters degraded mode on 401 reconcile response", async () => {
    const credential = { serverId: "srv-1", token: "jwt-abc" };
    tryRegisterWithServerMock.mockResolvedValueOnce({
      status: "registered",
      state: credential,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 }) as Response),
    );

    const plugin = (await import("./index.js")).default as {
      registerFull: (api: unknown) => Promise<void>;
    };
    const api = createFakeApi();
    await plugin.registerFull(api);

    await new Promise((r) => setTimeout(r, 10));

    expect(clearCredentialsMock).toHaveBeenCalled();
  });
});
