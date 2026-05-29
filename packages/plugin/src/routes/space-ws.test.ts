import { beforeEach, describe, expect, it, vi } from 'vitest';

const listenMock = vi.fn();
const onMock = vi.fn();

vi.mock('http', () => ({
  createServer: vi.fn(() => ({
    on: onMock,
    listen: listenMock,
  })),
}));

vi.mock('../logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock('../space-store.js', () => ({
  listSpaces: vi.fn(() => []),
  initSpaceStore: vi.fn(),
}));

vi.mock('../registration.js', () => ({
  registerWithServer: vi.fn(async () => null),
}));

vi.mock('./acp-ws.js', () => ({
  createAcpWsServer: vi.fn(() => ({})),
  handleAcpUpgrade: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    OPENCLAW_HOME: '/tmp/openclaw',
    AI_SPACES_URL: 'http://127.0.0.1:3001',
    AI_SPACES_WS_HOST: '0.0.0.0',
    GATEWAY_TOKEN: 'secret',
  },
}));

describe('space-ws listen host', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('binds spaces server on configured non-loopback host', async () => {
    const { startSpacesServer } = await import('./space-ws.js');
    startSpacesServer(3002);

    expect(listenMock).toHaveBeenCalledWith(3002, '0.0.0.0', expect.any(Function));
  });
});
