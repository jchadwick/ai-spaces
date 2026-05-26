import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { proxyRequest } from './proxy.js';

function createResponse(): ServerResponse {
  return {
    writableEnded: false,
    destroyed: false,
    headersSent: false,
    statusCode: 200,
    setHeader() { /* noop */ },
    end() { this.writableEnded = true; },
  } as unknown as ServerResponse;
}

describe('proxyRequest resilience', () => {
  it('does not throw on invalid target URL', async () => {
    const req = { method: 'GET', headers: {}, url: '/x' } as unknown as IncomingMessage;
    const res = createResponse();

    await expect(proxyRequest(req, res, '::bad-url')).resolves.toBe(true);
  });

  it('does not throw when response is already ended', async () => {
    const req = { method: 'GET', headers: {}, url: '/x' } as unknown as IncomingMessage;
    const res = createResponse();
    (res as unknown as { writableEnded: boolean }).writableEnded = true;

    await expect(proxyRequest(req, res, 'http://127.0.0.1:1/nope')).resolves.toBe(true);
  });
});
