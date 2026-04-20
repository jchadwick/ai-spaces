/**
 * Minimal OpenClaw-style JSON WebSocket for E2E: same connect + chat.send
 * streaming shape as packages/plugin/src/routes/space-ws.ts (no real agent).
 */
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_GATEWAY_PORT || 19000);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('e2e-mock-gateway');
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const host = req.headers.host || '127.0.0.1';
  const u = new URL(req.url || '/', `http://${host}`);
  const m = u.pathname.match(/^\/api\/spaces\/([^/]+)\/ws$/);
  if (!m) {
    socket.destroy();
    return;
  }
  const spaceId = m[1];

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type === 'req' && msg.method === 'connect') {
        ws.send(JSON.stringify({ type: 'res', id: msg.id, result: { success: true } }));
        ws.send(
          JSON.stringify({
            type: 'event',
            event: 'connected',
            payload: { role: 'admin', spaceId, sessionId: 'e2e-session' },
          }),
        );
        return;
      }
      if (msg?.type === 'req' && msg.method === 'chat.send') {
        ws.send(JSON.stringify({ type: 'res', id: msg.id, result: { success: true } }));
        const mid = 'mock-assistant-msg';
        ws.send(JSON.stringify({ type: 'event', event: 'stream_start', payload: { messageId: mid } }));
        ws.send(JSON.stringify({ type: 'event', event: 'stream_chunk', payload: { text: 'Mock reply.' } }));
        ws.send(JSON.stringify({ type: 'event', event: 'stream_end', payload: {} }));
      }
    });
  });
});

httpServer.listen(port, '127.0.0.1', () => {
  console.log(`[e2e-mock-gateway] http://127.0.0.1:${port}`);
});
