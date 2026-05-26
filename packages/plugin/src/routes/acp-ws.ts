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

function safeDestroySocket(socket: Duplex): void {
  try {
    if (!socket.destroyed) socket.destroy();
  } catch {
    // ignore
  }
}

function safeWriteHttpError(socket: Duplex, statusLine: string): void {
  try {
    socket.write(`${statusLine}\r\n\r\n`);
  } catch {
    // ignore
  } finally {
    safeDestroySocket(socket);
  }
}

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
    try {
      const space = getSpace(spaceId);
      if (space) fileWatcher.watch(spaceId, resolveSpaceRoot(space));
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err), spaceId }, 'Could not start file watcher for space');
    }
  }
}

function removeConnection(spaceId: string, conn: AgentSideConnection): void {
  const set = spaceConnections.get(spaceId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) {
    spaceConnections.delete(spaceId);
    try {
      fileWatcher.unwatch(spaceId);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err), spaceId }, 'Could not unwatch space');
    }
  }
}

// Forward file change events to all connected clients as ACP ext notifications
fileWatcher.on('file:changed', (event: FileChangedEvent) => {
  try {
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
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'file:changed handler failed');
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
  try {
    const space = getSpace(spaceId);
    if (!space) {
      safeWriteHttpError(socket, 'HTTP/1.1 404 Not Found');
      return;
    }

    const session = validateSession(req);
    if (!session) {
      safeWriteHttpError(socket, 'HTTP/1.1 401 Unauthorized');
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WsWebSocket) => {
      try {
        setupAcpConnection(ws, spaceId, String(session.userId ?? 'unknown'), String(session.role ?? 'viewer'));
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err), spaceId }, 'Failed to setup ACP connection');
        try { ws.close(1011, 'internal error'); } catch { /* ignore */ }
      }
    });
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err), spaceId }, 'ACP upgrade handler failed');
    safeWriteHttpError(socket, 'HTTP/1.1 500 Internal Server Error');
  }
}

function setupAcpConnection(
  ws: WsWebSocket,
  spaceId: string,
  userId: string,
  role: string,
): void {
  let conn: AgentSideConnection | null = null;
  try {
    const { output, input } = wsToAcpStream(ws);
    const stream = ndJsonStream(output, input);

    conn = new AgentSideConnection(
      (connection) => {
        const agent = new AISpacesAgent(connection, spaceId, toSpaceRole(role));
        return agent;
      },
      stream,
    );
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err), spaceId }, 'Failed initializing ACP stream/connection');
    try { ws.close(1011, 'connection init failed'); } catch { /* ignore */ }
    return;
  }

  addConnection(spaceId, conn);
  log.info({ spaceId, userId }, 'ACP connection established');

  ws.on('close', () => {
    try {
      removeConnection(spaceId, conn);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err), spaceId }, 'Failed during ACP connection close cleanup');
    }
    log.info({ spaceId, userId }, 'ACP connection closed');
  });

  ws.on('error', (err) => {
    log.warn({ err, spaceId }, 'ACP WebSocket error');
    try {
      removeConnection(spaceId, conn);
    } catch (cleanupErr) {
      log.warn({ err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr), spaceId }, 'Failed during ACP socket error cleanup');
    }
  });
}
