import * as path from 'path';

const HOME = process.env.HOME ?? '';

const parseList = (value: string | undefined, defaults: string[]): string[] =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : defaults;

function mustBeValidHttpUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL, got '${value}'`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https, got '${parsed.protocol}'`);
  }
  return value;
}

function mustBeAbsolutePath(value: string, name: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path, got '${value}'`);
  }
  return value;
}

export const config = {
  OPENCLAW_HOME: mustBeAbsolutePath(process.env.OPENCLAW_HOME ?? '/home/node', 'OPENCLAW_HOME'),
  JWT_SECRET:     process.env.JWT_SECRET     ?? 'ai-spaces-dev-secret-change-in-production',
  AI_SPACES_ROOT: process.env.AI_SPACES_ROOT ?? path.join(HOME, 'ai-spaces-workspace'),
  AI_SPACES_URL: mustBeValidHttpUrl(process.env.AI_SPACES_URL ?? 'http://127.0.0.1:3001', 'AI_SPACES_URL'),
  AI_SPACES_WS_PORT: parseInt(process.env.AI_SPACES_WS_PORT ?? '3002', 10),
  AI_SPACES_PLUGIN_STATE_FILE: process.env.AI_SPACES_PLUGIN_STATE_FILE
    ?? path.join(process.env.OPENCLAW_HOME ?? '/home/node', 'ai-spaces-registration.json'),
  GATEWAY_TOKEN: process.env.GATEWAY_TOKEN ?? '',
  PLUGIN_URL: process.env.PLUGIN_URL,
  DEFAULT_DENIED_TOOLS: parseList(process.env.AI_SPACES_DENIED_TOOLS, ['exec', 'messaging', 'spawn_agents', 'browser', 'credentials']),
  DEFAULT_ALLOWED_TOOLS: parseList(process.env.AI_SPACES_ALLOWED_TOOLS, ['read', 'write', 'edit', 'glob']),
  MAX_FILE_SIZE_MB: parseFloat(process.env.MAX_FILE_SIZE_MB ?? '10'),
  FILE_STREAM_THRESHOLD_MB: parseFloat(process.env.FILE_STREAM_THRESHOLD_MB ?? '1'),
};

if (!config.GATEWAY_TOKEN) {
  throw new Error('GATEWAY_TOKEN is required for ai-spaces plugin startup');
}
