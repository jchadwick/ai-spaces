import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ChatMessage } from '@ai-spaces/shared';
import type { AuthVariables } from '../middleware/auth.js';

import { authMiddleware } from '../middleware/auth.js';
import { config } from '../config.js';

export const chatRouter = new Hono();

chatRouter.use('*', authMiddleware);

interface ChatSession {
  id: string;
  started: string;
  userId: string;
  messages: ChatMessage[];
}

interface ChatHistoryStore {
  sessions: ChatSession[];
}

const messageSchema = z.object({
  userId: z.string().optional(),
  content: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']).optional(),
});

const historyParamSchema = z.object({
  spaceId: z.string(),
});

const historyQuerySchema = z.object({
  userId: z.string().optional(),
});

function getDataDir(): string {
  return config.AI_SPACES_DATA;
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

chatRouter.get('/:spaceId/history', zValidator('param', historyParamSchema), (c) => {
  const { spaceId } = c.req.valid('param');
  const user = c.get('user') as AuthVariables['user'] | undefined;
  const userId = user?.userId;
  
  if (!userId) {
    return c.json({ error: 'User not authenticated' }, 401);
  }
  
  const history = loadHistory(spaceId);
  const session = history.sessions.find(s => s.userId === userId);
  
  if (!session) {
    return c.json({ messages: [] });
  }
  
  return c.json({ messages: session.messages });
});

chatRouter.post('/:spaceId/messages', zValidator('param', historyParamSchema), zValidator('json', messageSchema), async (c) => {
  const { spaceId } = c.req.valid('param');
  const { content, role } = c.req.valid('json');
  const user = c.get('user') as AuthVariables['user'] | undefined;
  const userId = user?.userId;
  
  if (!userId) {
    return c.json({ error: 'User not authenticated' }, 401);
  }

  const history = loadHistory(spaceId);
  const session = history.sessions.find(s => s.userId === userId);

  const userMessage: ChatMessage = {
    id: crypto.randomBytes(8).toString('hex'),
    role: role || 'user',
    content,
    timestamp: new Date().toISOString(),
  };

  if (session) {
    session.messages.push(userMessage);
  } else {
    history.sessions.push({
      id: crypto.randomBytes(8).toString('hex'),
      started: new Date().toISOString(),
      userId: userId,
      messages: [userMessage],
    });
  }

  saveHistory(spaceId, history);

  try {
    const apiKey = config.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-32b',
        messages: [{ role: 'user', content }],
        temperature: 0.9,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const responseText = result.choices?.[0]?.message?.content || 'No response';

    const assistantMessage: ChatMessage = {
      id: crypto.randomBytes(8).toString('hex'),
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    };

    if (session) {
      session.messages.push(assistantMessage);
    } else {
      history.sessions.push({
        id: crypto.randomBytes(8).toString('hex'),
        started: new Date().toISOString(),
        userId: userId,
        messages: [userMessage, assistantMessage],
      });
    }

    saveHistory(spaceId, history);

    return c.json({ message: assistantMessage }, 201);
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Failed to get AI response' }, 500);
  }
});

export type ChatRouter = typeof chatRouter;