import type { IncomingMessage, ServerResponse } from 'http';

export async function handleSpaceWebSocket(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Space WebSocket: not implemented');
}