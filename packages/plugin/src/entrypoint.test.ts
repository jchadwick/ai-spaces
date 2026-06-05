import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/core", () => ({
  defineChannelPluginEntry: (entry: unknown) => entry,
  createChannelPluginBase: (base: unknown) => base,
}));

vi.mock("./logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

describe("plugin entrypoint import safety", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("imports entrypoint with malformed env without throwing", async () => {
    delete process.env.GATEWAY_TOKEN;
    process.env.AI_SPACES_URL = "::::";
    process.env.OPENCLAW_HOME = "relative/path";
    process.env.AI_SPACES_WS_PORT = "-1";

    await expect(import("./index.js")).resolves.toBeTruthy();
  });
});
