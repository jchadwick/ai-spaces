import * as path from 'path';
import 'dotenv/config';

const HOME = process.env.HOME ?? '';
const AI_SPACES_DATA = process.env.AI_SPACES_DATA ?? path.join(HOME, '.ai-spaces');

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable "${name}" is not set.`);
  }
  return value;
}

export const config = {
  JWT_SECRET:         process.env.JWT_SECRET         ?? 'ai-spaces-dev-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'ai-spaces-refresh-secret-change-in-production',
  AI_SPACES_DATA,
  AI_SPACES_DB:       process.env.AI_SPACES_DB       ?? path.join(AI_SPACES_DATA, 'ai-spaces.db'),
  AI_SPACES_PORT:     parseInt(process.env.AI_SPACES_PORT ?? '3001', 10),
  GATEWAY_TOKEN:      process.env.GATEWAY_TOKEN      ?? 'secret',
  // WEB_DIST default assumes project at ~/ai-spaces — set explicitly in production
  WEB_DIST:           process.env.WEB_DIST           ?? path.join(HOME, 'ai-spaces', 'packages', 'web', 'dist'),
  INVITE_BASE_URL:    process.env.INVITE_BASE_URL    ?? 'http://localhost:5173',
  ALLOW_ORPHAN_COLLABORATORS: process.env.ALLOW_ORPHAN_COLLABORATORS === 'true',
  ALLOW_OPEN_REGISTRATION: process.env.ALLOW_OPEN_REGISTRATION === 'true',
  CONFIRMATION_NONCE_TTL_MS: parseInt(process.env.CONFIRMATION_NONCE_TTL_MS ?? '300000', 10),
};

export function assertProductionHttps(url: string, name: string): void {
  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
    throw new Error(`[config] ${name} must use HTTPS in production. Got: ${url}`);
  }
}
