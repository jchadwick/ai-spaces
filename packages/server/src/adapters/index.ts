import { config } from '../config.js';
import { LocalAgentAdapter } from './local-adapter.js';
import { OpenClawAgentAdapter } from './openclaw-adapter.js';

export type { AgentAdapter, FileNode } from './agent-adapter.js';

export function createAgentAdapter() {
  if (config.AGENT_RUNTIME === 'local') {
    return new LocalAgentAdapter();
  }
  return new OpenClawAgentAdapter();
}
