import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ChatMessage } from '@ai-spaces/shared';
import { config } from './config.js';

interface ChatSession {
  id: string;
  started: string;
  userId: string;
  messages: ChatMessage[];
}

interface ChatHistoryStore {
  sessions: ChatSession[];
}

function getOpenClawHome(): string {
  return config.OPENCLAW_HOME;
}

function getHistoryFilePath(spacePath: string): string {
  const openclawHome = getOpenClawHome();
  const workspaceDir = path.join(openclawHome, 'workspace');
  const fullPath = path.join(workspaceDir, spacePath, '.space', 'chat-history.json');
  return fullPath;
}

function loadHistory(spacePath: string): ChatHistoryStore {
  const filePath = getHistoryFilePath(spacePath);
  
  if (!fs.existsSync(filePath)) {
    return { sessions: [] };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { sessions: [] };
  }
}

function saveHistory(spacePath: string, history: ChatHistoryStore): void {
  const filePath = getHistoryFilePath(spacePath);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

export function getOrCreateSession(spacePath: string, userId: string): { session: ChatSession; isNew: boolean } {
  const history = loadHistory(spacePath);
  
  const existingSession = history.sessions.find(s => s.userId === userId);
  
  if (existingSession) {
    return { session: existingSession, isNew: false };
  }
  
  const newSession: ChatSession = {
    id: crypto.randomBytes(8).toString('hex'),
    started: new Date().toISOString(),
    userId: userId,
    messages: [],
  };
  
  history.sessions.push(newSession);
  saveHistory(spacePath, history);
  
  return { session: newSession, isNew: true };
}

export function addMessageToSession(spacePath: string, userId: string, message: ChatMessage): void {
  const history = loadHistory(spacePath);
  
  const session = history.sessions.find(s => s.userId === userId);
  
  if (!session) {
    return;
  }
  
  session.messages.push(message);
  saveHistory(spacePath, history);
}

export function getSessionMessages(spacePath: string, userId: string): ChatMessage[] {
  const history = loadHistory(spacePath);
  
  const session = history.sessions.find(s => s.userId === userId);
  
  if (!session) {
    return [];
  }
  
  return session.messages;
}

export function clearSessionMessages(spacePath: string, userId: string): boolean {
  const history = loadHistory(spacePath);
  
  const sessionIndex = history.sessions.findIndex(s => s.userId === userId);
  
  if (sessionIndex === -1) {
    return false;
  }
  
  history.sessions.splice(sessionIndex, 1);
  saveHistory(spacePath, history);
  
  return true;
}