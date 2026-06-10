import type { SpaceRole } from "@ai-spaces/shared";
import { buildRoomPromptContext } from "../context/room-context.js";
import { getActiveRoom, normalizeRoomPath, type RoomTargetType } from "../rooms/room-store.js";
import type { SpaceRecord } from "../space-store.js";

type Packet = {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

const ALLOWED_BROWSER_METHODS = new Set([
  "initialize",
  "authenticate",
  "session/new",
  "session/load",
  "session/prompt",
  "session/cancel",
]);

function cwdToRoomPath(cwd: unknown): string {
  if (typeof cwd !== "string") throw new Error("Session cwd is required");
  return normalizeRoomPath(cwd);
}

export class BrowserAcpOrchestrator {
  private readonly pendingNewRooms = new Map<string | number, string>();
  private readonly sessionRooms = new Map<string, string>();

  constructor(
    private readonly space: SpaceRecord,
    private readonly role: SpaceRole,
  ) {}

  async filterClientChunk(chunk: Buffer): Promise<{ forward?: Buffer; response?: Buffer }> {
    const packet = JSON.parse(chunk.toString("utf8").trim()) as Packet;
    if (!packet.method) return { forward: chunk };
    if (!ALLOWED_BROWSER_METHODS.has(packet.method)) {
      return { response: this.error(packet.id, "Browser ACP method is not allowed") };
    }

    if (packet.method === "session/new" || packet.method === "session/load") {
      const params = packet.params ?? {};
      const roomPath = cwdToRoomPath(params.cwd);
      const room = this.requireActiveRoom(roomPath);
      if (packet.method === "session/load") {
        const sessionId = String(params.sessionId ?? "");
        if (!sessionId || (room.acpSessionId && room.acpSessionId !== sessionId)) {
          return { response: this.error(packet.id, "Session does not belong to active room") };
        }
        this.sessionRooms.set(sessionId, roomPath);
      } else if (packet.id !== undefined) {
        this.pendingNewRooms.set(packet.id, roomPath);
      }
      packet.params = {
        ...params,
        cwd: roomPath === "/" ? "" : roomPath.slice(1),
        _meta: {
          aiSpacesSystemContext: await buildRoomPromptContext(
            this.space,
            roomPath,
            room.targetType as RoomTargetType,
            this.role,
          ),
        },
      };
    }

    if (packet.method === "session/prompt") {
      const params = packet.params ?? {};
      const sessionId = String(params.sessionId ?? "");
      const roomPath = this.sessionRooms.get(sessionId);
      if (!roomPath) return { response: this.error(packet.id, "Prompt session is not active") };
      const room = this.requireActiveRoom(roomPath);
      packet.params = {
        ...params,
        _meta: {
          aiSpacesSystemContext: await buildRoomPromptContext(
            this.space,
            roomPath,
            room.targetType as RoomTargetType,
            this.role,
          ),
        },
      };
    }

    return { forward: Buffer.from(`${JSON.stringify(packet)}\n`) };
  }

  observeGatewayChunk(chunk: Buffer): void {
    const packet = JSON.parse(chunk.toString("utf8").trim()) as Packet;
    if (packet.id === undefined || !packet.result) return;
    const roomPath = this.pendingNewRooms.get(packet.id);
    const sessionId = packet.result.sessionId;
    if (roomPath && typeof sessionId === "string") {
      this.sessionRooms.set(sessionId, roomPath);
      this.pendingNewRooms.delete(packet.id);
    }
  }

  private requireActiveRoom(roomPath: string) {
    if (roomPath === "/") return { roomPath: "/", targetType: "root", acpSessionId: null };
    const room = getActiveRoom(this.space.id, roomPath);
    // #region agent log
    fetch("http://host.docker.internal:7399/ingest/acbd8104-ecfc-434c-a54a-bcf58319b4b4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "897816" },
      body: JSON.stringify({
        sessionId: "897816",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "browser-orchestrator.ts:requireActiveRoom",
        message: "requireActiveRoom lookup",
        data: {
          spaceId: this.space.id,
          requestedRoomPath: roomPath,
          found: Boolean(room),
          storedRoomPath: room?.roomPath ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!room) throw new Error("Room is not active");
    return room;
  }

  private error(id: Packet["id"], message: string): Buffer {
    return Buffer.from(
      `${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } })}\n`,
    );
  }
}
