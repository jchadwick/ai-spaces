import * as fs from 'fs';
import * as path from 'path';
import type { SpaceConfig } from '../types.js';
import { SpaceConfigSchema } from '../schemas.js';

export interface WorkspaceSpaceRecord {
  id: string;
  agentId: string;
  agentType: string;
  path: string;
  configPath: string;
  config: SpaceConfig;
}

export function computeSpaceId(_agentId: string, relativePath: string): string {
  return relativePath
    .toLowerCase()
    .replace(/[\s/\\]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

export function getAgentWorkspace(openclawHome: string, agentName: string): string {
  if (agentName === 'main') {
    return path.join(openclawHome, 'workspace');
  }
  const agentFile = path.join(openclawHome, 'agents', agentName, 'agent.json');
  if (fs.existsSync(agentFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
      if (data.workspace) return data.workspace;
    } catch {}
  }
  return path.join(openclawHome, 'workspace', agentName);
}

export function scanWorkspace(openclawHome: string, workspaceDir: string, agentName: string): WorkspaceSpaceRecord[] {
  const results: WorkspaceSpaceRecord[] = [];
  if (!fs.existsSync(workspaceDir)) return results;

  function scan(dir: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') {
        console.warn(`[scanWorkspace] Permission denied reading directory: ${dir}`);
      } else {
        console.error(`[scanWorkspace] Failed to read directory: ${dir}`, err);
      }
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const childDir = path.join(dir, entry.name);
      const configPath = path.join(childDir, '.space', 'spaces.json');

      if (fs.existsSync(configPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          const parsed = SpaceConfigSchema.safeParse(raw);
          if (parsed.success) {
            results.push({
              id: computeSpaceId(agentName, childRelPath),
              agentId: agentName,
              agentType: agentName === 'main' ? 'main' : 'agent',
              path: childRelPath,
              configPath,
              config: parsed.data,
            });
          } else {
            console.warn(
              `[scanWorkspace] Schema validation failed for ${configPath}:`,
              parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
            );
          }
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'EACCES' || code === 'EPERM') {
            console.warn(`[scanWorkspace] Permission denied reading config: ${configPath}`);
          } else {
            console.error(`[scanWorkspace] Failed to load space config: ${configPath}`, err);
          }
        }
      }

      scan(childDir, childRelPath);
    }
  }

  scan(workspaceDir, '');
  return results;
}

export function resolveSpaceRoot(openclawHome: string, space: { agentId: string; path: string }): string {
  if (space.agentId === 'main') {
    return path.join(openclawHome, 'workspace', space.path);
  }

  const agentFile = path.join(openclawHome, 'agents', space.agentId, 'agent.json');
  if (fs.existsSync(agentFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
      if (data.workspace) return path.join(data.workspace, space.path);
    } catch {}
  }

  return path.join(openclawHome, 'workspace', space.agentId, space.path);
}
