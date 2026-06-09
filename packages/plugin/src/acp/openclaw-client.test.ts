import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("../config.js", () => ({
  config: {
    OPENCLAW_HOME: "/tmp/test-openclaw",
  },
}));

describe("OpenClawAcpClient prompt forwarding", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("cancelPrompt is safe for unknown session", async () => {
    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();
    expect(() => client.cancelPrompt("missing-space")).not.toThrow();
  });

  it("throws when openclaw acp subprocess fails to spawn", async () => {
    const { EventEmitter } = await import("node:events");
    const mockProc = Object.assign(new EventEmitter(), {
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn(), off: vi.fn() },
      kill: vi.fn(),
    });

    vi.doMock("node:child_process", () => ({
      spawn: vi.fn(() => {
        // Emit error immediately to simulate spawn failure
        setImmediate(() => mockProc.emit("error", new Error("spawn openclaw ENOENT")));
        return mockProc;
      }),
    }));

    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();

    await expect(
      client.getOrCreateSession("space-1:/", "space-1", "/tmp/workspace"),
    ).rejects.toThrow();
  });
});
