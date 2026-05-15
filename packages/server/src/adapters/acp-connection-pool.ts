import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { wsToAcpStream } from '../acp/ws-transport.js';
import { getServerById } from '../db/queries.js';
import type { SpaceRecord } from '../space-store.js';
import { logger as rootLogger } from '../logger.js';
import { config } from '../config.js';

const log = rootLogger.child({ component: 'acp-connection-pool' });

interface PoolEntry {
  connection: ClientSideConnection;
  ws: WebSocket;
}

export class ACPConnectionPool {
  private pool = new Map<string, PoolEntry>();
  private connecting = new Map<string, Promise<ClientSideConnection>>();

  async getConnection(space: SpaceRecord): Promise<ClientSideConnection> {
    const existing = this.pool.get(space.id);
    if (existing && existing.ws.readyState === WebSocket.OPEN) {
      return existing.connection;
    }
    // Already connecting — deduplicate
    const inFlight = this.connecting.get(space.id);
    if (inFlight) return inFlight;

    const connectPromise = this.connect(space).finally(() => {
      this.connecting.delete(space.id);
    });
    this.connecting.set(space.id, connectPromise);
    return connectPromise;
  }

  private async connect(space: SpaceRecord): Promise<ClientSideConnection> {
    const server = getServerById(space.serverId);
    if (!server?.pluginUrl) throw new Error(`No plugin URL for server ${space.serverId}`);

    const wsUrl = `${server.pluginUrl.replace(/^http/, 'ws')}/api/spaces/${space.id}/acp`;
    log.info({ spaceId: space.id, wsUrl }, 'connecting to plugin ACP');

    const forwardToken = jwt.sign(
      { userId: 'server', role: 'owner' },
      config.JWT_SECRET,
      { expiresIn: '1h' },
    );
    const ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${forwardToken}` },
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const { output, input } = wsToAcpStream(ws);
    const stream = ndJsonStream(output, input);

    const connection = new ClientSideConnection(
      (_conn) => ({
        // Server never receives requestPermission or sessionUpdate from the plugin in this direction
        requestPermission: async () => ({ outcome: { outcome: 'cancelled' as const } }),
        sessionUpdate: async () => {},
      }),
      stream,
    );

    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const entry: PoolEntry = { connection, ws };
    this.pool.set(space.id, entry);

    ws.on('close', () => {
      if (this.pool.get(space.id) === entry) {
        this.pool.delete(space.id);
        log.info({ spaceId: space.id }, 'ACP connection closed, will reconnect on next use');
      }
    });

    ws.on('error', (err) => {
      log.warn({ err, spaceId: space.id }, 'ACP connection error');
      if (this.pool.get(space.id) === entry) {
        this.pool.delete(space.id);
      }
    });

    log.info({ spaceId: space.id }, 'ACP connection established');
    return connection;
  }

  dispose(spaceId: string): void {
    const entry = this.pool.get(spaceId);
    if (entry) {
      entry.ws.close();
      this.pool.delete(spaceId);
    }
  }

  disposeAll(): void {
    for (const [spaceId] of this.pool) {
      this.dispose(spaceId);
    }
  }
}

export const acpConnectionPool = new ACPConnectionPool();
