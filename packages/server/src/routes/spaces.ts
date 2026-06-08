import type { FileMetadataEntry, SpaceRole, WorkspacePathFacts } from "@ai-spaces/shared";
import { hasPermission, SpaceConfigSchema } from "@ai-spaces/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { agentAdapter } from "../agent-adapter-instance.js";
import { getUserSpaceRole, getUserSpaceRoles } from "../db/queries.js";
import { type AuthVariables, authMiddleware } from "../middleware/auth.js";
import { filterRestrictedNodes, isPathRestricted, loadSpaceMetadata } from "../restricted-paths.js";
import { workspacePolicy } from "../security/workspace-policy-instance.js";
import {
  deleteSpace,
  getSpace,
  listSpaces,
  type SpaceRecord,
  updateSpaceConfig,
} from "../space-store.js";
import {
  archiveTopicById,
  archiveTopicTree,
  getActiveTopic,
  getTopic,
  getTopicById,
  listActiveTopics,
  normalizeTopicPath,
  persistTopicSession,
  renameTopicTree,
  upsertPromotedTopic,
} from "../topics/topic-store.js";

export interface SpaceVariables extends AuthVariables {
  spaceRole: SpaceRole;
}

export const spacesRouter = new Hono<{ Variables: SpaceVariables }>();
spacesRouter.use("*", authMiddleware);

