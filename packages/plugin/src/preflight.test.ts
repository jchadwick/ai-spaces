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

describe('preflight', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('returns warnings instead of throwing when config/server unavailable', async () => {
    process.env.OPENCLAW_HOME = '/tmp/definitely-missing-openclaw-home';
    process.env.AI_SPACES_URL = 'http://127.0.0.1:1';

    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    const { runPluginPreflightChecks } = await import('./preflight.js');
    const result = await runPluginPreflightChecks([{ agentId: 'main', workspaceRoot: '/tmp/missing-workspace' }]);

    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
