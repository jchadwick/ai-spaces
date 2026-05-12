import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream';
import mime from 'mime-types';
import type { FileNode, SpaceRole, FileMetadataEntry } from '@ai-spaces/shared';
import { hasPermission, SpaceMetadataSchema } from '@ai-spaces/shared';
import { validatePath, isPathContained } from '../validation.js';
import { logPathEscapeAttempt, logFileAccess } from '../audit-logger.js';
import { validateSession } from '../session-middleware.js';
import { getSpace, resolveSpaceRoot, type SpaceRecord } from '../space-store.js';

const DEFAULT_MAX_DEPTH = 10;

const AGENT_INTERNAL_FILES = new Set([
  'AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'MEMORY.md', 'TOOLS.md', 'USER.md', 'HEARTBEAT.md',
]);

interface QueueItem {
  dir: string;
  basePath: string;
  depth: number;
  parentChildren: FileNode[];
}

async function buildFileTree(
  dir: string,
  basePath: string,
  showInternalFiles: boolean,
  spaceRoot: string,
  maxDepth = DEFAULT_MAX_DEPTH,
): Promise<FileNode[]> {
  try {
    await fsPromises.access(dir);
  } catch {
    return [];
  }

  const roots: FileNode[] = [];
  const queue: QueueItem[] = [{ dir, basePath, depth: 0, parentChildren: roots }];

  while (queue.length > 0) {
    const { dir: currentDir, basePath: currentBase, depth, parentChildren } = queue.shift()!;

    if (depth > maxDepth) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (!showInternalFiles && (entry.name === '.space' || AGENT_INTERNAL_FILES.has(entry.name))) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = currentBase ? `${currentBase}/${entry.name}` : entry.name;

      try {
        if (entry.isSymbolicLink()) {
          const linkTarget = await fsPromises.readlink(fullPath);
          const resolvedTarget = path.resolve(currentDir, linkTarget);

          if (!isPathContained(resolvedTarget, spaceRoot)) {
            continue;
          }
        }

        const stats = await fsPromises.stat(fullPath);

        if (entry.isDirectory()) {
          const children: FileNode[] = [];
          nodes.push({
            name: entry.name,
            type: 'directory',
            path: relativePath,
            children,
            modified: stats.mtime.toISOString(),
          });
          if (depth < maxDepth) {
            queue.push({ dir: fullPath, basePath: relativePath, depth: depth + 1, parentChildren: children });
          }
        } else {
          nodes.push({
            name: entry.name,
            type: 'file',
            path: relativePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        }
      } catch {}
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    parentChildren.push(...nodes);
  }

  return roots;
}

function detectContentType(filePath: string): 'markdown' | 'text' | 'image' | 'binary' | 'pdf' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.pdf') return 'pdf';

  const mimeType = mime.lookup(filePath);
  if (!mimeType) return 'text';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/octet-stream') return 'binary';
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') return 'text';

  return 'text';
}

function getClientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress;
}

export async function handleFileTree(req: IncomingMessage, res: ServerResponse, spaceId: string, role: SpaceRole) {
  const space = getSpace(spaceId);

  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }

  const spaceRoot = resolveSpaceRoot(space);
  const showInternalFiles = hasPermission(role, 'files:read-internal');

  const files = await buildFileTree(spaceRoot, '', showInternalFiles, spaceRoot);
  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ files }));
  return true;
}

export async function handleFileContent(req: IncomingMessage, res: ServerResponse, spaceId: string, filePath: string) {
  const space = getSpace(spaceId);
  
  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }
  
  const spaceRoot = resolveSpaceRoot(space);
  const clientIp = getClientIp(req);
  const validation = validatePath(filePath, spaceRoot);
  
  if (!validation.valid) {
    logPathEscapeAttempt(spaceId, filePath, validation.resolvedPath, undefined, clientIp);
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Access denied' }));
    return true;
  }
  
  const fullPath = validation.resolvedPath!;
  
  const payload = validateSession(req);
  const userId = payload?.userId as string | undefined;
  if (userId) {
    logFileAccess(spaceId, userId, filePath, 'read');
  }
  
  if (!fs.existsSync(fullPath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'File not found' }));
    return true;
  }
  
  try {
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: 'Cannot read directory content' }));
      return true;
    }
    
    const contentType = detectContentType(fullPath);
    const size = stats.size;
    const modified = stats.mtime.toISOString();
    const httpContentType = getHttpContentType(fullPath, contentType);

    res.statusCode = 200;
    res.setHeader('Content-Type', httpContentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-File-Content-Type', contentType);
    res.setHeader('X-File-Modified', modified);
    res.setHeader('X-File-Size', String(size));

    if (contentType === 'markdown') {
      const frontmatterTitle = await extractFrontmatterTitle(fullPath);
      if (frontmatterTitle) {
        res.setHeader('X-File-Frontmatter-Title', frontmatterTitle);
      }
    }

    await new Promise<void>((resolve, reject) => {
      pipeline(fs.createReadStream(fullPath), res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch((err: Error) => {
      console.error('[ai-spaces] File stream error:', err.message);
    });
    return true;
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Failed to read file' }));
    return true;
  }
}

export async function handleFileWrite(req: IncomingMessage, res: ServerResponse, spaceId: string, filePath: string) {
  const space = getSpace(spaceId);

  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }

  const spaceRoot = resolveSpaceRoot(space);
  const validation = validatePath(filePath, spaceRoot);

  if (!validation.valid) {
    logPathEscapeAttempt(spaceId, filePath, validation.resolvedPath, undefined, getClientIp(req));
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Access denied' }));
    return true;
  }

  const fullPath = validation.resolvedPath!;

  try {
    const body = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

    const { content, encoding } = JSON.parse(body) as { content: string; encoding?: 'utf-8' | 'base64' };

    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });

    if (encoding === 'base64') {
      await fsPromises.writeFile(fullPath, Buffer.from(content, 'base64'));
    } else {
      await fsPromises.writeFile(fullPath, content, 'utf8');
    }

    const stats = await fsPromises.stat(fullPath);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ success: true, path: filePath, modified: stats.mtime.toISOString() }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: `Failed to write file: ${(error as Error).message}` }));
  }
  return true;
}

