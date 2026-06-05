import type { IncomingMessage, ServerResponse } from "node:http";

export async function handleSpaceUI(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("Space UI: not implemented");
}
