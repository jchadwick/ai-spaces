import * as crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { type SpaceRoom, spaceRooms } from "../db/index.js";

export type RoomTargetType = "root" | "file" | "directory";

export function normalizeRoomPath(input: string): string {
  const normalizedInput = input.replace(/\\/g, "/");
  const segments = normalizedInput.split("/").filter(Boolean);
  if (
    normalizedInput.includes("\0") ||
    segments.includes("..") ||
    segments.some((segment) => segment.startsWith("."))
  ) {
    throw new Error("Invalid room path");
  }
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

export function listActiveRooms(spaceId: string): SpaceRoom[] {
  return db
    .select()
    .from(spaceRooms)
    .where(and(eq(spaceRooms.spaceId, spaceId), eq(spaceRooms.status, "active")))
    .all();
}

export function getRoom(spaceId: string, roomPath: string): SpaceRoom | undefined {
  return db
    .select()
    .from(spaceRooms)
    .where(
      and(eq(spaceRooms.spaceId, spaceId), eq(spaceRooms.roomPath, normalizeRoomPath(roomPath))),
    )
    .get();
}

export function getRoomById(spaceId: string, roomId: string): SpaceRoom | undefined {
  return db
    .select()
    .from(spaceRooms)
    .where(and(eq(spaceRooms.spaceId, spaceId), eq(spaceRooms.id, roomId)))
    .get();
}

export function getActiveRoom(spaceId: string, roomPath: string): SpaceRoom | undefined {
  const room = getRoom(spaceId, roomPath);
  return room?.status === "active" ? room : undefined;
}

export function upsertPromotedRoom(
  spaceId: string,
  roomPath: string,
  targetType: RoomTargetType,
  createdByUserId: string,
): SpaceRoom {
  const normalized = normalizeRoomPath(roomPath);
  const now = new Date().toISOString();
  db.insert(spaceRooms)
    .values({
      id: crypto.randomUUID(),
      spaceId,
      roomPath: normalized,
      targetType,
      status: "active",
      archivedAt: null,
      createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [spaceRooms.spaceId, spaceRooms.roomPath],
      set: { targetType, status: "active", archivedAt: null, updatedAt: now },
    })
    .run();
  return getRoom(spaceId, normalized)!;
}

export function persistRoomSession(
  spaceId: string,
  roomPath: string,
  acpSessionId: string,
  createdByUserId: string,
): SpaceRoom {
  const normalized = normalizeRoomPath(roomPath);
  const now = new Date().toISOString();
  if (normalized === "/") {
    db.insert(spaceRooms)
      .values({
        id: crypto.randomUUID(),
        spaceId,
        roomPath: "/",
        targetType: "root",
        status: "active",
        acpSessionId,
        archivedAt: null,
        createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [spaceRooms.spaceId, spaceRooms.roomPath],
        set: {
          acpSessionId,
          targetType: "root",
          status: "active",
          archivedAt: null,
          updatedAt: now,
        },
      })
      .run();
  } else {
    const room = getActiveRoom(spaceId, normalized);
    if (!room) throw new Error("Room is not active");
    db.update(spaceRooms)
      .set({ acpSessionId, updatedAt: now })
      .where(eq(spaceRooms.id, room.id))
      .run();
  }
  return getRoom(spaceId, normalized)!;
}

export function archiveRoomTree(spaceId: string, roomPath: string): void {
  const normalized = normalizeRoomPath(roomPath);
  if (normalized === "/") throw new Error("Root room cannot be archived");
  const now = new Date().toISOString();
  for (const room of db.select().from(spaceRooms).where(eq(spaceRooms.spaceId, spaceId)).all()) {
    if (room.roomPath === normalized || room.roomPath.startsWith(`${normalized}/`)) {
      db.update(spaceRooms)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(eq(spaceRooms.id, room.id))
        .run();
    }
  }
}

export function archiveRoomById(spaceId: string, roomId: string): void {
  const room = getRoomById(spaceId, roomId);
  if (!room) throw new Error("Room not found");
  if (room.roomPath === "/") throw new Error("Root room cannot be archived");
  const now = new Date().toISOString();
  db.update(spaceRooms)
    .set({ status: "archived", archivedAt: now, updatedAt: now })
    .where(and(eq(spaceRooms.spaceId, spaceId), eq(spaceRooms.id, roomId)))
    .run();
}

export function renameRoomTree(spaceId: string, fromPath: string, toPath: string): void {
  const from = normalizeRoomPath(fromPath);
  const to = normalizeRoomPath(toPath);
  const now = new Date().toISOString();
  const rooms = db
    .select()
    .from(spaceRooms)
    .where(eq(spaceRooms.spaceId, spaceId))
    .all()
    .filter((room) => room.roomPath === from || room.roomPath.startsWith(`${from}/`))
    .sort((a, b) => a.roomPath.length - b.roomPath.length);
  for (const room of rooms) {
    const suffix = room.roomPath.slice(from.length);
    db.update(spaceRooms)
      .set({ roomPath: `${to}${suffix}`, updatedAt: now })
      .where(eq(spaceRooms.id, room.id))
      .run();
  }
}
