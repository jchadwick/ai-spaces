import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe('registration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('returns invalid-config when token is missing', async () => {
    delete process.env.GATEWAY_TOKEN;

    const { tryRegisterWithServer } = await import('./registration.js');
    const result = await tryRegisterWithServer();

    expect(result.status).toBe('invalid-config');
    expect(result.state).toBeNull();
  });

  it('returns server-unreachable on fetch failure instead of throwing', async () => {
    process.env.GATEWAY_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { tryRegisterWithServer } = await import('./registration.js');
    const result = await tryRegisterWithServer();

    expect(result.status).toBe('server-unreachable');
    expect(result.state).toBeNull();
  });
});
