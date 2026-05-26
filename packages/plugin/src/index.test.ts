import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('openclaw/plugin-sdk/core', () => ({
  defineChannelPluginEntry: (entry: unknown) => entry,
}));

vi.mock('./channel.js', () => ({ aiSpacesPlugin: {} }));
vi.mock('./runtime.js', () => ({ setRuntime: vi.fn() }));

const startSpacesServerMock = vi.fn();
vi.mock('./routes/space-ws.js', () => ({ startSpacesServer: (...args: unknown[]) => startSpacesServerMock(...args) }));

const preflightMock = vi.fn(async () => ({ ok: true, warnings: [] }));
vi.mock('./preflight.js', () => ({ runPluginPreflightChecks: (...args: unknown[]) => preflightMock(...args) }));

const registerWithServerMock = vi.fn(async () => null);
const clearRegistrationStateMock = vi.fn();
const loadRegistrationStateMock = vi.fn(() => null);
vi.mock('./registration.js', () => ({
  registerWithServer: (...args: unknown[]) => registerWithServerMock(...args),
  clearRegistrationState: (...args: unknown[]) => clearRegistrationStateMock(...args),
  loadRegistrationState: (...args: unknown[]) => loadRegistrationStateMock(...args),
}));

const initSpaceStoreMock = vi.fn();
const listSpacesMock = vi.fn(() => []);
vi.mock('./space-store.js', () => ({
  initSpaceStore: (...args: unknown[]) => initSpaceStoreMock(...args),
  listSpaces: (...args: unknown[]) => listSpacesMock(...args),
}));

const proxyRequestMock = vi.fn(async () => true);
vi.mock('./routes/proxy.js', () => ({ proxyRequest: (...args: unknown[]) => proxyRequestMock(...args) }));

vi.mock('./cleanup.js', () => ({ cleanOrphanedFiles: vi.fn() }));

class MockSpaceWatcher {
  on = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
vi.mock('./space-watcher.js', () => ({ SpaceWatcher: MockSpaceWatcher }));

vi.mock('./logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

function createFakeApi() {
  const routes: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean> }> = [];
  return {
    config: {
      agents: {
        list: [{ id: 'main', workspace: '/tmp/workspace' }],
      },
    },
    registerHttpRoute: vi.fn((route: { path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean> }) => {
      routes.push(route);
    }),
    registerCli: vi.fn(),
    routes,
  };
}

describe('index registerFull resilience', () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input ?? '');
      if (url.includes('/api/internal/reconcile')) {
        return { ok: false, status: 401 } as Response;
      }
      return { ok: true, status: 200 } as Response;
    }));
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.stubGlobal('setInterval', vi.fn(() => 1 as unknown as NodeJS.Timeout));
    vi.stubGlobal('clearInterval', vi.fn());
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registerFull resolves even when startup dependencies fail', async () => {
    startSpacesServerMock.mockImplementationOnce(() => { throw new Error('port in use'); });
    preflightMock.mockImplementationOnce(async () => { throw new Error('preflight fail'); });
    registerWithServerMock.mockImplementationOnce(async () => { throw new Error('registration fail'); });

    const plugin = (await import('./index.js')).default as { registerFull: (api: unknown) => Promise<void> };
    const api = createFakeApi();

    await expect(plugin.registerFull(api)).resolves.toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('spaces route returns 400 for malformed request URL', async () => {
    const plugin = (await import('./index.js')).default as { registerFull: (api: ReturnType<typeof createFakeApi>) => Promise<void> };
    const api = createFakeApi();
    await plugin.registerFull(api);

    const spacesRoute = api.routes.find(r => r.path === '/api/spaces');
    expect(spacesRoute).toBeTruthy();

    const req = { url: 'http://[::1', method: 'GET', headers: {} } as unknown as IncomingMessage;
    const res = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      setHeader(key: string, value: string) { this.headers[key] = value; },
      end: vi.fn(),
    } as unknown as ServerResponse;

    const handled = await spacesRoute!.handler(req, res);
    expect(handled).toBe(true);
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
    expect(proxyRequestMock).not.toHaveBeenCalled();
  });
});
