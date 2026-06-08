/**
 * Pure workspace file operation functions.
 * Used by the ACP agent handler to serve workspace/* extension methods.
 */

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import type {
  FileMetadataEntry,
  FileNode,
  SpaceMetadata,
  WorkspacePathFacts,
} from "@ai-spaces/shared";
import { SpaceMetadataSchema } from "@ai-spaces/shared";
import mime from "mime-types";
import { isPathContained, validatePath } from "../validation.js";
import { isInternalWorkspacePath } from "./chat-policy.js";

const DEFAULT_MAX_DEPTH = 10;
const ACCESS_DENIED = "Access denied: path outside workspace";

interface QueueItem {
  dir: string;
  basePath: string;
  depth: number;
  parentChildren: FileNode[];
}

function getRealPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function isInternalResolvedPath(spaceRoot: string, fullPath: string): boolean {
  const realSpaceRoot = getRealPath(spaceRoot);
  const realPath = getRealPath(fullPath);
  if (!isPathContained(realPath, realSpaceRoot)) return false;
  const relative = path.relative(realSpaceRoot, realPath).split(path.sep).join("/");
  return isInternalWorkspacePath(relative);
}

function requireValidatedPath(
  validation: { valid: boolean; resolvedPath: string | null },
  message = ACCESS_DENIED,
): string {
  if (!validation.valid || !validation.resolvedPath) throw new Error(message);
  return validation.resolvedPath;
}

