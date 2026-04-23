import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

const SERVER_URL = 'http://localhost:3001';
const EMAIL = 'admin@ai-spaces.test';
const PASSWORD = 'ai-spaces';

async function login(): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data.accessToken as string;
}

async function getFirstSpaceId(token: string): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spaces fetch failed: ${res.status}`);
  const data = await res.json();
  const spaces = data.spaces ?? [];
  if (spaces.length === 0) throw new Error('No spaces found');
  return spaces[0].id as string;
}

function connectWs(url: string, opts?: WebSocket.ClientOptions): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, opts);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('close', (code, reason) => reject(new Error(`Closed before open: ${code} ${reason}`)));
  });
}

function sendConnect(ws: WebSocket): void {
  ws.send(JSON.stringify({ type: 'req', id: 'connect-1', method: 'connect', params: {} }));
}

function waitForMessage(ws: WebSocket, predicate: (msg: unknown) => boolean, timeoutMs = 15_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), timeoutMs);
    ws.on('message', function handler(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {
        // ignore non-JSON
      }
    });
  });
}

function waitForClose(url: string, opts?: WebSocket.ClientOptions): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, opts);
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    ws.on('error', () => { /* close event will follow */ });
  });
}

test.describe('Server WebSocket chat (direct)', () => {
  let token: string;
  let spaceId: string;

  test.beforeAll(async () => {
    token = await login();
    spaceId = await getFirstSpaceId(token);
  });

  test('connect with valid JWT via ?token= query param → receives connected event', async () => {
    const ws = await connectWs(`ws://localhost:3001/ws/spaces/${spaceId}?token=${token}`);
    sendConnect(ws);
    const msg = await waitForMessage(ws, (m: any) => m?.type === 'event' && m?.event === 'connected');
    expect((msg as any).payload.spaceId).toBe(spaceId);
    ws.close();
  });

  test('connect with valid JWT via Authorization header → receives connected event', async () => {
    const ws = await connectWs(`ws://localhost:3001/ws/spaces/${spaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    sendConnect(ws);
    const msg = await waitForMessage(ws, (m: any) => m?.type === 'event' && m?.event === 'connected');
    expect((msg as any).payload.spaceId).toBe(spaceId);
    ws.close();
  });

  test('send chat.send after connected → receives stream_start and stream_end', async () => {
    const ws = await connectWs(`ws://localhost:3001/ws/spaces/${spaceId}?token=${token}`);
    sendConnect(ws);
    await waitForMessage(ws, (m: any) => m?.type === 'event' && m?.event === 'connected');

    ws.send(JSON.stringify({ type: 'req', id: 'test-chat-1', method: 'chat.send', params: { content: 'Hello from e2e' } }));

    await waitForMessage(ws, (m: any) => m?.type === 'event' && m?.event === 'stream_start');
    await waitForMessage(ws, (m: any) => m?.type === 'event' && m?.event === 'stream_end');
    ws.close();
  });

  test('connect with no token → rejected with code 1008', async () => {
    const { code } = await waitForClose(`ws://localhost:3001/ws/spaces/${spaceId}`);
    expect(code).toBe(1008);
  });

  test('connect with invalid token → rejected with code 1008', async () => {
    const { code } = await waitForClose(`ws://localhost:3001/ws/spaces/${spaceId}?token=not-a-valid-jwt`);
    expect(code).toBe(1008);
  });
});
