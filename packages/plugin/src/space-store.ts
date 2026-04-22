import * as fs from 'fs';
import * as path from 'path';
import type { SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema } from '@ai-spaces/shared';
import { computeSpaceId } from './space-id.js';
import { config } from './config.js';

export interface SpaceRecord {
  id: string;
  agentId: string;
  agentType: string;
  path: string;       // relative path from agent workspace root
  configPath: string; // absolute path to .space/spaces.json
  config: SpaceConfig;
}

function getAgentWorkspace(agentName: string): string {
  const openclawHome = config.OPENCLAW_HOME;
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

function scanWorkspace(workspaceDir: string, agentName: string): SpaceRecord[] {
  const results: SpaceRecord[] = [];
  if (!fs.existsSync(workspaceDir)) return results;

  function scan(dir: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

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
          }
        } catch {}
      }

      scan(childDir, childRelPath);
    }
  }

  scan(workspaceDir, '');
  return results;
}

function getAllSpaces(): SpaceRecord[] {
  const openclawHome = config.OPENCLAW_HOME;
  const agentsHome = path.join(openclawHome, 'agents');

  if (!fs.existsSync(agentsHome)) return [];

  let agentNames: string[];
  try {
    agentNames = fs.readdirSync(agentsHome, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch { return []; }

  return agentNames.flatMap(name => scanWorkspace(getAgentWorkspace(name), name));
}

export function resolveSpaceRoot(space: SpaceRecord): string {
  const openclawHome = config.OPENCLAW_HOME;

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

export function getSpace(id: string): SpaceRecord | null {
  return getAllSpaces().find(s => s.id === id) ?? null;
}

export function listSpaces(agentId?: string): SpaceRecord[] {
  const all = getAllSpaces();
  return agentId ? all.filter(s => s.agentId === agentId) : all;
}
