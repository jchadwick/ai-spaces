import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock('../space-store.js', () => ({
  getSpace: vi.fn(() => { throw new Error('boom'); }),
  resolveSpaceRoot: vi.fn(() => '/tmp'),
}));

vi.mock('../session-middleware.js', () => ({
  validateSession: vi.fn(() => null),
}));

vi.mock('../file-watcher.js', () => ({
  fileWatcher: {
    on: vi.fn(),
    watch: vi.fn(),
    unwatch: vi.fn(),
  },
}));

describe('acp-ws boundary hardening', () => {
  it('handleAcpUpgrade does not throw when dependencies throw', async () => {
    const { handleAcpUpgrade, createAcpWsServer } = await import('./acp-ws.js');

    const socket = {
      destroyed: false,
      write: vi.fn(),
      destroy: vi.fn(function destroy(this: { destroyed: boolean }) { this.destroyed = true; }),
    } as unknown as import('stream').Duplex;

    const req = { url: '/api/spaces/foo/acp', headers: {} } as import('http').IncomingMessage;
    const wss = createAcpWsServer();

    expect(() => handleAcpUpgrade(wss, req, socket, Buffer.alloc(0), 'space')).not.toThrow();
  });
});
