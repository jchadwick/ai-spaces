import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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

  it("returns end_turn and relays response content", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello from gateway" } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();
    await client.getOrCreateSession("space-1:/", "space-1", "/tmp/workspace");

    const updates: unknown[] = [];
    const result = await client.forwardPrompt(
      "space-1",
      "space-1",
      { systemPrompt: "sys", userPrompt: "hi" },
      async (u) => {
        updates.push(u);
      },
    );

    expect(result).toBe("end_turn");
    expect(updates.length).toBe(1);
  });

  it("rejects when gateway responds non-OK", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "boom",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();
    await client.getOrCreateSession("space-2:/", "space-2", "/tmp/workspace");

    await expect(
      client.forwardPrompt(
        "space-2",
        "space-2",
        { systemPrompt: "sys", userPrompt: "hi" },
        async () => undefined,
      ),
    ).rejects.toThrow(/Gateway chat completion failed/);
  });

  it("cancelPrompt is safe for unknown session", async () => {
    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();
    expect(() => client.cancelPrompt("missing-space")).not.toThrow();
  });
});
