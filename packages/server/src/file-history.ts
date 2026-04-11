import * as fs from 'fs';
import * as path from 'path';

interface FileModification {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  sessionId: string;
  timestamp: string;
  triggeredBy: 'user' | 'agent';
}

interface FileHistoryStore {
  modifications: FileModification[];
}

function getDataDir(): string {
  return process.env.AI_SPACES_DATA || path.join(process.env.HOME || '', '.ai-spaces');
}

function getHistoryFilePath(spacePath: string): string {
  const dataDir = getDataDir();
  const fullPath = path.join(dataDir, 'history', spacePath, 'history.json');
  return fullPath;
}

function loadHistory(spacePath: string): FileHistoryStore {
  const filePath = getHistoryFilePath(spacePath);
  
  if (!fs.existsSync(filePath)) {
    return { modifications: [] };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { modifications: [] };
  }
}

function saveHistory(spacePath: string, history: FileHistoryStore): void {
  const filePath = getHistoryFilePath(spacePath);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const maxModifications = 100;
  if (history.modifications.length > maxModifications) {
    history.modifications = history.modifications.slice(-maxModifications);
  }
  
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

export function logFileModification(
  spacePath: string,
  filePath: string,
  action: FileModification['action'],
  sessionId: string,
  triggeredBy: FileModification['triggeredBy']
): void {
  const history = loadHistory(spacePath);
  
  const modification: FileModification = {
    path: filePath,
    action,
    sessionId,
    timestamp: new Date().toISOString(),
    triggeredBy,
  };
  
  history.modifications.push(modification);
  saveHistory(spacePath, history);
}

export function getRecentModifications(spacePath: string, limit: number = 10): FileModification[] {
  const history = loadHistory(spacePath);
  return history.modifications.slice(-limit);
}

export function getFileModifications(spacePath: string, filePath: string): FileModification[] {
  const history = loadHistory(spacePath);
  return history.modifications.filter(m => m.path === filePath);
}