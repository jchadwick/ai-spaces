import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';
import { logger as rootLogger } from './logger.js';

const log = rootLogger.child({ component: 'preflight' });

type AgentWorkspace = { agentId: string; workspaceRoot: string };

export async function runPluginPreflightChecks(agentWorkspaces: AgentWorkspace[]): Promise<void> {
  const openclawConfigPath = path.join(config.OPENCLAW_HOME, '.openclaw', 'openclaw.json');
  if (!fs.existsSync(openclawConfigPath)) {
    throw new Error(`Preflight FAIL: openclaw config not found at ${openclawConfigPath}`);
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

  // Reachability check with short retries to fail fast on broken URLs/network aliases.
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${config.AI_SPACES_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        log.info({ url: config.AI_SPACES_URL, attempt }, 'Preflight: server reachable');
        return;
      }
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Preflight FAIL: could not reach ${config.AI_SPACES_URL}/health after 3 attempts (${lastError})`);
}
