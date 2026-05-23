/**
 * Pure workspace file operation functions.
 * Used by the ACP agent handler to serve workspace/* extension methods.
 */
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import mime from 'mime-types';
import type { FileNode, SpaceRole, FileMetadataEntry, SpaceMetadata } from '@ai-spaces/shared';
import { hasPermission, SpaceMetadataSchema } from '@ai-spaces/shared';
import { validatePath, isPathContained } from '../validation.js';
import { isInternalWorkspacePath } from './chat-policy.js';

const DEFAULT_MAX_DEPTH = 10;

interface QueueItem {
  dir: string;
  basePath: string;
  depth: number;
  parentChildren: FileNode[];
}

export async function listWorkspaceFiles(
  spaceRoot: string,
  role: SpaceRole,
  dirPath = '',
): Promise<FileNode[]> {
  const targetDir = dirPath ? path.join(spaceRoot, dirPath) : spaceRoot;
  const showInternalFiles = hasPermission(role, 'files:read-internal');

  try {
    await fsPromises.access(targetDir);
  } catch {
    return [];
  }

  const roots: FileNode[] = [];
  const queue: QueueItem[] = [{ dir: targetDir, basePath: dirPath, depth: 0, parentChildren: roots }];

  while (queue.length > 0) {
    const { dir, basePath, depth, parentChildren } = queue.shift()!;
    if (depth > DEFAULT_MAX_DEPTH) continue;

    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (!showInternalFiles && isInternalWorkspacePath(relativePath)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      try {
        if (entry.isSymbolicLink()) {
          const linkTarget = await fsPromises.readlink(fullPath);
          const resolved = path.resolve(dir, linkTarget);
          if (!isPathContained(resolved, spaceRoot)) continue;
        }

        const stats = await fsPromises.stat(fullPath);

        if (entry.isDirectory()) {
          const children: FileNode[] = [];
          nodes.push({ name: entry.name, path: relativePath, type: 'directory', children });
          queue.push({ dir: fullPath, basePath: relativePath, depth: depth + 1, parentChildren: children });
        } else {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    parentChildren.push(...nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    }));
  }

  return roots;
}

function detectContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (['.md', '.mdx'].includes(ext)) return 'text/markdown';
  return mime.lookup(filePath) || 'text/plain';
}

export async function readWorkspaceFile(
  spaceRoot: string,
  filePath: string,
  role: SpaceRole,
): Promise<{ content: string; contentType: string }> {
  const validation = validatePath(filePath, spaceRoot);
  if (!validation.valid) throw new Error('Access denied: path outside workspace');
  if (!hasPermission(role, 'files:read-internal') && isInternalWorkspacePath(filePath)) {
    throw new Error('Access denied');
  }

  const fullPath = validation.resolvedPath!;
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) throw new Error('Cannot read directory as file');

  const contentType = detectContentType(fullPath);
  const isBinary = /^(image|application\/pdf)/.test(contentType);

  const content = isBinary
    ? (await fsPromises.readFile(fullPath)).toString('base64')
    : await fsPromises.readFile(fullPath, 'utf-8');

  return { content, contentType };
}

export async function writeWorkspaceFile(
  spaceRoot: string,
  filePath: string,
  content: string,
  encoding: 'utf-8' | 'base64' = 'utf-8',
): Promise<void> {
  const validation = validatePath(filePath, spaceRoot);
  if (!validation.valid) throw new Error('Access denied: path outside workspace');

  const fullPath = validation.resolvedPath!;
  const dir = path.dirname(fullPath);
  await fsPromises.mkdir(dir, { recursive: true });

  const tmpPath = path.join(dir, '.' + path.basename(fullPath) + '.tmp');
  if (encoding === 'base64') {
    await fsPromises.writeFile(tmpPath, Buffer.from(content, 'base64'));
  } else {
    await fsPromises.writeFile(tmpPath, content, 'utf-8');
  }
  await fsPromises.rename(tmpPath, fullPath);
}

export async function deleteWorkspaceFile(spaceRoot: string, filePath: string): Promise<void> {
  const validation = validatePath(filePath, spaceRoot);
  if (!validation.valid) throw new Error('Access denied: path outside workspace');
  const fullPath = validation.resolvedPath!;
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
  if (!fromValidation.valid) throw new Error('Access denied: source path outside workspace');
  if (!toValidation.valid) throw new Error('Access denied: target path outside workspace');
  const toDir = path.dirname(toValidation.resolvedPath!);
  await fsPromises.mkdir(toDir, { recursive: true });
  await fsPromises.rename(fromValidation.resolvedPath!, toValidation.resolvedPath!);
}

export async function createWorkspaceDirectory(spaceRoot: string, dirPath: string): Promise<void> {
  const validation = validatePath(dirPath, spaceRoot);
  if (!validation.valid) throw new Error('Access denied: path outside workspace');
  await fsPromises.mkdir(validation.resolvedPath!, { recursive: true });
}

export async function deleteWorkspaceDirectory(spaceRoot: string, dirPath: string): Promise<void> {
  const validation = validatePath(dirPath, spaceRoot);
  if (!validation.valid) throw new Error('Access denied: path outside workspace');
  const fullPath = validation.resolvedPath!;
  if (!fs.existsSync(fullPath)) throw new Error(`Directory not found: ${dirPath}`);
  await fsPromises.rm(fullPath, { recursive: true, force: true });
}

export async function getWorkspaceMetadata(spaceRoot: string): Promise<SpaceMetadata> {
  const metadataPath = path.join(spaceRoot, '.space', 'metadata.json');
  try {
    const raw = await fsPromises.readFile(metadataPath, 'utf-8');
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
  const metadataPath = path.join(spaceRoot, '.space', 'metadata.json');
  await fsPromises.mkdir(path.dirname(metadataPath), { recursive: true });

  let existing: SpaceMetadata = { files: {} };
  try {
    const raw = await fsPromises.readFile(metadataPath, 'utf-8');
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

  await fsPromises.writeFile(metadataPath, JSON.stringify(merged, null, 2), 'utf-8');
}