export async function listWorkspaceFiles(
  spaceRoot: string,
  includeHidden: boolean,
  dirPath = "",
): Promise<FileNode[]> {
  const validation = dirPath
    ? validatePath(dirPath, spaceRoot)
    : { valid: true, resolvedPath: spaceRoot };
  const targetDir = requireValidatedPath(validation);
  try {
    await fsPromises.access(targetDir);
  } catch {
    return [];
  }

  const roots: FileNode[] = [];
  const queue: QueueItem[] = [
    { dir: targetDir, basePath: dirPath, depth: 0, parentChildren: roots },
  ];
  const visitedDirs = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;
    const { dir, basePath, depth, parentChildren } = item;
    if (depth > DEFAULT_MAX_DEPTH) continue;

    try {
      const realDir = await fsPromises.realpath(dir);
      if (visitedDirs.has(realDir)) continue;
      visitedDirs.add(realDir);
    } catch {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (!includeHidden && isInternalWorkspacePath(relativePath)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      try {
        const entryValidation = validatePath(relativePath, spaceRoot);
        if (!entryValidation.valid || !entryValidation.resolvedPath) continue;
        if (!includeHidden && isInternalResolvedPath(spaceRoot, entryValidation.resolvedPath))
          continue;
        const stats = await fsPromises.stat(fullPath);

        if (stats.isDirectory()) {
          const children: FileNode[] = [];
          nodes.push({ name: entry.name, path: relativePath, type: "directory", children });
          queue.push({
            dir: entryValidation.resolvedPath,
            basePath: relativePath,
            depth: depth + 1,
            parentChildren: children,
          });
        } else {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "file",
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    parentChildren.push(
      ...nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    );
  }

  return roots;
}

function detectContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if ([".md", ".mdx"].includes(ext)) return "text/markdown";
  return mime.lookup(filePath) || "text/plain";
}

export async function getWorkspacePathFacts(
  spaceRoot: string,
  requestedPath: string,
): Promise<WorkspacePathFacts> {
  const canonicalRelativePath = requestedPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  const validation = canonicalRelativePath
    ? validatePath(canonicalRelativePath, spaceRoot)
    : { valid: true, resolvedPath: path.resolve(spaceRoot) };
  if (!validation.valid || !validation.resolvedPath) {
    return {
      requestedPath,
      canonicalRelativePath,
      targetType: "missing",
      exists: false,
      contained: false,
      hidden: isInternalWorkspacePath(canonicalRelativePath),
      symlinkEscaped: true,
    };
  }

  const stats = await fsPromises.stat(validation.resolvedPath).catch(() => null);
  const targetType = stats?.isDirectory() ? "directory" : stats ? "file" : "missing";
  return {
    requestedPath,
    canonicalRelativePath,
    targetType,
    exists: Boolean(stats),
    contained: true,
    hidden:
      isInternalWorkspacePath(canonicalRelativePath) ||
      isInternalResolvedPath(spaceRoot, validation.resolvedPath),
    symlinkEscaped: false,
    ...(stats?.isFile()
      ? { size: stats.size, contentType: detectContentType(validation.resolvedPath) }
      : {}),
  };
}

export async function readWorkspaceFile(
  spaceRoot: string,
  filePath: string,
): Promise<{ content: string; contentType: string }> {
  const validation = validatePath(filePath, spaceRoot);
  const fullPath = requireValidatedPath(validation);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) throw new Error("Cannot read directory as file");

  const contentType = detectContentType(fullPath);
  const isBinary = /^(image|application\/pdf)/.test(contentType);

  const content = isBinary
    ? (await fsPromises.readFile(fullPath)).toString("base64")
    : await fsPromises.readFile(fullPath, "utf-8");

  return { content, contentType };
}

export async function writeWorkspaceFile(
  spaceRoot: string,
  filePath: string,
  content: string,
  encoding: "utf-8" | "base64" = "utf-8",
): Promise<void> {
  const validation = validatePath(filePath, spaceRoot);
  const fullPath = requireValidatedPath(validation);
  const dir = path.dirname(fullPath);
  await fsPromises.mkdir(dir, { recursive: true });

  const tmpPath = path.join(dir, `.${path.basename(fullPath)}.tmp`);
  if (encoding === "base64") {
    await fsPromises.writeFile(tmpPath, Buffer.from(content, "base64"));
  } else {
    await fsPromises.writeFile(tmpPath, content, "utf-8");
  }
  await fsPromises.rename(tmpPath, fullPath);
}

export async function deleteWorkspaceFile(spaceRoot: string, filePath: string): Promise<void> {
  const validation = validatePath(filePath, spaceRoot);
  const fullPath = requireValidatedPath(validation);
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  await fsPromises.unlink(fullPath);
}

export async function renameWorkspacePath(
  spaceRoot: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const fromValidation = validatePath(fromPath, spaceRoot);
  const toValidation = validatePath(toPath, spaceRoot);
  const fromResolvedPath = requireValidatedPath(
    fromValidation,
    "Access denied: source path outside workspace",
  );
  const toResolvedPath = requireValidatedPath(
    toValidation,
    "Access denied: target path outside workspace",
  );
  const toDir = path.dirname(toResolvedPath);
  await fsPromises.mkdir(toDir, { recursive: true });
  await fsPromises.rename(fromResolvedPath, toResolvedPath);
}

export async function createWorkspaceDirectory(spaceRoot: string, dirPath: string): Promise<void> {
  const validation = validatePath(dirPath, spaceRoot);
  await fsPromises.mkdir(requireValidatedPath(validation), { recursive: true });
}

export async function deleteWorkspaceDirectory(spaceRoot: string, dirPath: string): Promise<void> {
  const validation = validatePath(dirPath, spaceRoot);
  const fullPath = requireValidatedPath(validation);
  if (!fs.existsSync(fullPath)) throw new Error(`Directory not found: ${dirPath}`);
  await fsPromises.rm(fullPath, { recursive: true, force: true });
}

export async function getWorkspaceMetadata(spaceRoot: string): Promise<SpaceMetadata> {
  const metadataPath = path.join(spaceRoot, ".space", "metadata.json");
  try {
    const raw = await fsPromises.readFile(metadataPath, "utf-8");
    const parsed = SpaceMetadataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { files: {} };
  } catch {
    return { files: {} };
  }
}

export async function patchWorkspaceMetadata(
  spaceRoot: string,
  filesPatch: Record<string, Partial<FileMetadataEntry>>,
): Promise<void> {
  const metadataPath = path.join(spaceRoot, ".space", "metadata.json");
  await fsPromises.mkdir(path.dirname(metadataPath), { recursive: true });

  let existing: SpaceMetadata = { files: {} };
  try {
    const raw = await fsPromises.readFile(metadataPath, "utf-8");
    const parsed = SpaceMetadataSchema.safeParse(JSON.parse(raw));
    if (parsed.success) existing = parsed.data;
  } catch {
    // start fresh
  }

  const merged: SpaceMetadata = {
    files: { ...existing.files },
  };

  for (const [filePath, patch] of Object.entries(filesPatch)) {
    const keyValidation = validatePath(filePath, spaceRoot);
    if (!keyValidation.valid) continue; // skip invalid paths
    if (patch === null || Object.keys(patch).length === 0) {
      delete merged.files[filePath];
    } else {
      merged.files[filePath] = { ...existing.files[filePath], ...patch } as FileMetadataEntry;
    }
  }

  await fsPromises.writeFile(metadataPath, JSON.stringify(merged, null, 2), "utf-8");
}
