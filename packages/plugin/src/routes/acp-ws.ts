import * as http from 'http';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';
import { toSpaceRole } from '@ai-spaces/shared';
import { wsToAcpStream } from '../acp/ws-transport.js';
import { AISpacesAgent } from '../acp/agent.js';
import { validateSession } from '../session-middleware.js';
import { getSpace, resolveSpaceRoot } from '../space-store.js';
import { fileWatcher, type FileChangedEvent } from '../file-watcher.js';
import { logger as rootLogger } from '../logger.js';

const log = rootLogger.child({ component: 'acp-ws' });

/** Active ACP connections keyed by spaceId → set of connections */
const spaceConnections = new Map<string, Set<AgentSideConnection>>();

function addConnection(spaceId: string, conn: AgentSideConnection): void {
  let set = spaceConnections.get(spaceId);
  if (!set) {
    set = new Set();
    spaceConnections.set(spaceId, set);
  }
  const wasEmpty = set.size === 0;
  set.add(conn);
  if (wasEmpty) {
    const space = getSpace(spaceId);
    if (space) fileWatcher.watch(spaceId, resolveSpaceRoot(space));
  }
}

function removeConnection(spaceId: string, conn: AgentSideConnection): void {
  const set = spaceConnections.get(spaceId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) {
    spaceConnections.delete(spaceId);
    fileWatcher.unwatch(spaceId);
  }
}

// Forward file change events to all connected clients as ACP ext notifications
fileWatcher.on('file:changed', (event: FileChangedEvent) => {
  const conns = spaceConnections.get(event.spaceId);
  if (!conns?.size) return;

  const payload = {
    spaceId: event.spaceId,
    path: event.path,
    action: event.action,
    triggeredBy: 'agent' as const,
  };

  for (const conn of conns) {
    conn.extNotification?.('workspace/file_changed', payload).catch((err) => {
      log.warn({ err }, 'failed to send file_changed notification');
    });
  }
});

/**
 * Creates a WebSocket server that accepts ACP connections.
 * Each connection gets its own AISpacesAgent instance.
 */
export function createAcpWsServer(): WebSocketServer {
  return new WebSocketServer({ noServer: true });
}

/**
 * Handle an HTTP upgrade to ACP WebSocket for a specific space.
 */
export function handleAcpUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  spaceId: string,
): void {
  const space = getSpace(spaceId);
  if (!space) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  const session = validateSession(req);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws: WsWebSocket) => {
    setupAcpConnection(ws, spaceId, String(session.userId ?? 'unknown'), String(session.role ?? 'viewer'));
  });
}

function setupAcpConnection(
  ws: WsWebSocket,
  spaceId: string,
  userId: string,
  role: string,
): void {
  const { output, input } = wsToAcpStream(ws);
  const stream = ndJsonStream(output, input);

  let conn: AgentSideConnection;

  conn = new AgentSideConnection(
    (connection) => {
      const agent = new AISpacesAgent(connection, spaceId, toSpaceRole(role));
      return agent;
    },
    stream,
  );

  addConnection(spaceId, conn);
  log.info({ spaceId, userId }, 'ACP connection established');

  ws.on('close', () => {
    removeConnection(spaceId, conn);
    log.info({ spaceId, userId }, 'ACP connection closed');
  });

  ws.on('error', (err) => {
    log.warn({ err, spaceId }, 'ACP WebSocket error');
    removeConnection(spaceId, conn);
  });
}
