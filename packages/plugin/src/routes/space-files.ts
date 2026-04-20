import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { FileNode, Role } from '@ai-spaces/shared';
import { validatePath, isPathContained } from '../validation.js';
import { logPathEscapeAttempt, logFileAccess } from '../audit-logger.js';
import { validateSession } from '../session-middleware.js';
import { config } from '../config.js';

interface SpaceConfig {
  name: string;
  description?: string;
  collaborators?: string[];
  agent?: {
    capabilities?: string[];
    denied?: string[];
  };
}

interface DiscoveredSpace {
  id: string;
  agentName: string;
  spaceName: string;
  spacePath: string;
  configPath: string;
  config: SpaceConfig;
}

function generateSpaceId(agentName: string, spacePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${agentName}:${spacePath}`);
  const hex = hash.digest('hex');
  return hex.slice(0, 8);
}

async function findSpaceById(spaceId: string): Promise<DiscoveredSpace | null> {
  const openclawHome = config.OPENCLAW_HOME;
  const agentsHome = path.join(openclawHome, 'agents');
  
  if (!fs.existsSync(agentsHome)) {
    return null;
  }
  
  const agentDirs = fs.readdirSync(agentsHome, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  for (const agentName of agentDirs) {
    let workspacePath: string;
    
    if (agentName === 'main') {
      workspacePath = path.join(openclawHome, 'workspace');
    } else {
      const agentFile = path.join(agentsHome, agentName, 'agent.json');
      let workspace = null;
      if (fs.existsSync(agentFile)) {
        try {
          const agentData = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
          workspace = agentData.workspace || null;
        } catch {}
      }
      workspacePath = workspace || path.join(openclawHome, 'workspace', agentName);
    }
    
    const space = await scanForSpace(workspacePath, agentName, spaceId);
    if (space) {
      return space;
    }
  }
  
  return null;
}

async function scanForSpace(dir: string, agentName: string, targetId: string, relativePath: string = ''): Promise<DiscoveredSpace | null> {
  if (!fs.existsSync(dir)) {
    return null;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const spaceDir = path.join(dir, entry.name);
      const spaceConfigPath = path.join(spaceDir, '.space', 'spaces.json');
      
      if (fs.existsSync(spaceConfigPath)) {
        try {
          const configContent = fs.readFileSync(spaceConfigPath, 'utf-8');
          const config: SpaceConfig = JSON.parse(configContent);
          const spacePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const id = generateSpaceId(agentName, spacePath);
          
          if (id === targetId) {
            return {
              id,
              agentName,
              spaceName: config.name || entry.name,
              spacePath,
              configPath: spaceConfigPath,
              config,
            };
          }
        } catch {}
      }
      
      const found = await scanForSpace(spaceDir, agentName, targetId, relativePath ? `${relativePath}/${entry.name}` : entry.name);
      if (found) return found;
    }
  }
  
  return null;
}

function buildFileTree(dir: string, basePath: string, hideSpaceFolder: boolean, spaceRoot: string): FileNode[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];
  
  for (const entry of entries) {
    if (hideSpaceFolder && entry.name === '.space') {
      continue;
    }
    
    const fullPath = path.join(dir, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    
    try {
      if (entry.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(fullPath);
        const resolvedTarget = path.resolve(dir, linkTarget);
        
        if (!isPathContained(resolvedTarget, spaceRoot)) {
          continue;
        }
      }
      
      const stats = fs.statSync(fullPath);
      
      if (entry.isDirectory()) {
        const children = buildFileTree(fullPath, relativePath, hideSpaceFolder, spaceRoot);
        nodes.push({
          name: entry.name,
          type: 'directory',
          path: relativePath,
          children,
          modified: stats.mtime.toISOString(),
        });
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
  
  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
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

function getSpaceRootPath(space: DiscoveredSpace): string {
  const openclawHome = config.OPENCLAW_HOME;
  
  if (space.agentName === 'main') {
    return path.join(openclawHome, 'workspace', space.spacePath);
  }
  
  const agentsHome = path.join(openclawHome, 'agents');
  const agentFile = path.join(agentsHome, space.agentName, 'agent.json');
  
  if (fs.existsSync(agentFile)) {
    try {
      const agentData = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
      if (agentData.workspace) {
        return path.join(agentData.workspace, space.spacePath);
      }
    } catch {}
  }
  
  return path.join(openclawHome, 'workspace', space.agentName, space.spacePath);
}

export async function handleFileTree(req: IncomingMessage, res: ServerResponse, spaceId: string, role: Role) {
  const space = await findSpaceById(spaceId);
  
  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }
  
  const spaceRoot = getSpaceRootPath(space);
  const hideSpaceFolder = role !== 'admin';
  
  const files = buildFileTree(spaceRoot, '', hideSpaceFolder, spaceRoot);
  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ files }));
  return true;
}

export async function handleFileContent(req: IncomingMessage, res: ServerResponse, spaceId: string, filePath: string) {
  const space = await findSpaceById(spaceId);
  
  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }
  
  const spaceRoot = getSpaceRootPath(space);
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