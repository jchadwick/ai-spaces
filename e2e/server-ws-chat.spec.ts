import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type SessionNotification } from '@agentclientprotocol/sdk';
import { API_BASE, API_PORT } from './helpers/constants.js';

const SERVER_URL = API_BASE;
const SERVER_WS_URL = `ws://localhost:${API_PORT}`;
const EMAIL = 'admin@ai-spaces.test';
const PASSWORD = 'ai-spaces';

async function ensureUser(): Promise<void> {
  await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, displayName: 'E2E Admin' }),
  });
}

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

async function ensureSpaceId(token: string): Promise<string> {
  const existing = await getFirstSpaceId(token).catch(() => null);
  if (existing) return existing;

  const path = `/tmp/ai-spaces-ws-e2e-${Date.now()}`;
  const res = await fetch(`${SERVER_URL}/api/spaces`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`Space create failed: ${res.status}`);
  const data = await res.json();
  return data.space.id as string;
}

function connectWs(url: string, opts?: WebSocket.ClientOptions): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, opts);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('close', (code, reason) => reject(new Error(`Closed before open: ${code} ${reason}`)));
  });
}

function wsToAcpStream(ws: WebSocket): {
  output: WritableStream<Uint8Array>;
  input: ReadableStream<Uint8Array>;
} {
  let closed = false;
  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      if (!closed && ws.readyState === WebSocket.OPEN) ws.send(chunk);
    },
    close() {
      if (!closed) {
        closed = true;
        ws.close();
      }
    },
    abort() {
      if (!closed) {
        closed = true;
        ws.close();
      }
    },
  });

  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      ws.on('message', (data) => {
        if (closed) return;
        if (typeof data === 'string') {
          controller.enqueue(new TextEncoder().encode(data));
          return;
        }
        const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
        controller.enqueue(new Uint8Array(buf));
      });

      ws.on('close', () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* ignore */ }
      });

      ws.on('error', (err) => {
        if (closed) return;
        closed = true;
        try { controller.error(err); } catch { /* ignore */ }
      });
    },
  });

  return { output, input };
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
    await ensureUser();
    token = await login();
    spaceId = await ensureSpaceId(token);
  });

  test('connect with valid JWT via ?token= query param → initializes ACP', async () => {
    const ws = await connectWs(`${SERVER_WS_URL}/ws/spaces/${spaceId}?token=${token}`);
    const { input, output } = wsToAcpStream(ws);
    const stream = ndJsonStream(output, input);
    const connection = new ClientSideConnection(() => ({}), stream);
    await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
    ws.close();
  });

  test('connect with valid JWT via Authorization header → initializes ACP', async () => {
    const ws = await connectWs(`${SERVER_WS_URL}/ws/spaces/${spaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { input, output } = wsToAcpStream(ws);
    const stream = ndJsonStream(output, input);
    const connection = new ClientSideConnection(() => ({}), stream);
    await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
    ws.close();
  });

  test('prompt over ACP returns and streams updates', async () => {
    const ws = await connectWs(`${SERVER_WS_URL}/ws/spaces/${spaceId}?token=${token}`);
    const updates: SessionNotification[] = [];
    const { input, output } = wsToAcpStream(ws);
    const stream = ndJsonStream(output, input);
    const connection = new ClientSideConnection(
      () => ({
        sessionUpdate: async (params) => {
          updates.push(params);
        },
      }),
      stream,
    );

    await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
    const { sessionId } = await connection.newSession({ cwd: '', mcpServers: [] });
    const result = await connection.prompt({
      sessionId,
      prompt: [{ type: 'text', text: 'Hello from e2e' }],
    });

    expect(result.stopReason).toBeTruthy();
    expect(updates.some((u) => u.sessionId === sessionId)).toBeTruthy();
    ws.close();
  });

  test('connect with no token → rejected with code 1008', async () => {
    const { code } = await waitForClose(`${SERVER_WS_URL}/ws/spaces/${spaceId}`);
    expect(code).toBe(1008);
  });

  test('connect with invalid token → rejected with code 1008', async () => {
    const { code } = await waitForClose(`${SERVER_WS_URL}/ws/spaces/${spaceId}?token=not-a-valid-jwt`);
    expect(code).toBe(1008);
  });
});
