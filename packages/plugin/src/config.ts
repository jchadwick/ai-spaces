import * as path from 'path';

const HOME = process.env.HOME ?? '';

const parseList = (value: string | undefined, defaults: string[]): string[] =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : defaults;

export const config = {
  get OPENCLAW_HOME(): string {
    const value = process.env.OPENCLAW_HOME;
    if (!value) {
      throw new Error(`Required environment variable "OPENCLAW_HOME" is not set.`);
    }
    return value;
  },
  JWT_SECRET:     process.env.JWT_SECRET     ?? 'ai-spaces-dev-secret-change-in-production',
  AI_SPACES_ROOT: process.env.AI_SPACES_ROOT ?? path.join(HOME, 'ai-spaces-workspace'),
  AI_SPACES_URL:  process.env.AI_SPACES_URL  ?? 'http://127.0.0.1:3001',
  AI_SPACES_WS_PORT: parseInt(process.env.AI_SPACES_WS_PORT ?? '3002', 10),
  GATEWAY_URL:   process.env.OPENCLAW_GATEWAY_URL   ?? 'http://127.0.0.1:19000',
  GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN ?? 'secret-token',
  DEFAULT_DENIED_TOOLS: parseList(process.env.AI_SPACES_DENIED_TOOLS, ['exec', 'messaging', 'spawn_agents', 'browser', 'credentials']),
  DEFAULT_ALLOWED_TOOLS: parseList(process.env.AI_SPACES_ALLOWED_TOOLS, ['read', 'write', 'edit', 'glob']),
};
