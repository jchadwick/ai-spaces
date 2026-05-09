import { OpenClawAgentAdapter } from './openclaw-adapter.js';

export type { AgentAdapter, FileNode } from './agent-adapter.js';

export function createAgentAdapter() {
  return new OpenClawAgentAdapter();
}
