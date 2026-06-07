import * as crypto from "node:crypto";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { type SpaceTopic, spaceTopics } from "../db/index.js";

export type TopicTargetType = "root" | "file" | "directory";

export function normalizeTopicPath(input: string): string {
  const normalizedInput = input.replace(/\\/g, "/");
  const segments = normalizedInput.split("/").filter(Boolean);
  if (
    normalizedInput.includes("\0") ||
    segments.includes("..") ||
    segments.some((segment) => segment.startsWith("."))
  ) {
    throw new Error("Invalid topic path");
  }
  return path.posix.normalize(`/${normalizedInput}`);
}

export function listActiveTopics(spaceId: string): SpaceTopic[] {
  return db
    .select()
    .from(spaceTopics)
    .where(and(eq(spaceTopics.spaceId, spaceId), eq(spaceTopics.status, "active")))
    .all();
}

export function getTopic(spaceId: string, topicPath: string): SpaceTopic | undefined {
  return db
    .select()
    .from(spaceTopics)
    .where(
      and(
        eq(spaceTopics.spaceId, spaceId),
        eq(spaceTopics.topicPath, normalizeTopicPath(topicPath)),
      ),
    )
    .get();
}

export function getTopicById(spaceId: string, topicId: string): SpaceTopic | undefined {
  return db
    .select()
    .from(spaceTopics)
    .where(and(eq(spaceTopics.spaceId, spaceId), eq(spaceTopics.id, topicId)))
    .get();
}

export function getActiveTopic(spaceId: string, topicPath: string): SpaceTopic | undefined {
  const topic = getTopic(spaceId, topicPath);
  return topic?.status === "active" ? topic : undefined;
}

export function upsertPromotedTopic(
  spaceId: string,
  topicPath: string,
  targetType: TopicTargetType,
  createdByUserId: string,
): SpaceTopic {
  const normalized = normalizeTopicPath(topicPath);
  const now = new Date().toISOString();
  db.insert(spaceTopics)
    .values({
      id: crypto.randomUUID(),
      spaceId,
      topicPath: normalized,
      targetType,
      status: "active",
      archivedAt: null,
      createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [spaceTopics.spaceId, spaceTopics.topicPath],
      set: { targetType, status: "active", archivedAt: null, updatedAt: now },
    })
    .run();
  return getTopic(spaceId, normalized)!;
}

export function persistTopicSession(
  spaceId: string,
  topicPath: string,
  acpSessionId: string,
  createdByUserId: string,
): SpaceTopic {
  const normalized = normalizeTopicPath(topicPath);
  const now = new Date().toISOString();
  if (normalized === "/") {
    db.insert(spaceTopics)
      .values({
        id: crypto.randomUUID(),
        spaceId,
        topicPath: "/",
        targetType: "root",
        status: "active",
        acpSessionId,
        archivedAt: null,
        createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [spaceTopics.spaceId, spaceTopics.topicPath],
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
    const topic = getActiveTopic(spaceId, normalized);
    if (!topic) throw new Error("Topic is not active");
    db.update(spaceTopics)
      .set({ acpSessionId, updatedAt: now })
      .where(eq(spaceTopics.id, topic.id))
      .run();
  }
  return getTopic(spaceId, normalized)!;
}

export function archiveTopicTree(spaceId: string, topicPath: string): void {
  const normalized = normalizeTopicPath(topicPath);
  if (normalized === "/") throw new Error("Root topic cannot be archived");
  const now = new Date().toISOString();
  for (const topic of db.select().from(spaceTopics).where(eq(spaceTopics.spaceId, spaceId)).all()) {
    if (topic.topicPath === normalized || topic.topicPath.startsWith(`${normalized}/`)) {
      db.update(spaceTopics)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(eq(spaceTopics.id, topic.id))
        .run();
    }
  }
}

export function archiveTopicById(spaceId: string, topicId: string): void {
  const topic = getTopicById(spaceId, topicId);
  if (!topic) throw new Error("Room not found");
  if (topic.topicPath === "/") throw new Error("Root topic cannot be archived");
  const now = new Date().toISOString();
  db.update(spaceTopics)
    .set({ status: "archived", archivedAt: now, updatedAt: now })
    .where(and(eq(spaceTopics.spaceId, spaceId), eq(spaceTopics.id, topicId)))
    .run();
}

export function renameTopicTree(spaceId: string, fromPath: string, toPath: string): void {
  const from = normalizeTopicPath(fromPath);
  const to = normalizeTopicPath(toPath);
  const now = new Date().toISOString();
  const topics = db
    .select()
    .from(spaceTopics)
    .where(eq(spaceTopics.spaceId, spaceId))
    .all()
    .filter((topic) => topic.topicPath === from || topic.topicPath.startsWith(`${from}/`))
    .sort((a, b) => a.topicPath.length - b.topicPath.length);
  for (const topic of topics) {
    const suffix = topic.topicPath.slice(from.length);
    db.update(spaceTopics)
      .set({ topicPath: `${to}${suffix}`, updatedAt: now })
      .where(eq(spaceTopics.id, topic.id))
      .run();
  }
}
