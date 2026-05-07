import * as path from 'path';
import { scanWorkspace, getAgentWorkspace } from '@ai-spaces/shared';
import { listSpaces, deleteSpace, insertSpace } from './space-store.js';
import { config } from './config.js';
import * as fs from 'fs';

export async function reconcileSpaces(agentId: string, workspaceRoot: string): Promise<void> {
  const diskSpaces = scanWorkspace(config.OPENCLAW_HOME, workspaceRoot, agentId);
  const dbSpaces = listSpaces(agentId);

  const diskById = new Map(diskSpaces.map(s => [s.id, s]));
  const dbById = new Map(dbSpaces.map(s => [s.id, s]));

  // Spaces on disk not in DB → register them
  for (const [id, diskSpace] of diskById) {
    if (!dbById.has(id)) {
      const now = new Date().toISOString();
      insertSpace({
        id: diskSpace.id,
        agentId: diskSpace.agentId,
        agentType: diskSpace.agentType,
        path: diskSpace.path,
        configPath: diskSpace.configPath,
        config: diskSpace.config,
        createdAt: now,
        updatedAt: now,
      });
      console.info(`[reconcile] Registered missing space: ${id} at ${diskSpace.path}`);
    }
  }

  // Spaces in DB not on disk → remove zombie entries
  for (const [id, dbSpace] of dbById) {
    if (!diskById.has(id)) {
      deleteSpace(id, 'system');
      console.info(`[reconcile] Removed zombie space: ${id} (path: ${dbSpace.path})`);
    }
  }

  // Spaces in both with differing path → update path in DB
  for (const [id, diskSpace] of diskById) {
    const dbSpace = dbById.get(id);
    if (dbSpace && dbSpace.path !== diskSpace.path) {
      const now = new Date().toISOString();
      insertSpace({
        id: diskSpace.id,
        agentId: diskSpace.agentId,
        agentType: diskSpace.agentType,
        path: diskSpace.path,
        configPath: diskSpace.configPath,
        config: diskSpace.config,
        createdAt: dbSpace.createdAt,
        updatedAt: now,
      });
      console.info(`[reconcile] Updated path for space: ${id} ${dbSpace.path} → ${diskSpace.path}`);
    }
  }
}

export async function reconcileAllAgents(): Promise<void> {
  const openclawHome = config.OPENCLAW_HOME;
  const agentsHome = path.join(openclawHome, 'agents');

  // Always reconcile the main workspace
  const mainWorkspaceRoot = getAgentWorkspace(openclawHome, 'main');
  try {
    await reconcileSpaces('main', mainWorkspaceRoot);
  } catch (err) {
    console.error('[reconcile] Failed to reconcile main workspace:', err instanceof Error ? err.message : String(err));
  }

  // Reconcile all agent workspaces
  if (!fs.existsSync(agentsHome)) return;

  let agentNames: string[];
  try {
    agentNames = fs.readdirSync(agentsHome, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'main')
      .map(e => e.name);
  } catch (err) {
    console.error('[reconcile] Failed to read agents directory:', err instanceof Error ? err.message : String(err));
    return;
  }

  for (const agentName of agentNames) {
    const workspaceRoot = getAgentWorkspace(openclawHome, agentName);
    try {
      await reconcileSpaces(agentName, workspaceRoot);
    } catch (err) {
      console.error(`[reconcile] Failed to reconcile agent ${agentName}:`, err instanceof Error ? err.message : String(err));
    }
  }
}
