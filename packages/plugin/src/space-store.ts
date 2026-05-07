import * as fs from 'fs';
import * as path from 'path';
import type { SpaceConfig } from '@ai-spaces/shared';
import { SpaceConfigSchema, scanWorkspace, resolveSpaceRoot as sharedResolveSpaceRoot, getAgentWorkspace as sharedGetAgentWorkspace } from '@ai-spaces/shared';
import type { WorkspaceSpaceRecord } from '@ai-spaces/shared';
import { config } from './config.js';

export type SpaceRecord = WorkspaceSpaceRecord;

export { WorkspaceSpaceRecord };

export function resolveSpaceRoot(space: SpaceRecord): string {
  return sharedResolveSpaceRoot(config.OPENCLAW_HOME, space);
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

  return agentNames.flatMap(name => scanWorkspace(openclawHome, sharedGetAgentWorkspace(openclawHome, name), name));
}

export function getSpace(id: string): SpaceRecord | null {
  return getAllSpaces().find(s => s.id === id) ?? null;
}

export function listSpaces(agentId?: string): SpaceRecord[] {
  const all = getAllSpaces();
  return agentId ? all.filter(s => s.agentId === agentId) : all;
}