export function getSpaceById(id: string): SpaceRecord | null {
  return getSpace(id);
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isBase64FileResponse(contentType: string): boolean {
  const mimeType = normalizeContentType(contentType);
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

function isPdfContentType(contentType: string): boolean {
  return normalizeContentType(contentType) === "application/pdf";
}

export function fileContentResponseBody(content: string, contentType: string): string | Uint8Array {
  if (!isBase64FileResponse(contentType)) return content;
  return Buffer.from(content, "base64");
}

export function fileContentResponseLength(responseBody: string | Uint8Array): number {
  return typeof responseBody === "string" ? Buffer.byteLength(responseBody) : responseBody.length;
}

export function safeContentDispositionFilename(filePath: string): string {
  const basename = filePath.split(/[\\/]/).filter(Boolean).pop() ?? "file";
  const safeName =
    [...basename]
      .map((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint < 32 || codePoint === 127 ? "_" : character;
      })
      .join("") || "file";
  return safeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function authenticatedFileContentHeaders({
  filePath,
  contentType,
  contentLength,
}: {
  filePath: string;
  contentType: string;
  contentLength?: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  };

  if (contentLength !== undefined && Number.isFinite(contentLength)) {
    headers["Content-Length"] = String(contentLength);
  }

  if (isPdfContentType(contentType)) {
    headers["Content-Disposition"] =
      `inline; filename="${safeContentDispositionFilename(filePath)}"`;
  }

  return headers;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function applyResponseHeaders(
  c: Context<{ Variables: SpaceVariables }>,
  headers: Record<string, string>,
) {
  for (const [name, value] of Object.entries(headers)) {
    c.header(name, value);
  }
}

class FileAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 404,
  ) {
    super(message);
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface ReadableFileResolution {
  space: SpaceRecord;
  path: string;
  token: string;
  facts: WorkspacePathFacts;
}

async function resolveReadableFile(
  c: Context<{ Variables: SpaceVariables }>,
): Promise<ReadableFileResolution> {
  const id = c.req.param("id") ?? "";
  const filePath = c.req.param("filePath") ?? "";
  const space = getSpace(id);
  const role = c.get("spaceRole");

  if (!space) {
    throw new FileAccessError("Space not found", 404);
  }

  const includeInternal = hasPermission(role, "files:read-internal");
  const approved = await workspacePolicy.approvePath(space, filePath, {
    allowHidden: includeInternal,
    expectedType: "file",
  });
  const resolution = workspacePolicy.consume(approved.token);
  if (!includeInternal && isPathRestricted(await loadSpaceMetadata(space), resolution.path)) {
    throw new FileAccessError("Access denied: restricted path", 403);
  }

  return {
    space,
    path: resolution.path,
    token: resolution.token,
    facts: resolution.facts,
  };
}

function metadataContentType(facts: WorkspacePathFacts, filePath: string): string {
  if (facts.contentType) return facts.contentType;
  return filePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
}

// Space access middleware — resolves spaceRole for /:id and all sub-routes
spacesRouter.use("/:id", async (c, next) => {
  const { userId } = c.get("user");
  const spaceId = c.req.param("id");
  const role = getUserSpaceRole(userId, spaceId);
  if (!role) return c.json({ error: "Forbidden" }, 403);
  c.set("spaceRole", role);
  return next();
});

spacesRouter.use("/:id/*", async (c, next) => {
  const { userId } = c.get("user");
  const spaceId = c.req.param("id");
  const role = getUserSpaceRole(userId, spaceId);
  if (!role) return c.json({ error: "Forbidden" }, 403);
  c.set("spaceRole", role);
  return next();
});

spacesRouter.get("/", (c) => {
  const { userId } = c.get("user");
  const allSpaces = listSpaces();
  const membershipMap = getUserSpaceRoles(
    userId,
    allSpaces.map((s) => s.id),
  );
  const accessibleSpaces = allSpaces.filter((s) => membershipMap.has(s.id));

  const spaces = accessibleSpaces.map((s) => {
    const parent = accessibleSpaces
      .filter((other) => other.id !== s.id && s.path.startsWith(`${other.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return {
      id: s.id,
      path: s.path,
      config: s.config,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      parentSpaceId: parent?.id ?? null,
      userRole: membershipMap.get(s.id) ?? "viewer",
    };
  });
  return c.json({ spaces });
});

spacesRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  const spaceRole = c.get("spaceRole");
  return c.json({ space, userRole: spaceRole });
});

function requirePermission(
  c: { get: (key: "spaceRole") => SpaceRole },
  permission: "files:write" | "space:manage",
) {
  if (!hasPermission(c.get("spaceRole"), permission)) throw new Error("Forbidden");
}

const topicSchema = z.object({
  topicPath: z.string(),
  acpSessionId: z.string().min(1),
});

spacesRouter.get("/:id/topics/session", async (c) => {
  const spaceId = c.req.param("id");
  const space = getSpace(spaceId);
  const role = c.get("spaceRole");
  try {
    const topicPath = normalizeTopicPath(c.req.query("path") ?? "/");
    if (
      space &&
      !hasPermission(role, "files:read-internal") &&
      isPathRestricted(await loadSpaceMetadata(space), topicPath)
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    const topic =
      topicPath === "/" ? getTopic(spaceId, topicPath) : getActiveTopic(spaceId, topicPath);
    return c.json({ topic: topic ?? null });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.put("/:id/topics/session", zValidator("json", topicSchema), async (c) => {
  const spaceId = c.req.param("id");
  const { userId } = c.get("user");
  const { acpSessionId } = c.req.valid("json");
  const space = getSpace(spaceId);
  const role = c.get("spaceRole");
  try {
    const topicPath = normalizeTopicPath(c.req.valid("json").topicPath);
    if (
      space &&
      !hasPermission(role, "files:read-internal") &&
      isPathRestricted(await loadSpaceMetadata(space), topicPath)
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    const topic = persistTopicSession(spaceId, topicPath, acpSessionId, userId);
    return c.json({ topic });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

async function listVisibleRooms(c: {
  req: { param: (key: string) => string };
  get: (key: "spaceRole") => SpaceRole;
}) {
  const space = getSpace(c.req.param("id"));
  const role = c.get("spaceRole");
  const metadata =
    space && !hasPermission(role, "files:read-internal") ? await loadSpaceMetadata(space) : null;
  return listActiveTopics(c.req.param("id")).filter((topic) => {
    if (topic.topicPath === "/") return false;
    return !metadata || !isPathRestricted(metadata, topic.topicPath);
  });
}

spacesRouter.get("/:id/topics", async (c) => {
  return c.json({ topics: await listVisibleRooms(c) });
});

spacesRouter.get("/:id/rooms", async (c) => {
  return c.json({ rooms: await listVisibleRooms(c) });
});

const promoteTopicSchema = z.object({
  topicPath: z.string().min(1),
  targetType: z.enum(["file", "directory"]),
});

// @ts-expect-error -- tsgo TS2589
spacesRouter.post("/:id/topics", zValidator("json", promoteTopicSchema), async (c) => {
  try {
    requirePermission(c, "space:manage");
    const spaceId = c.req.param("id");
    const space = getSpace(spaceId);
    if (!space) return c.json({ error: "Space not found" }, 404);
    const { topicPath, targetType } = c.req.valid("json");
    const normalized = normalizeTopicPath(topicPath);
    if (normalized === "/") return c.json({ error: "Root topic is built in" }, 400);
    if (isPathRestricted(await loadSpaceMetadata(space), normalized)) {
      return c.json({ error: "Restricted paths cannot be promoted to Rooms" }, 400);
    }
    const approved = await workspacePolicy.approvePath(space, normalized.slice(1), {
      expectedType: targetType,
    });
    workspacePolicy.consume(approved.token);
    const topic = upsertPromotedTopic(spaceId, normalized, targetType, c.get("user").userId);
    return c.json({ topic }, 201);
  } catch (err) {
    return c.json(
      { error: (err as Error).message },
      (err as Error).message === "Forbidden" ? 403 : 400,
    );
  }
});

spacesRouter.post("/:id/rooms", zValidator("json", promoteTopicSchema), async (c) => {
  try {
    requirePermission(c, "space:manage");
    const spaceId = c.req.param("id");
    const space = getSpace(spaceId);
    if (!space) return c.json({ error: "Space not found" }, 404);
    const { topicPath, targetType } = c.req.valid("json");
    const normalized = normalizeTopicPath(topicPath);
    if (normalized === "/") return c.json({ error: "Root room is built in" }, 400);
    if (isPathRestricted(await loadSpaceMetadata(space), normalized)) {
      return c.json({ error: "Restricted paths cannot be promoted to Rooms" }, 400);
    }
    const approved = await workspacePolicy.approvePath(space, normalized.slice(1), {
      expectedType: targetType,
    });
    workspacePolicy.consume(approved.token);
    const room = upsertPromotedTopic(spaceId, normalized, targetType, c.get("user").userId);
    return c.json({ room }, 201);
  } catch (err) {
    return c.json(
      { error: (err as Error).message },
      (err as Error).message === "Forbidden" ? 403 : 400,
    );
  }
});

spacesRouter.get("/:id/rooms/:roomId", async (c) => {
  const room = getTopicById(c.req.param("id"), c.req.param("roomId"));
  if (room?.status !== "active" || room.topicPath === "/")
    return c.json({ error: "Room not found" }, 404);
  const space = getSpace(c.req.param("id"));
  const role = c.get("spaceRole");
  if (
    space &&
    !hasPermission(role, "files:read-internal") &&
    isPathRestricted(await loadSpaceMetadata(space), room.topicPath)
  ) {
    return c.json({ error: "Access denied: restricted path" }, 403);
  }
  return c.json({ room });
});

spacesRouter.delete(
  "/:id/topics",
  // @ts-expect-error -- tsgo TS2589
  zValidator("json", z.object({ topicPath: z.string().min(1) })),
  (c) => {
    try {
      requirePermission(c, "space:manage");
      archiveTopicTree(c.req.param("id"), c.req.valid("json").topicPath);
      return c.json({ success: true });
    } catch (err) {
      return c.json(
        { error: (err as Error).message },
        (err as Error).message === "Forbidden" ? 403 : 400,
      );
    }
  },
);

spacesRouter.delete("/:id/rooms/:roomId", (c) => {
  try {
    requirePermission(c, "space:manage");
    archiveTopicById(c.req.param("id"), c.req.param("roomId"));
    return c.json({ success: true });
  } catch (err) {
    return c.json(
      { error: (err as Error).message },
      (err as Error).message === "Forbidden" ? 403 : 400,
    );
  }
});

spacesRouter.get("/:id/metadata", async (c) => {
  const id = c.req.param("id");
  const space = getSpace(id);
  if (!space) return c.json({ error: "Space not found" }, 404);
  try {
    const metadata = await agentAdapter.getMetadata(space);
    return c.json(metadata);
  } catch (_err: any) {
    return c.json({ files: {} });
  }
});

const patchMetadataSchema = z.object({
  files: z.record(
    z.string(),
    z.object({
      displayName: z.string().optional(),
      summary: z.string().optional(),
      restricted: z.boolean().optional(),
    }),
  ),
});

// @ts-expect-error -- tsgo TS2589
spacesRouter.patch("/:id/metadata", zValidator("json", patchMetadataSchema), async (c) => {
  const id = c.req.param("id");
  const { files } = c.req.valid("json");
  const space = getSpace(id);
  if (!space) return c.json({ error: "Space not found" }, 404);
  try {
    requirePermission(c, "files:write");
    const approvedFiles: Record<string, Partial<FileMetadataEntry>> = {};
    for (const [filePath, patch] of Object.entries(files)) {
      const approved = await workspacePolicy.approvePath(space, filePath, { allowMissing: true });
      const resolution = workspacePolicy.consume(approved.token);
      approvedFiles[resolution.path] = patch as Partial<FileMetadataEntry>;
    }
    await agentAdapter.patchMetadata(space, approvedFiles);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to update metadata" }, 500);
  }
});

spacesRouter.get("/:id/files", async (c) => {
  const id = c.req.param("id");
  const dirPath = c.req.query("path") || "";
  const space = getSpace(id);
  const role = c.get("spaceRole");

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  try {
    const includeInternal = hasPermission(role, "files:read-internal");
    const approved = await workspacePolicy.approvePath(space, dirPath, {
      allowHidden: includeInternal,
      expectedType: "directory",
    });
    const resolution = workspacePolicy.consume(approved.token);
    if (!includeInternal && isPathRestricted(await loadSpaceMetadata(space), resolution.path)) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    const files = await agentAdapter.listFiles(
      space,
      resolution.path,
      includeInternal,
      resolution.token,
    );
    return c.json({
      files: includeInternal ? files : filterRestrictedNodes(files, await loadSpaceMetadata(space)),
    });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to list files" }, 500);
  }
});

spacesRouter.on("HEAD", "/:id/files/:filePath{.*}", async (c) => {
  try {
    const resolution = await resolveReadableFile(c);
    const contentType = metadataContentType(resolution.facts, resolution.path);
    applyResponseHeaders(
      c,
      authenticatedFileContentHeaders({
        filePath: resolution.path,
        contentType,
        contentLength: resolution.facts.size,
      }),
    );
    return c.body(null);
  } catch (err: unknown) {
    const status = err instanceof FileAccessError ? err.status : 404;
    return c.json({ error: errorMessage(err, "File not found") }, status);
  }
});

spacesRouter.get("/:id/files/:filePath{.*}", async (c) => {
  try {
    const resolution = await resolveReadableFile(c);
    const { content, contentType } = await agentAdapter.readFile(
      resolution.space,
      resolution.path,
      resolution.token,
    );
    const responseBody = fileContentResponseBody(content, contentType);
    applyResponseHeaders(
      c,
      authenticatedFileContentHeaders({
        filePath: resolution.path,
        contentType,
        contentLength: fileContentResponseLength(responseBody),
      }),
    );
    return typeof responseBody === "string"
      ? c.body(responseBody)
      : c.body(toArrayBuffer(responseBody));
  } catch (err: unknown) {
    const status = err instanceof FileAccessError ? err.status : 404;
    return c.json({ error: errorMessage(err, "File not found") }, status);
  }
});

const writeFileSchema = z.object({
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional(),
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.put("/:id/files/:filePath{.*}", zValidator("json", writeFileSchema), async (c) => {
  const id = c.req.param("id");
  const filePath = c.req.param("filePath");
  const { content, encoding } = c.req.valid("json");
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  try {
    requirePermission(c, "files:write");
    const approved = await workspacePolicy.approvePath(space, filePath, { allowMissing: true });
    const resolution = workspacePolicy.consume(approved.token);
    if (
      !hasPermission(c.get("spaceRole"), "files:write-internal") &&
      isPathRestricted(await loadSpaceMetadata(space), resolution.path)
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    await agentAdapter.writeFile(space, resolution.path, content, resolution.token, encoding);
    return c.json({ success: true, path: filePath });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to write file" }, 500);
  }
});

const createDirSchema = z.object({
  path: z.string().min(1),
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.post("/:id/directories", zValidator("json", createDirSchema), async (c) => {
  const id = c.req.param("id");
  const { path: dirPath } = c.req.valid("json");
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  try {
    requirePermission(c, "files:write");
    const approved = await workspacePolicy.approvePath(space, dirPath, { allowMissing: true });
    const resolution = workspacePolicy.consume(approved.token);
    if (
      !hasPermission(c.get("spaceRole"), "files:write-internal") &&
      isPathRestricted(await loadSpaceMetadata(space), resolution.path)
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    await agentAdapter.createDirectory(space, resolution.path, resolution.token);
    return c.json({ success: true, path: dirPath });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to create directory" }, 500);
  }
});

spacesRouter.delete("/:id/files/:filePath{.*}", async (c) => {
  const id = c.req.param("id");
  const filePath = c.req.param("filePath");
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  try {
    requirePermission(c, "files:write");
    const approved = await workspacePolicy.approvePath(space, filePath, { expectedType: "file" });
    const resolution = workspacePolicy.consume(approved.token);
    if (
      !hasPermission(c.get("spaceRole"), "files:write-internal") &&
      isPathRestricted(await loadSpaceMetadata(space), resolution.path)
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    await agentAdapter.deleteFile(space, resolution.path, resolution.token);
    archiveTopicTree(id, `/${resolution.path}`);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to delete file" }, 500);
  }
});

const renameFileSchema = z.object({
  newPath: z.string().min(1),
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.patch("/:id/files/:filePath{.*}", zValidator("json", renameFileSchema), async (c) => {
  const id = c.req.param("id");
  const filePath = c.req.param("filePath");
  const { newPath } = c.req.valid("json");
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  try {
    requirePermission(c, "files:write");
    const from = await workspacePolicy.approvePath(space, filePath, { expectedType: "file" });
    const to = await workspacePolicy.approvePath(space, newPath, { allowMissing: true });
    const sourceResolution = workspacePolicy.consume(from.token);
    const targetResolution = workspacePolicy.consume(to.token);
    const metadata = await loadSpaceMetadata(space);
    if (
      !hasPermission(c.get("spaceRole"), "files:write-internal") &&
      (isPathRestricted(metadata, sourceResolution.path) ||
        isPathRestricted(metadata, targetResolution.path))
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    await agentAdapter.renameFile(
      space,
      sourceResolution.path,
      targetResolution.path,
      sourceResolution.token,
      targetResolution.token,
    );
    renameTopicTree(id, `/${sourceResolution.path}`, `/${targetResolution.path}`);
    return c.json({ success: true, path: newPath });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to rename file" }, 500);
  }
});

spacesRouter.delete("/:id/directories/:dirPath{.*}", async (c) => {
  const id = c.req.param("id");
  const dirPath = c.req.param("dirPath");
  const space = getSpace(id);

  if (!space) {
    return c.json({ error: "Space not found" }, 404);
  }

  try {
    requirePermission(c, "files:write");
    const approved = await workspacePolicy.approvePath(space, dirPath, {
      expectedType: "directory",
    });
    const resolution = workspacePolicy.consume(approved.token);
    if (
      !hasPermission(c.get("spaceRole"), "files:write-internal") &&
      isPathRestricted(await loadSpaceMetadata(space), resolution.path)
    ) {
      return c.json({ error: "Access denied: restricted path" }, 403);
    }
    await agentAdapter.deleteDirectory(space, resolution.path, resolution.token);
    archiveTopicTree(id, `/${resolution.path}`);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to delete directory" }, 500);
  }
});

const renameDirSchema = z.object({
  newPath: z.string().min(1),
});

spacesRouter.patch(
  "/:id/directories/:dirPath{.*}",
  // @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
  zValidator("json", renameDirSchema),
  async (c) => {
    const id = c.req.param("id");
    const dirPath = c.req.param("dirPath");
    const { newPath } = c.req.valid("json");
    const space = getSpace(id);

    if (!space) {
      return c.json({ error: "Space not found" }, 404);
    }

    try {
      requirePermission(c, "files:write");
      const from = await workspacePolicy.approvePath(space, dirPath, { expectedType: "directory" });
      const to = await workspacePolicy.approvePath(space, newPath, { allowMissing: true });
      const sourceResolution = workspacePolicy.consume(from.token);
      const targetResolution = workspacePolicy.consume(to.token);
      const metadata = await loadSpaceMetadata(space);
      if (
        !hasPermission(c.get("spaceRole"), "files:write-internal") &&
        (isPathRestricted(metadata, sourceResolution.path) ||
          isPathRestricted(metadata, targetResolution.path))
      ) {
        return c.json({ error: "Access denied: restricted path" }, 403);
      }
      await agentAdapter.renameDirectory(
        space,
        sourceResolution.path,
        targetResolution.path,
        sourceResolution.token,
        targetResolution.token,
      );
      renameTopicTree(id, `/${sourceResolution.path}`, `/${targetResolution.path}`);
      return c.json({ success: true, path: newPath });
    } catch (err: any) {
      return c.json({ error: err.message ?? "Failed to rename directory" }, 500);
    }
  },
);

const patchConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  notificationIgnorePatterns: z.array(z.string()).optional(),
});

// @ts-expect-error -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
spacesRouter.patch("/:id/config", zValidator("json", patchConfigSchema), async (c) => {
  const id = c.req.param("id");
  try {
    requirePermission(c, "space:manage");
  } catch (err) {
    return c.json({ error: (err as Error).message }, 403);
  }
  const space = getSpace(id);
  if (!space) return c.json({ error: "Space not found" }, 404);

  const patch = c.req.valid("json");
  const updatedConfig = { ...space.config, ...patch };
  const validated = SpaceConfigSchema.safeParse(updatedConfig);
  if (!validated.success) {
    return c.json(
      {
        error: "Invalid config",
        details: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      400,
    );
  }

  try {
    const updated = updateSpaceConfig(id, validated.data, c.get("user").userId);
    if (!updated) return c.json({ error: "Space not found" }, 404);

    // Also write updated config to the space's spaces.json file
    try {
      const configPath = ".space/spaces.json";
      const approved = await workspacePolicy.approvePath(space, configPath, {
        allowMissing: true,
        allowHidden: true,
      });
      const resolution = workspacePolicy.consume(approved.token);
      await agentAdapter.writeFile(
        space,
        resolution.path,
        JSON.stringify(validated.data, null, 2),
        resolution.token,
      );
    } catch (writeErr: any) {
      console.error("[spaces] Failed to write config file to space:", writeErr.message);
      // Config DB updated even if file write fails — space watcher will re-sync on next scan
    }

    return c.json({ space: updated });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to update config" }, 500);
  }
});

spacesRouter.delete("/:id", (c) => {
  try {
    requirePermission(c, "space:manage");
  } catch (err) {
    return c.json({ error: (err as Error).message }, 403);
  }
  const id = c.req.param("id");
  const deleted = deleteSpace(id);

  if (!deleted) {
    return c.json({ error: "Space not found" }, 404);
  }

  return c.json({ success: true });
});

export type SpacesRouter = typeof spacesRouter;
