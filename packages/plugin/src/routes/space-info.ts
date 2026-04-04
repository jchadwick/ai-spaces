import type { IncomingMessage, ServerResponse } from 'http';

export async function handleSpaceInfo(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: 'Space info: not implemented' }));
}