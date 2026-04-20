import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from './config.js';

export type AuditAction = 
  | 'space.create'
  | 'space.update'
  | 'space.delete'
  | 'space.access'
  | 'space.scan';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  userId: string;
  spaceId?: string;
  details?: Record<string, unknown>;
}

function getLogDir(): string {
  return config.AI_SPACES_DATA;
}

function getAuditLogPath(): string {
  return path.join(getLogDir(), 'audit.json');
}

function loadLog(): AuditLogEntry[] {
  const logPath = getAuditLogPath();
  
  if (!fs.existsSync(logPath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveLog(log: AuditLogEntry[]): void {
  const logDir = getLogDir();
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logPath = getAuditLogPath();
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

export function logAudit(
  action: AuditAction,
  userId: string,
  options?: {
    spaceId?: string;
    path?: string;
    details?: Record<string, unknown>;
  }
): void {
  const log = loadLog();
  
  const entry: AuditLogEntry = {
    id: crypto.randomBytes(8).toString('hex'),
    timestamp: new Date().toISOString(),
    action,
    userId,
    spaceId: options?.spaceId,
    details: { ...options?.details, path: options?.path },
  };
  
  log.push(entry);
  
  const maxEntries = 10000;
  if (log.length > maxEntries) {
    log.splice(0, log.length - maxEntries);
  }
  
  saveLog(log);
}

export function getAuditLog(limit: number = 100, spaceId?: string, userId?: string): AuditLogEntry[] {
  const log = loadLog();
  
  let filtered = log;
  
  if (spaceId) {
    filtered = filtered.filter(e => e.spaceId === spaceId);
  }
  
  if (userId) {
    filtered = filtered.filter(e => e.userId === userId);
  }
  
  return filtered.slice(-limit).reverse();
}