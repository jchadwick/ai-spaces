import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Share } from '@ai-spaces/shared';

interface ShareStore {
  shares: Record<string, Share>;
  byToken: Record<string, string>;
}

function getOpenClawHome(): string {
  return process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
}

function getSharesFilePath(): string {
  return path.join(getOpenClawHome(), 'shares.json');
}

function loadStore(): ShareStore {
  const filePath = getSharesFilePath();
  
  if (!fs.existsSync(filePath)) {
    return { shares: {}, byToken: {} };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { shares: {}, byToken: {} };
  }
}

function saveStore(store: ShareStore): void {
  const filePath = getSharesFilePath();
  const openclawHome = getOpenClawHome();
  
  if (!fs.existsSync(openclawHome)) {
    fs.mkdirSync(openclawHome, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function createShare(spaceId: string, spacePath: string, role: 'viewer' | 'editor', expiresDays?: number): Share {
  const store = loadStore();
  
  const id = crypto.randomBytes(8).toString('hex');
  const token = generateToken();
  const now = new Date().toISOString();
  
  const share: Share = {
    id,
    token,
    spaceId,
    spacePath,
    role,
    created: now,
    expires: expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString() : undefined,
  };
  
  store.shares[id] = share;
  store.byToken[token] = id;
  
  saveStore(store);
  
  return share;
}

export function getShareByToken(token: string): Share | null {
  const store = loadStore();
  const id = store.byToken[token];
  
  if (!id) {
    return null;
  }
  
  const share = store.shares[id];
  
  if (!share) {
    return null;
  }
  
  if (share.revoked) {
    return null;
  }
  
  if (share.expires && new Date(share.expires) < new Date()) {
    return null;
  }
  
  return share;
}

export function getShareById(id: string): Share | null {
  const store = loadStore();
  return store.shares[id] || null;
}

export function listShares(spaceId: string): Share[] {
  const store = loadStore();
  return Object.values(store.shares).filter(s => s.spaceId === spaceId && !s.revoked);
}

export function revokeShare(spaceId: string, shareId: string): boolean {
  const store = loadStore();
  const share = store.shares[shareId];
  
  if (!share || share.spaceId !== spaceId) {
    return false;
  }
  
  share.revoked = true;
  share.revokedAt = new Date().toISOString();
  
  saveStore(store);
  return true;
}

export function validateSession(token: string): { valid: true; share: Share } | { valid: false; error: string } {
  const share = getShareByToken(token);
  
  if (!share) {
    return { valid: false, error: 'invalid' };
  }
  
  if (share.revoked) {
    return { valid: false, error: 'invalid' };
  }
  
  if (share.expires && new Date(share.expires) < new Date()) {
    return { valid: false, error: 'expired' };
  }
  
  return { valid: true, share };
}