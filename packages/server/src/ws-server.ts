import type { WebSocketServer as WSServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import type { ChatMessage } from '@ai-spaces/shared';
import jwt from 'jsonwebtoken';
import { ACCESS_SECRET } from './middleware/auth.js';

interface WSClient {
  ws: WebSocket;
  spaceId: string;
  userId: string;
  sessionId: string;
}

const connectedClients: Map<string, WSClient> = new Map();

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function setupWebSocket(wss: WSServer): void {
  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathMatch = url.pathname.match(/^\/ws\/spaces\/([^\/]+)$/);
    
    if (!pathMatch) {
      ws.close(1008, 'Invalid path');
      return;
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ws.close(1008, 'Authentication required');
      return;
    }
    
    const token = authHeader.substring(7);
    
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }
    
    if (!decoded.userId) {
      ws.close(1008, 'Invalid token');
      return;
    }
    
    const spaceId = pathMatch[1];
    const userId = decoded.userId;
    const sessionId = generateId();
    
    const clientId = generateId();
    const client: WSClient = {
      ws,
      spaceId,
      userId,
      sessionId,
    };
    
    connectedClients.set(clientId, client);
    
    ws.send(JSON.stringify({
      type: 'event',
      event: 'connected',
      payload: {
        sessionId,
        spaceId,
      },
    }));
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(clientId, message, client);
      } catch {}
    });
    
    ws.on('close', () => {
      connectedClients.delete(clientId);
    });
  });
}

function handleMessage(clientId: string, message: any, client: WSClient): void {
  if (message.type === 'chat.send') {
    const content = message.params?.content;
    if (!content) {
      client.ws.send(JSON.stringify({
        type: 'res',
        id: message.id,
        error: { code: 400, message: 'Content required' },
      }));
      return;
    }
    
    client.ws.send(JSON.stringify({
      type: 'res',
      id: message.id,
      result: { success: true },
      messageId: generateId(),
    }));
    
    client.ws.send(JSON.stringify({
      type: 'event',
      event: 'stream_start',
      payload: { messageId: generateId() },
    }));
    
    client.ws.send(JSON.stringify({
      type: 'event',
      event: 'stream_chunk',
      payload: { text: 'AI response would appear here (agent runtime integration needed)' },
    }));
    
    client.ws.send(JSON.stringify({
      type: 'event',
      event: 'stream_end',
      payload: {},
    }));
  }
}