import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

const watchMock = vi.fn();
vi.mock("chokidar", () => ({
  default: { watch: (...args: unknown[]) => watchMock(...args) },
}));

const readFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();
const readdirSyncMock = vi.fn();
vi.mock("fs", () => ({
  readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
  readdirSync: (...args: unknown[]) => readdirSyncMock(...args),
}));

vi.mock("@ai-spaces/shared", () => ({
  computeSpaceId: () => "space-1",
  SpaceConfigSchema: {
    safeParse: () => ({ success: true, data: { name: "space" } }),
  },
}));

describe("SpaceWatcher resilience", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("start does not throw when chokidar.watch throws", async () => {
    existsSyncMock.mockReturnValue(true);
    watchMock.mockImplementation(() => {
      throw new Error("watch fail");
    });

    const { SpaceWatcher } = await import("./space-watcher.js");
    const watcher = new SpaceWatcher("/tmp/workspace", "main");

    expect(() => watcher.start()).not.toThrow();
  });

  it("listener throw does not crash watcher event flow", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ name: "ok" }));
    readdirSyncMock.mockReturnValue([]);

    const handlers: Record<string, (filePath: string) => void> = {};
    watchMock.mockReturnValue({
      on: (event: string, handler: (filePath: string) => void) => {
        handlers[event] = handler;
      },
      close: async () => undefined,
    });

    const { SpaceWatcher } = await import("./space-watcher.js");
    const watcher = new SpaceWatcher("/tmp/workspace", "main");
    watcher.on("space:added", () => {
      throw new Error("listener fail");
    });

    watcher.start();

    existsSyncMock.mockReturnValue(true);
    expect(() => handlers.add("/tmp/workspace/project/.space/spaces.json")).not.toThrow();
  });

  it("stop does not throw when watcher close rejects", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock.mockReturnValue([]);

    watchMock.mockReturnValue({
      on: vi.fn(),
      close: async () => {
        throw new Error("close failed");
      },
    });

    const { SpaceWatcher } = await import("./space-watcher.js");
    const watcher = new SpaceWatcher("/tmp/workspace", "main");
    watcher.start();

    expect(() => watcher.stop()).not.toThrow();
  });
});
