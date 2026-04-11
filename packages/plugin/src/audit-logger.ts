import * as fs from 'fs';
import * as path from 'path';

export interface AuditLogEntry {
  timestamp: string;
  event: 'path_escape_attempt' | 'access_denied' | 'invalid_path' | 'login' | 'logout' | 'file_access' | 'space_created' | 'space_accessed';
  sessionId?: string;
  userId?: string;
  spaceId?: string;
  attemptedPath?: string;
  resolvedPath?: string;
  spaceRoot?: string;
  clientIp?: string;
  message: string;
}

const AUDIT_LOG_DIR = '/tmp/openclaw-sandbox/logs';
const AUDIT_LOG_FILE = 'ai-spaces-audit.log';

function getAuditLogPath(): string {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  return path.join(openclawHome, 'logs', AUDIT_LOG_FILE);
}

function ensureLogDirectory(): void {
  const logPath = getAuditLogPath();
  const logDir = path.dirname(logPath);
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

export function logSecurityEvent(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  try {
    ensureLogDirectory();
    
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    const logPath = getAuditLogPath();
    
    fs.appendFileSync(logPath, logLine, 'utf-8');
  } catch {
    // Silently fail - don't expose errors to client
  }
}

export function logPathEscapeAttempt(
  spaceId: string,
  attemptedPath: string,
  resolvedPath: string | null,
  sessionId?: string,
  clientIp?: string
): void {
  logSecurityEvent({
    event: 'path_escape_attempt',
    spaceId,
    sessionId,
    attemptedPath,
    resolvedPath: resolvedPath || undefined,
    message: `Path escape attempt blocked: ${attemptedPath}`,
    clientIp,
  });
}

export function logAccessDenied(
  spaceId: string,
  reason: string,
  sessionId?: string,
  clientIp?: string
): void {
  logSecurityEvent({
    event: 'access_denied',
    spaceId,
    sessionId,
    message: reason,
    clientIp,
  });
}

export function logLogin(
  userId: string,
  success: boolean,
  sessionId?: string,
  clientIp?: string,
  reason?: string
): void {
  logSecurityEvent({
    event: 'login',
    userId,
    sessionId,
    clientIp,
    message: success ? `User ${userId} logged in successfully` : `Login failed for user ${userId}: ${reason}`,
  });
}

export function logLogout(
  userId: string,
  sessionId?: string,
  clientIp?: string
): void {
  logSecurityEvent({
    event: 'logout',
    userId,
    sessionId,
    clientIp,
    message: `User ${userId} logged out`,
  });
}

export function logFileAccess(
  spaceId: string,
  userId: string,
  filePath: string,
  action: 'read' | 'write',
  sessionId?: string,
  clientIp?: string
): void {
  logSecurityEvent({
    event: 'file_access',
    userId,
    spaceId,
    sessionId,
    attemptedPath: filePath,
    clientIp,
    message: `User ${userId} ${action} file: ${filePath} in space ${spaceId}`,
  });
}

export function logSpaceAccessed(
  spaceId: string,
  userId: string,
  action: 'view' | 'create' | 'delete',
  sessionId?: string,
  clientIp?: string
): void {
  logSecurityEvent({
    event: action === 'create' ? 'space_created' : 'space_accessed',
    userId,
    spaceId,
    sessionId,
    clientIp,
    message: `User ${userId} ${action} space ${spaceId}`,
  });
}