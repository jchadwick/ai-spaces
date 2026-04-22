import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { FileNode, Role } from '@ai-spaces/shared';
import { validatePath, isPathContained } from '../validation.js';
import { logPathEscapeAttempt, logFileAccess } from '../audit-logger.js';
import { validateSession } from '../session-middleware.js';
import { getSpace, resolveSpaceRoot, type SpaceRecord } from '../space-store.js';

const DEFAULT_MAX_DEPTH = 10;

interface QueueItem {
  dir: string;
  basePath: string;
  depth: number;
  parentChildren: FileNode[];
}

async function buildFileTree(
  dir: string,
  basePath: string,
  hideSpaceFolder: boolean,
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
      if (hideSpaceFolder && entry.name === '.space') {
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

function detectContentType(filePath: string): 'markdown' | 'text' | 'image' | 'binary' {
  const ext = path.extname(filePath).toLowerCase();
  
  const markdownExts = ['.md', '.markdown'];
  if (markdownExts.includes(ext)) {
    return 'markdown';
  }
  
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];
  if (imageExts.includes(ext)) {
    return 'image';
  }
  
  const textExts = ['.txt', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.yml', '.yaml', '.xml', '.csv', '.log', '.sh', '.bash', '.zsh', '.env', '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc', '.eslintrc', '.babelrc'];
  if (textExts.includes(ext)) {
    return 'text';
  }
  
  const binaryExts = ['.exe', '.bin', '.dll', '.so', '.dylib', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar'];
  if (binaryExts.includes(ext)) {
    return 'binary';
  }
  
  return 'text';
}

function getClientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress;
}

export async function handleFileTree(req: IncomingMessage, res: ServerResponse, spaceId: string, role: Role) {
  const space = getSpace(spaceId);
  
  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }
  
  const spaceRoot = resolveSpaceRoot(space);
  const hideSpaceFolder = role !== 'admin';
  
  const files = await buildFileTree(spaceRoot, '', hideSpaceFolder, spaceRoot);
  
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
    
    if (contentType === 'binary') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        path: filePath,
        contentType,
        size,
        modified,
      }));
      return true;
    }
    
    if (contentType === 'image') {
      const imageBuffer = fs.readFileSync(fullPath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = getMimeType(fullPath);
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        path: filePath,
        content: base64,
        contentType,
        mimeType,
        size,
        modified,
      }));
      return true;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({
      path: filePath,
      content,
      contentType,
      size,
      modified,
    }));
    return true;
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Failed to read file' }));
    return true;
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}