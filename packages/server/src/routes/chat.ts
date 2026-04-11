import { Router, type Request, type Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ChatMessage } from '@ai-spaces/shared';

export const chatRouter = Router();

interface ChatSession {
  id: string;
  started: string;
  userId: string;
  messages: ChatMessage[];
}

interface ChatHistoryStore {
  sessions: ChatSession[];
}

function getDataDir(): string {
  return process.env.AI_SPACES_DATA || path.join(process.env.HOME || '', '.ai-spaces');
}

function getHistoryFilePath(spacePath: string): string {
  const dataDir = getDataDir();
  const fullPath = path.join(dataDir, 'chat', spacePath, 'history.json');
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

chatRouter.get('/:spaceId/history', (req: Request, res: Response) => {
  const { spaceId } = req.params;
  const userId = req.query.userId as string || 'default';
  
  const history = loadHistory(spaceId);
  const session = history.sessions.find(s => s.userId === userId);
  
  if (!session) {
    res.json({ messages: [] });
    return;
  }
  
  res.json({ messages: session.messages });
});

chatRouter.post('/:spaceId/messages', (req: Request, res: Response) => {
  const { spaceId } = req.params;
  const { userId, content, role } = req.body;
  
  if (!content) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }
  
  const history = loadHistory(spaceId);
  const session = history.sessions.find(s => s.userId === userId || 'default');
  
  const message: ChatMessage = {
    id: crypto.randomBytes(8).toString('hex'),
    role: role || 'user',
    content,
    timestamp: new Date().toISOString(),
  };
  
  if (session) {
    session.messages.push(message);
  } else {
    history.sessions.push({
      id: crypto.randomBytes(8).toString('hex'),
      started: new Date().toISOString(),
      userId: userId || 'default',
      messages: [message],
    });
  }
  
  saveHistory(spaceId, history);
  
  res.status(201).json({ message });
});