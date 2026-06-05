import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

const scanWorkspaceMock = vi.fn();

vi.mock("@ai-spaces/shared", () => ({
  scanWorkspace: (...args: unknown[]) => scanWorkspaceMock(...args),
}));

describe("space-store resilience", () => {
  beforeEach(() => {
    vi.resetModules();
    scanWorkspaceMock.mockReset();
  });

  it("returns partial results when one workspace scan throws", async () => {
    scanWorkspaceMock
      .mockImplementationOnce(() => {
        throw new Error("bad workspace");
      })
      .mockImplementationOnce(() => [{ id: "ok-1", agentId: "b", path: "p" }]);

    const { initSpaceStore, listSpaces } = await import("./space-store.js");
    initSpaceStore([
      { agentId: "a", workspaceRoot: "/tmp/a" },
      { agentId: "b", workspaceRoot: "/tmp/b" },
    ]);

    const spaces = listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.id).toBe("ok-1");
  });
});
