import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';

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

export async function registerWithServer(): Promise<RegistrationState> {
  const existing = loadRegistrationState();
  if (existing) {
    console.log('[ai-spaces] Using persisted registration, serverId:', existing.serverId);
    return existing;
  }

  console.log('[ai-spaces] Registering with server at:', config.AI_SPACES_URL);
  const pluginUrl = config.PLUGIN_URL ?? `http://127.0.0.1:${config.AI_SPACES_WS_PORT}`;
  const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:19000';

  const res = await fetch(`${config.AI_SPACES_URL}/api/internal/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pluginUrl, gatewayUrl, name: 'openclaw-plugin' }),
  });

  if (!res.ok) {
    throw new Error(`[ai-spaces] Server registration failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { serverId: string; callbackToken: string; gatewayUrl: string };
  const state: RegistrationState = { serverId: data.serverId, callbackToken: data.callbackToken, gatewayUrl: data.gatewayUrl };
  saveState(state);
  console.log('[ai-spaces] Registered, serverId:', state.serverId);
  return state;
}
