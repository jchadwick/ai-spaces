import * as path from 'path';
import 'dotenv/config';

const HOME = process.env.HOME ?? '';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable "${name}" is not set.`);
  }
  return value;
}

export const config = {
  get OPENCLAW_HOME(): string { return required('OPENCLAW_HOME'); },
  JWT_SECRET:         process.env.JWT_SECRET         ?? 'ai-spaces-dev-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'ai-spaces-refresh-secret-change-in-production',
  AI_SPACES_DATA:     process.env.AI_SPACES_DATA     ?? path.join(HOME, '.ai-spaces'),
  AI_SPACES_ROOT:     process.env.AI_SPACES_ROOT     ?? path.join(HOME, 'ai-spaces-workspace'),
  AI_SPACES_DB:       process.env.AI_SPACES_DB       ?? '.ai-spaces.db',
  AI_SPACES_PORT:     parseInt(process.env.AI_SPACES_PORT ?? '3001', 10),
  GATEWAY_URL:        process.env.GATEWAY_URL        ?? 'http://localhost:19000',
  GATEWAY_TOKEN:      process.env.GATEWAY_TOKEN      ?? 'secret',
  // Plugin's dedicated WebSocket server (bypasses gateway control protocol)
  PLUGIN_WS_URL:      process.env.PLUGIN_WS_URL      ?? 'ws://127.0.0.1:3002',
  // WEB_DIST default assumes project at ~/ai-spaces — set explicitly in production
  WEB_DIST:           process.env.WEB_DIST           ?? path.join(HOME, 'ai-spaces', 'packages', 'web', 'dist'),
  GROQ_API_KEY:       process.env.GROQ_API_KEY as string | undefined,
};
