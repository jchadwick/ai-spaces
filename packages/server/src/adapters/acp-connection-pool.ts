import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { wsToAcpStream } from "../acp/ws-transport.js";
import { config } from "../config.js";
import { logger as rootLogger } from "../logger.js";
import { getActiveRuntimeServerEndpoint } from "../runtime-servers.js";
import type { SpaceRecord } from "../space-store.js";

const log = rootLogger.child({ component: "acp-connection-pool" });

interface PoolEntry {
  connection: ClientSideConnection;
  ws: WebSocket;
  serverId: string;
  endpointUrl: string;
}

export class ACPConnectionPool {
  private pool = new Map<string, PoolEntry>();
  private connecting = new Map<string, Promise<ClientSideConnection>>();

  async getConnection(space: SpaceRecord): Promise<ClientSideConnection> {
    const endpointUrl = getActiveRuntimeServerEndpoint(space.serverId);
    const existing = this.pool.get(space.id);
    if (
      existing &&
      existing.ws.readyState === WebSocket.OPEN &&
      existing.serverId === space.serverId &&
      existing.endpointUrl === endpointUrl
    ) {
      return existing.connection;
    }
    if (existing) this.dispose(space.id);
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
    const endpointUrl = getActiveRuntimeServerEndpoint(space.serverId);

    const wsUrl = `${endpointUrl.replace(/^http/, "ws")}/api/spaces/${space.runtimeSpaceId}/acp`;
    log.info({ spaceId: space.id, runtimeSpaceId: space.runtimeSpaceId, wsUrl }, "connecting to plugin ACP");

    const forwardToken = jwt.sign({ userId: "server", role: "owner" }, config.JWT_SECRET, {
      expiresIn: "1h",
    });
    const ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${forwardToken}` },
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const { output, input } = wsToAcpStream(ws);
    const stream = ndJsonStream(output, input);

    const connection = new ClientSideConnection(
      (_conn) => ({
        // Server never receives requestPermission or sessionUpdate from the plugin in this direction
        requestPermission: async () => ({ outcome: { outcome: "cancelled" as const } }),
        sessionUpdate: async () => {},
      }),
      stream,
    );

    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const entry: PoolEntry = { connection, ws, serverId: space.serverId, endpointUrl };
    this.pool.set(space.id, entry);

    ws.on("close", () => {
      if (this.pool.get(space.id) === entry) {
        this.pool.delete(space.id);
        log.info({ spaceId: space.id }, "ACP connection closed, will reconnect on next use");
      }
    });

    ws.on("error", (err) => {
      log.warn({ err, spaceId: space.id }, "ACP connection error");
      if (this.pool.get(space.id) === entry) {
        this.pool.delete(space.id);
      }
    });

    log.info({ spaceId: space.id }, "ACP connection established");
    return connection;
  }

  dispose(spaceId: string): void {
    const entry = this.pool.get(spaceId);
    if (entry) {
      entry.ws.close();
      this.pool.delete(spaceId);
    }
  }

  disposeServer(serverId: string): void {
    for (const [spaceId, entry] of this.pool) {
      if (entry.serverId === serverId) {
        entry.ws.close();
        this.pool.delete(spaceId);
      }
    }
  }

  disposeAll(): void {
    for (const [spaceId] of this.pool) {
      this.dispose(spaceId);
    }
  }
}

export const acpConnectionPool = new ACPConnectionPool();
