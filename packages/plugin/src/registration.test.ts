import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe("registration", () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-spaces-registration-test-"));
    stateFile = path.join(tempDir, "ai-spaces-registration.json");
    process.env.AI_SPACES_PLUGIN_STATE_FILE = stateFile;
    process.env.AI_SPACES_URL = "http://ai-spaces.test";
    process.env.PLUGIN_URL = "http://openclaw.test";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns unpaired when state and registration token are missing", async () => {
    delete process.env.AI_SPACES_REGISTRATION_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { tryRegisterWithServer } = await import("./registration.js");
    const result = await tryRegisterWithServer();

    expect(result.status).toBe("unpaired");
    expect(result.state).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pairs with an explicit registration token and persists local callback state", async () => {
    process.env.AI_SPACES_REGISTRATION_TOKEN = "one-time-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 201,
        ok: true,
        json: async () => ({
          serverId: "server-1",
          callbackToken: "raw-callback-token",
          gatewayUrl: "http://gateway.test",
          acpBaseUrl: "http://openclaw.test",
        }),
      })),
    );

    const { tryRegisterWithServer } = await import("./registration.js");
    const result = await tryRegisterWithServer();

    expect(result.status).toBe("registered");
    expect(result.state).toEqual(
      expect.objectContaining({
        serverId: "server-1",
        callbackToken: "raw-callback-token",
        aiSpacesUrl: "http://ai-spaces.test",
        pluginUrl: "http://openclaw.test",
        acpBaseUrl: "http://openclaw.test",
        gatewayUrl: "http://gateway.test",
        runtimeType: "openclaw",
      }),
    );
    expect(JSON.parse(fs.readFileSync(stateFile, "utf-8"))).toEqual(
      expect.objectContaining({
        serverId: "server-1",
        callbackToken: "raw-callback-token",
        runtimeType: "openclaw",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://ai-spaces.test/api/internal/register",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"registrationToken":"one-time-token"'),
      }),
    );
  });

  it("reuses persisted state and does not re-register even when a token is present", async () => {
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        serverId: "server-1",
        callbackToken: "raw-callback-token",
        aiSpacesUrl: "http://ai-spaces.test",
        pluginUrl: "http://openclaw.test",
        acpBaseUrl: "http://openclaw.test",
        runtimeType: "openclaw",
        registeredAt: "2026-06-08T00:00:00.000Z",
      }),
      "utf-8",
    );
    process.env.AI_SPACES_REGISTRATION_TOKEN = "fresh-token";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { tryRegisterWithServer } = await import("./registration.js");
    const result = await tryRegisterWithServer();

    expect(result.status).toBe("registered");
    expect(result.state?.serverId).toBe("server-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns server-unreachable on fetch failure instead of throwing", async () => {
    process.env.AI_SPACES_REGISTRATION_TOKEN = "one-time-token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { tryRegisterWithServer } = await import("./registration.js");
    const result = await tryRegisterWithServer();

    expect(result.status).toBe("server-unreachable");
    expect(result.state).toBeNull();
  });

  it("returns auth-failed on rejected pairing token", async () => {
    process.env.AI_SPACES_REGISTRATION_TOKEN = "bad-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 401,
        ok: false,
        text: async () => "unauthorized",
      })),
    );

    const { tryRegisterWithServer } = await import("./registration.js");
    const result = await tryRegisterWithServer();

    expect(result.status).toBe("auth-failed");
    expect(result.state).toBeNull();
  });

  it("classifies callback auth failures for stale and revoked states", async () => {
    const { classifyCallbackResponse } = await import("./registration.js");

    expect(classifyCallbackResponse(401)).toBe("stale-callback-token");
    expect(classifyCallbackResponse(403)).toBe("stale-callback-token");
    expect(classifyCallbackResponse(404)).toBe("revoked");
    expect(classifyCallbackResponse(410)).toBe("revoked");
    expect(classifyCallbackResponse(500)).toBeNull();
  });
});
