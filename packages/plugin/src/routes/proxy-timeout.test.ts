import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const requestMock = vi.fn();

vi.mock('http', () => ({
  default: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

describe('proxyRequest timeout/error resilience', () => {
  it('resolves when proxy request times out', async () => {
    const listeners: Record<string, (err: Error) => void> = {};
    requestMock.mockImplementationOnce((_opts: unknown, _cb: unknown) => ({
      on: (name: string, cb: (err: Error) => void) => { listeners[name] = cb; },
      setTimeout: (_ms: number, cb: () => void) => { globalThis.setTimeout(cb, 0); },
      destroy: (err: Error) => { listeners.error?.(err); },
      end: () => undefined,
    }));

    const { proxyRequest } = await import('./proxy.js');
    const req = { method: 'GET', headers: {}, url: '/x' } as unknown as IncomingMessage;
    const res = {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(function end(this: { writableEnded: boolean }) { this.writableEnded = true; }),
    } as unknown as ServerResponse;

    await expect(proxyRequest(req, res, 'http://127.0.0.1:5555/path')).resolves.toBe(true);
  });
});
