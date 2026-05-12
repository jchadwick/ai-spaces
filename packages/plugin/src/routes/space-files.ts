import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream';
import mime from 'mime-types';
import type { FileNode, SpaceRole } from '@ai-spaces/shared';
import { hasPermission } from '@ai-spaces/shared';
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