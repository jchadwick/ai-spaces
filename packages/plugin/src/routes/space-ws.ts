import type { IncomingMessage, ServerResponse } from 'http';
import * as crypto from 'crypto';
import { validateSession } from '../share-store.js';
import type { WebSocketMessage } from '@ai-spaces/shared';

interface WebSocketClient {
  ws: any;
  spaceId: string;
  role: string;
  shareId: string;
}

const connectedClients: Map<string, WebSocketClient> = new Map();

function getRawSocket(req: IncomingMessage): any {
  return (req as any).socket;
}

function generateMessageId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function parseWebSocketFrame(buffer: Buffer): { fin: boolean; opcode: number; payload: Buffer } | null {
  if (buffer.length < 2) return null;
  
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLen = buffer[1] & 0x7f;
  
  let offset = 2;
  
  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  
  if (masked) {
    if (buffer.length < offset + 4) return null;
    const mask = buffer.slice(offset, offset + 4);
    offset += 4;
    const payload = buffer.slice(offset, offset + payloadLen);
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
    return { fin, opcode, payload };
  }
  
  return { fin, opcode, payload: buffer.slice(offset, offset + payloadLen) };
}

function createWebSocketFrame(payload: Buffer, opcode: number = 1): Buffer {
  const len = payload.length;
  let headerLen = 2;
  
  if (len >= 126) headerLen = 4;
  if (len >= 65536) headerLen = 10;
  
  const frame = Buffer.alloc(headerLen + len);
  frame[0] = 0x80 | opcode;
  
  if (len < 126) {
    frame[1] = len;
  } else if (len < 65536) {
    frame[1] = 126;
    frame.writeUInt16BE(len, 2);
  } else {
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(len), 2);
  }
  
  payload.copy(frame, headerLen);
  return frame;
}

function sendWebSocketMessage(client: WebSocketClient, message: WebSocketMessage): void {
  try {
    const payload = JSON.stringify(message);
    const frame = createWebSocketFrame(Buffer.from(payload));
    if (client.ws && typeof client.ws.write === 'function') {
      client.ws.write(frame);
    }
  } catch {}
}

interface HTTPSocketWithWrite {
  write: (data: Buffer) => boolean;
  destroy: (error?: Error) => void;
  on: (event: string, callback: (data: Buffer) => void) => void;
  removeListener: (event: string, callback: (data: Buffer) => void) => void;
}

export async function handleSpaceWebSocket(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const upgradeHeader = req.headers.upgrade || '';
  
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('Space WebSocket: not implemented');
    return true;
  }
  
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathMatch = url.pathname.match(/^\/api\/spaces\/([^\/]+)\/ws$/);
  
  if (!pathMatch) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Not found' }));
    return true;
  }
  
  const spaceId = pathMatch[1];
  const token = url.searchParams.get('t');
  
  if (!token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Token required' }));
    return true;
  }
  
  const session = validateSession(token);
  
  if (!session.valid) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: session.error === 'expired' ? 'Share link expired' : 'Invalid token' }));
    return true;
  }
  
  if (session.share.spaceId !== spaceId) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Token not valid for this space' }));
    return true;
  }
  
  const acceptKey = req.headers['sec-websocket-key'] || '';
  const acceptHash = crypto
    .createHash('sha1')
    .update(acceptKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  const socket = getRawSocket(req) as HTTPSocketWithWrite;
  
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptHash}`,
    'Access-Control-Allow-Origin: *',
    '',
    '',
  ].join('\r\n');
  
  socket.write(Buffer.from(responseHeaders));
  
  const clientId = generateMessageId();
  const client: WebSocketClient = {
    ws: socket,
    spaceId: session.share.spaceId,
    role: session.share.role,
    shareId: session.share.id,
  };
  
  connectedClients.set(clientId, client);
  
  sendWebSocketMessage(client, {
    type: 'event',
    event: 'connected',
    payload: {
      role: session.share.role,
      spaceId: session.share.spaceId,
    },
  });
  
  let messageBuffer: Buffer[] = [];
  
  const onData = (data: Buffer) => {
    messageBuffer.push(data);
    
    try {
      const combined = Buffer.concat(messageBuffer);
      const frame = parseWebSocketFrame(combined);
      
      if (frame && frame.fin) {
        messageBuffer = [];
        
        if (frame.opcode === 0x8) {
          const closeFrame = createWebSocketFrame(Buffer.from([]), 0x8);
          socket.write(closeFrame);
          connectedClients.delete(clientId);
          return;
        }
        
        if (frame.opcode === 0x9) {
          const pongFrame = createWebSocketFrame(frame.payload, 0xa);
          socket.write(pongFrame);
          return;
        }
        
        if (frame.opcode === 0x1 || frame.opcode === 0x2) {
          try {
            const message: WebSocketMessage = JSON.parse(frame.payload.toString());
            handleMessage(clientId, message);
          } catch {}
        }
      }
    } catch {}
  };
  
  const onClose = () => {
    connectedClients.delete(clientId);
  };
  
  const onError = () => {
    connectedClients.delete(clientId);
  };
  
  socket.on('data', onData);
  socket.on('close', onClose);
  socket.on('error', onError);
  
  return true;
}

function handleMessage(clientId: string, message: WebSocketMessage): void {
  const client = connectedClients.get(clientId);
  
  if (!client) return;
  
  if (message.type !== 'req' || !message.method || !message.id) {
    return;
  }
  
  switch (message.method) {
    case 'chat.send': {
      const content = message.params?.content as string | undefined;
      
      if (!content || typeof content !== 'string') {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 400, message: 'Content required' },
        });
        return;
      }
      
      sendWebSocketMessage(client, {
        type: 'res',
        id: message.id,
        result: { success: true },
      });
      
      sendWebSocketMessage(client, {
        type: 'event',
        event: 'stream_start',
        payload: { messageId: generateMessageId() },
      });
      
      const echoResponse = `Echo: ${content}. This is a placeholder response. Agent integration will be implemented separately.`;
      const words = echoResponse.split(' ');
      
      let sentWords = 0;
      const streamInterval = setInterval(() => {
        const chunkSize = Math.floor(Math.random() * 3) + 1;
        const chunk = words.slice(sentWords, sentWords + chunkSize).join(' ');
        sentWords += chunkSize;
        
        if (chunk) {
          sendWebSocketMessage(client, {
            type: 'event',
            event: 'stream_chunk',
            payload: { text: chunk + (sentWords < words.length ? ' ' : '') },
          });
        }
        
        if (sentWords >= words.length) {
          clearInterval(streamInterval);
          sendWebSocketMessage(client, {
            type: 'event',
            event: 'stream_end',
            payload: {},
          });
        }
      }, 100);
      
      break;
    }
    
    default:
      sendWebSocketMessage(client, {
        type: 'res',
        id: message.id,
        error: { code: 404, message: 'Method not found' },
      });
  }
}