async function extractFrontmatterTitle(fullPath: string): Promise<string | null> {
  try {
    const fd = await fsPromises.open(fullPath, 'r');
    const buffer = Buffer.alloc(2048);
    const { bytesRead } = await fd.read(buffer, 0, 2048, 0);
    await fd.close();
    const chunk = buffer.subarray(0, bytesRead).toString('utf8');
    if (!chunk.startsWith('---')) return null;
    const end = chunk.indexOf('\n---', 3);
    if (end === -1) return null;
    const frontmatter = chunk.slice(3, end);
    const match = frontmatter.match(/^title:\s*(.+)$/m);
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
  } catch {
    return null;
  }
}

function getMimeType(filePath: string): string {
  return mime.lookup(filePath) || 'application/octet-stream';
}

function getHttpContentType(filePath: string, contentType: 'markdown' | 'text' | 'image' | 'binary' | 'pdf'): string {
  if (contentType === 'image') return getMimeType(filePath);
  if (contentType === 'binary') return 'application/octet-stream';
  if (contentType === 'pdf') return 'application/pdf';
  if (contentType === 'markdown') return 'text/markdown; charset=utf-8';

  const mimeType = mime.lookup(filePath);
  if (mimeType && (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml')) {
    return mimeType.startsWith('text/') ? `${mimeType}; charset=utf-8` : mimeType;
  }
  return 'text/plain; charset=utf-8';
}

export async function handleGetMetadata(req: IncomingMessage, res: ServerResponse, spaceId: string): Promise<boolean> {
  const space = getSpace(spaceId);

  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }

  const spaceRoot = resolveSpaceRoot(space);
  const metadataPath = path.join(spaceRoot, '.space', 'metadata.json');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const raw = await fsPromises.readFile(metadataPath, 'utf8');
    const json = JSON.parse(raw);
    const parsed = SpaceMetadataSchema.safeParse(json);
    res.end(JSON.stringify(parsed.success ? parsed.data : { files: {} }));
  } catch {
    res.end(JSON.stringify({ files: {} }));
  }
  return true;
}

export async function handlePatchMetadata(req: IncomingMessage, res: ServerResponse, spaceId: string): Promise<boolean> {
  const space = getSpace(spaceId);

  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }

  const spaceRoot = resolveSpaceRoot(space);

  let body: string;
  try {
    body = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Failed to read request body' }));
    return true;
  }

  let patch: { files: Record<string, Partial<FileMetadataEntry>> };
  try {
    patch = JSON.parse(body) as { files: Record<string, Partial<FileMetadataEntry>> };
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return true;
  }

  if (!patch.files || typeof patch.files !== 'object') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid request: files field required' }));
    return true;
  }

  // Security: validate all path keys
  for (const key of Object.keys(patch.files)) {
    const validation = validatePath(key, spaceRoot);
    if (!validation.valid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: `Invalid path key: ${key}` }));
      return true;
    }
  }

  const spaceDir = path.join(spaceRoot, '.space');
  const metadataPath = path.join(spaceDir, 'metadata.json');
  const metadataTmpPath = path.join(spaceDir, 'metadata.tmp');

  // Read existing metadata
  let existing = { files: {} as Record<string, Partial<FileMetadataEntry>> };
  try {
    const raw = await fsPromises.readFile(metadataPath, 'utf8');
    const json = JSON.parse(raw);
    const parsed = SpaceMetadataSchema.safeParse(json);
    if (parsed.success) {
      existing = parsed.data;
    }
  } catch {
    // Use empty default
  }

  // Merge patch
  for (const [key, value] of Object.entries(patch.files)) {
    existing.files[key] = { ...existing.files[key], ...value };
  }

  // Atomic write
  try {
    await fsPromises.mkdir(spaceDir, { recursive: true });
    await fsPromises.writeFile(metadataTmpPath, JSON.stringify(existing, null, 2), 'utf8');
    await fsPromises.rename(metadataTmpPath, metadataPath);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: `Failed to write metadata: ${(error as Error).message}` }));
    return true;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ success: true }));
  return true;
}