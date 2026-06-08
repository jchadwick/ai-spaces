import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("falls back safely for invalid env values", async () => {
    process.env.AI_SPACES_URL = "not-a-url";
    process.env.AI_SPACES_WS_PORT = "99999";
    process.env.OPENCLAW_HOME = "relative/path";
    process.env.MAX_FILE_SIZE_MB = "nope";
    process.env.FILE_STREAM_THRESHOLD_MB = "-4";
    process.env.AI_SPACES_WS_HOST = "   ";

    const module = await import("./config.js");

    expect(module.config.AI_SPACES_URL).toBe("http://127.0.0.1:3001");
    expect(module.config.AI_SPACES_WS_PORT).toBe(3002);
    expect(module.config.OPENCLAW_HOME).toBe("/home/node");
    expect(module.config.MAX_FILE_SIZE_MB).toBe(10);
    expect(module.config.FILE_STREAM_THRESHOLD_MB).toBe(1);
    expect(module.config.AI_SPACES_WS_HOST).toBe("0.0.0.0");
    expect(module.configStatus.isDegraded).toBe(true);
    expect(module.diagnostics.invalid).toEqual(
      expect.arrayContaining([
        "AI_SPACES_URL",
        "AI_SPACES_WS_PORT",
        "OPENCLAW_HOME",
        "MAX_FILE_SIZE_MB",
        "FILE_STREAM_THRESHOLD_MB",
        "AI_SPACES_WS_HOST",
      ]),
    );
  });
});
