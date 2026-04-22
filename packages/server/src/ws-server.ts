import WebSocket from 'ws';
import type { WebSocketServer } from 'ws';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ACCESS_SECRET } from './middleware/auth.js';

interface WSClient {
  ws: WebSocket;
  spaceId: string;
  userId: string;
  sessionId: string;
  gatewayWs: WebSocket | null;
}

interface GatewayConnection {
  clientWs: WebSocket;
  gatewayWs: WebSocket;
  clientId: string;
}

const connectedClients: Map<string, WSClient> = new Map();
const gatewayConnections: Map<string, GatewayConnection> = new Map();

const GATEWAY_PORT = 19000;
const GATEWAY_HOST = 'localhost';

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function setupWebSocket(wss: WebSocketServer): void {
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
    
    const gatewayUrl = `ws://${GATEWAY_HOST}:${GATEWAY_PORT}/api/spaces/${spaceId}/ws`;
    const gatewayWs = new WebSocket(gatewayUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    const client: WSClient = {
      ws,
      spaceId,
      userId,
      sessionId,
      gatewayWs,
    };
    
    connectedClients.set(clientId, client);
    gatewayConnections.set(clientId, { clientWs: ws, gatewayWs, clientId });
    
    gatewayWs.on('open', () => {
      ws.send(JSON.stringify({
        type: 'event',
        event: 'connected',
        payload: { sessionId, spaceId },
      }));
    });
    
    gatewayWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    
    gatewayWs.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Gateway disconnected');
      }
      connectedClients.delete(clientId);
      gatewayConnections.delete(clientId);
    });
    
    gatewayWs.on('error', (error) => {
      console.error('Gateway WebSocket error:', error.message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Gateway connection error');
      }
      connectedClients.delete(clientId);
      gatewayConnections.delete(clientId);
    });
    
    ws.on('message', (data) => {
      if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.send(data);
      }
    });
    
    ws.on('close', () => {
      if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.close(1000, 'Client disconnected');
      }
      connectedClients.delete(clientId);
      gatewayConnections.delete(clientId);
    });
    
    ws.on('error', (error) => {
      console.error('Client WebSocket error:', error.message);
      if (gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.close(1000, 'Client error');
      }
      connectedClients.delete(clientId);
      gatewayConnections.delete(clientId);
    });
  });
}