import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("../config.js", () => ({
  config: {
    OPENCLAW_HOME: "/tmp/test-openclaw",
    GATEWAY_URL: "http://127.0.0.1:19000",
  },
}));

describe("OpenClawAcpClient prompt forwarding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"pong"}}]}\n\ndata: [DONE]\n',
              ),
            );
            controller.close();
          },
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancelPrompt is safe for unknown session", async () => {
    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();
    expect(() => client.cancelPrompt("missing-space")).not.toThrow();
  });

  it("buildRoomSessionKey scopes by agent and room, not user", async () => {
    const { buildRoomSessionKey } = await import("./openclaw-client.js");
    expect(buildRoomSessionKey("travel", "vacations:Maine")).toBe(
      "ai-spaces:travel:vacations:Maine",
    );
  });

  it("forwards prompts with a shared room session key", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => JSON.stringify({ gateway: { auth: { token: "test-token" } } })),
    }));

    const { OpenClawAcpClient } = await import("./openclaw-client.js");
    const client = new OpenClawAcpClient();
    const chunks: string[] = [];
    const runtimeSessionKey = "vacations:Maine";

    const stopReason = await client.forwardPrompt(
      runtimeSessionKey,
      "vacations",
      "travel",
      { systemPrompt: "system", userPrompt: "Say pong" },
      async (update) => {
        const text = (update.update as { content?: { text?: string } }).content?.text ?? "";
        chunks.push(text);
      },
    );

    expect(stopReason).toBe("end_turn");
    expect(chunks.join("")).toBe("pong");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:19000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );

    const chatCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("/v1/chat/completions"),
    );
    expect(chatCall).toBeDefined();

    const body = JSON.parse(chatCall![1].body as string);
    expect(body.user).toBe("ai-spaces:travel:vacations:Maine");
    expect(body.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "Say pong" },
    ]);
  });
});
