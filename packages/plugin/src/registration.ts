import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';
import { logger as rootLogger } from './logger.js';

const log = rootLogger.child({ component: 'registration' });

export interface RegistrationState {
  serverId: string;
  callbackToken: string;
  gatewayUrl: string;
}

export function loadRegistrationState(): RegistrationState | null {
  try {
    if (!fs.existsSync(config.AI_SPACES_PLUGIN_STATE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(config.AI_SPACES_PLUGIN_STATE_FILE, 'utf-8'));
    if (
      typeof parsed?.serverId === 'string' &&
      typeof parsed?.callbackToken === 'string' &&
      typeof parsed?.gatewayUrl === 'string'
    ) {
      return parsed as RegistrationState;
    }
    return null;
  } catch {
    return null;
  }
}

function saveState(state: RegistrationState): void {
  fs.mkdirSync(path.dirname(config.AI_SPACES_PLUGIN_STATE_FILE), { recursive: true });
  fs.writeFileSync(config.AI_SPACES_PLUGIN_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function clearRegistrationState(): void {
  try { fs.unlinkSync(config.AI_SPACES_PLUGIN_STATE_FILE); } catch { /* ignore */ }
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000];

async function attemptRegister(pluginUrl: string, gatewayUrl: string): Promise<RegistrationState> {
  const res = await fetch(`${config.AI_SPACES_URL}/api/internal/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pluginUrl, gatewayUrl, name: 'openclaw-plugin' }),
  });

  // Auth failures won't self-heal — propagate immediately without retry
  if (res.status === 401 || res.status === 403) {
    throw new Error(`[ai-spaces] Server registration rejected (${res.status}) — check GATEWAY_TOKEN`);
  }

  if (!res.ok) {
    throw new Error(`[ai-spaces] Server registration failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { serverId: string; callbackToken: string; gatewayUrl: string };
  return { serverId: data.serverId, callbackToken: data.callbackToken, gatewayUrl: data.gatewayUrl };
}

export async function registerWithServer(): Promise<RegistrationState> {
  const existing = loadRegistrationState();
  if (existing) {
    log.info({ serverId: existing.serverId }, 'Using persisted registration');
    return existing;
  }

  log.info({ url: config.AI_SPACES_URL }, 'Registering with server');
  const pluginUrl = config.PLUGIN_URL ?? `http://127.0.0.1:${config.AI_SPACES_WS_PORT}`;
  const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:19000';

  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const state = await attemptRegister(pluginUrl, gatewayUrl);
      saveState(state);
      log.info({ serverId: state.serverId }, 'Registered with server');
      return state;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Auth failures: don't retry
      if (lastError.message.includes('rejected')) throw lastError;

      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;

      log.warn({ attempt: attempt + 1, retryIn: delay / 1000, err: lastError.message }, 'Registration failed, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
