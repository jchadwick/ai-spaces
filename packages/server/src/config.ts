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
  AI_SPACES_AGENT_BASE_URL: normalizeOptionalUrl(process.env.AI_SPACES_AGENT_BASE_URL, 'AI_SPACES_AGENT_BASE_URL'),
  AI_SPACES_PLUGIN_DIR: process.env.AI_SPACES_PLUGIN_DIR ?? path.join(AI_SPACES_DATA, 'plugins'),
  ALLOW_ORPHAN_COLLABORATORS: process.env.ALLOW_ORPHAN_COLLABORATORS === 'true',
  ALLOW_OPEN_REGISTRATION: process.env.ALLOW_OPEN_REGISTRATION === 'true',
  CONFIRMATION_NONCE_TTL_MS: parseInt(process.env.CONFIRMATION_NONCE_TTL_MS ?? '300000', 10),
  INVITE_TOKEN_TTL_DAYS: parseInt(process.env.INVITE_TOKEN_TTL_DAYS ?? '5', 10),
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
};

export const isGoogleOAuthEnabled = (): boolean => {
  return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_OAUTH_REDIRECT_URI);
};

export function getGoogleOAuthRedirectUri(): string {
  if (config.GOOGLE_OAUTH_REDIRECT_URI) {
    return config.GOOGLE_OAUTH_REDIRECT_URI;
  }
  return `${config.INVITE_BASE_URL}/api/auth/google/callback`;
}

export function getOAuthReturnOrigin(requestedOrigin: string | undefined): string {
  const fallbackOrigin = new URL(config.INVITE_BASE_URL).origin;
  if (!requestedOrigin) {
    return fallbackOrigin;
  }

  let url: URL;
  try {
    url = new URL(requestedOrigin);
  } catch {
    return fallbackOrigin;
  }

  if (url.origin === fallbackOrigin) {
    return url.origin;
  }

  const isLoopbackHost = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]';
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  if (process.env.NODE_ENV !== 'production' && isLoopbackHost && isHttp) {
    return url.origin;
  }

  return fallbackOrigin;
}

export function normalizeServerUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`[config] ${name} must be a valid URL. Got: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`[config] ${name} must use http or https. Got: ${value}`);
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error(`[config] ${name} must use HTTPS in production. Got: ${value}`);
  }
  if (url.username || url.password) {
    throw new Error(`[config] ${name} must not include credentials. Got: ${value}`);
  }

  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeOptionalUrl(value: string | undefined, name: string): string | undefined {
  return value ? normalizeServerUrl(value, name) : undefined;
}

export function assertProductionHttps(url: string, name: string): void {
  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
    throw new Error(`[config] ${name} must use HTTPS in production. Got: ${url}`);
  }
}
