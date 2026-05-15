import * as fs from 'fs';
import { config } from './config.js';
import { logger as rootLogger } from './logger.js';

const log = rootLogger.child({ component: 'preflight' });

type AgentWorkspace = { agentId: string; workspaceRoot: string };

export async function runPluginPreflightChecks(agentWorkspaces: AgentWorkspace[]): Promise<void> {
  // Check GATEWAY_TOKEN is set
  if (!config.GATEWAY_TOKEN) {
    throw new Error('Preflight FAIL: GATEWAY_TOKEN is not set');
  }

  // Check workspace roots are readable
  for (const { agentId, workspaceRoot } of agentWorkspaces) {
    try {
      fs.accessSync(workspaceRoot, fs.constants.R_OK);
      log.info({ agentId, workspaceRoot }, 'Preflight: workspace root readable');
    } catch {
      log.warn({ agentId, workspaceRoot }, 'Preflight WARN: workspace root not readable');
    }
  }

  // Best-effort server reachability check (warn, don't fail — server may start after plugin)
  try {
    const res = await fetch(`${config.AI_SPACES_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      log.info({ url: config.AI_SPACES_URL }, 'Preflight: server reachable');
    } else {
      log.warn({ url: config.AI_SPACES_URL, status: res.status }, 'Preflight WARN: server returned non-ok status');
    }
  } catch {
    log.warn({ url: config.AI_SPACES_URL }, 'Preflight WARN: server not reachable (will retry during registration)');
  }
}
