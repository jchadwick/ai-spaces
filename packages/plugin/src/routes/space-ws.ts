import type { IncomingMessage, ServerResponse } from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { getSpace } from '../space-store.js';
import { tryGetRuntime } from '../runtime.js';
import { getOrCreateSession, addMessageToSession, getSessionMessages } from '../chat-history.js';
import { logFileModification } from '../file-history.js';
import type { WebSocketMessage, SpaceConfig, ChatMessage } from '@ai-spaces/shared';

interface WebSocketClient {
  ws: any;
  spaceId: string;
  role: string;
  userId: string;
  spacePath: string;
  config: SpaceConfig;
  sessionId: string;
}

const connectedClients: Map<string, WebSocketClient> = new Map();
const activeStreams: Map<string, AbortController> = new Map();

const DEFAULT_DENIED_TOOLS = ['exec', 'messaging', 'spawn_agents', 'browser', 'credentials'];
const DEFAULT_ALLOWED_TOOLS = ['read', 'write', 'edit', 'glob'];

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

function getEffectiveTools(config: SpaceConfig): { allowed: string[]; denied: string[] } {
  const capabilities = config.agent?.capabilities || DEFAULT_ALLOWED_TOOLS;
  const denied = config.agent?.denied || DEFAULT_DENIED_TOOLS;
  
  return {
    allowed: capabilities,
    denied: [...new Set([...denied, ...DEFAULT_DENIED_TOOLS])],
  };
}

function buildScopedPrompt(config: SpaceConfig, spacePath: string, userMessage: string): string {
  const { allowed, denied } = getEffectiveTools(config);
  
  const restrictions = [
    `CONTEXT: You are helping with a space called "${config.name}".`,
    config.description ? `DESCRIPTION: ${config.description}` : '',
    `WORKSPACE: You can ONLY access files within the space directory: ${spacePath}`,
    `RESTRICTION: You MUST refuse to read files outside this space with: "I don't have access to files outside this space."`,
    `RESTRICTION: You MUST refuse agent memory requests with: "I don't have knowledge of your agent's private memory."`,
    `RESTRICTION: Do NOT load AGENTS.md, MEMORY.md, USER.md, or memory/ directory.`,
    `ALLOWED TOOLS: ${allowed.join(', ')}`,
    denied.length > 0 ? `DENIED TOOLS: ${denied.join(', ')}` : '',
    denied.length > 0 ? `RESTRICTION: If asked to use a denied tool, respond: "I cannot perform that action in this space."` : '',
    `REFERENCE: Check .space/SPACE.md if it exists for space-specific preferences.`,
  ].filter(Boolean).join('\n');
  
  return `${restrictions}\n\nUSER MESSAGE:\n${userMessage}`;
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
  
  const space = getSpace(spaceId);
  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Space not found' }));
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
  
  const userId = 'default-user';
  const userRole = 'admin';
  
  const { session: chatSession, isNew } = getOrCreateSession(space.path, userId);
  
  const clientId = generateMessageId();
  const client: WebSocketClient = {
    ws: socket,
    spaceId: spaceId,
    role: userRole,
    userId: userId,
    spacePath: space.path,
    config: space.config,
    sessionId: chatSession.id,
  };
  
  connectedClients.set(clientId, client);
  
  sendWebSocketMessage(client, {
    type: 'event',
    event: 'connected',
    payload: {
      role: userRole,
      spaceId: spaceId,
      sessionId: chatSession.id,
    },
  });
  
  const historyMessages = getSessionMessages(space.path, userId);
  for (const msg of historyMessages) {
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'history_message',
      payload: msg,
    });
  }
  
  let messageBuffer: Buffer[] = [];
  
  const onData = (data: Buffer) => {
    messageBuffer.push(data);
    
    try {
      const combined = Buffer.concat(messageBuffer);
      const frame = parseWebSocketFrame(combined);
      
      if (frame && frame.fin) {
        messageBuffer = [];
        
        if (frame.opcode === 0x8) {
          const abortController = activeStreams.get(clientId);
          if (abortController) {
            abortController.abort();
            activeStreams.delete(clientId);
          }
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
    const abortController = activeStreams.get(clientId);
    if (abortController) {
      abortController.abort();
      activeStreams.delete(clientId);
    }
    connectedClients.delete(clientId);
  };
  
  const onError = () => {
    const abortController = activeStreams.get(clientId);
    if (abortController) {
      abortController.abort();
      activeStreams.delete(clientId);
    }
    connectedClients.delete(clientId);
  };
  
  socket.on('data', onData);
  socket.on('close', onClose);
  socket.on('error', onError);
  
  return true;
}

async function handleChatSend(
  clientId: string,
  messageId: string,
  content: string,
  client: WebSocketClient
): Promise<void> {
  const runtime = tryGetRuntime();
  
  const userMessage: ChatMessage = {
    id: messageId,
    role: 'user',
    content: content,
    timestamp: new Date().toISOString(),
  };
  
  addMessageToSession(client.spacePath, client.userId, userMessage);
  
  if (!runtime) {
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_start',
      payload: { messageId: generateMessageId() },
    });
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_chunk',
      payload: { text: 'Error: Agent runtime not available. Please try again later.' },
    });
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_end',
      payload: {},
    });
    return;
  }
  
  if (client.role === 'viewer') {
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_start',
      payload: { messageId: generateMessageId() },
    });
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_chunk',
      payload: { text: 'I cannot modify files as a viewer. Ask the owner to upgrade your role if you need edit access.' },
    });
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_end',
      payload: {},
    });
    return;
  }
  
  const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
  const workspaceDir = path.join(openclawHome, 'workspace');
  const fullSpacePath = path.join(workspaceDir, client.spacePath);
  
  const scopedPrompt = buildScopedPrompt(client.config, client.spacePath, content);
  
  const abortController = new AbortController();
  activeStreams.set(clientId, abortController);
  
  const streamMessageId = generateMessageId();
  let fullResponse = '';
  
  try {
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_start',
      payload: { messageId: streamMessageId },
    });
    
    await runtime.agent.runEmbeddedPiAgent({
      sessionId: `space:${client.spaceId}:${client.userId}`,
      runId: messageId,
      sessionFile: path.join(openclawHome, 'sessions', `space-${client.spaceId}-${client.userId}.jsonl`),
      workspaceDir: fullSpacePath,
      prompt: scopedPrompt,
      timeoutMs: 120000,
      onPartialReply: (payload: { text?: string; mediaUrls?: string[] }) => {
        if (abortController.signal.aborted) return;
        const text = payload.text || '';
        if (text) {
          fullResponse += text;
          sendWebSocketMessage(client, {
            type: 'event',
            event: 'stream_chunk',
            payload: { text },
          });
        }
      },
      onBlockReply: (payload: { text?: string; mediaUrls?: string[] }) => {
        if (abortController.signal.aborted) return;
        const text = payload.text;
        if (text && text !== fullResponse) {
          const newText = text.startsWith(fullResponse) 
            ? text.slice(fullResponse.length) 
            : text;
          if (newText) {
            fullResponse = text;
            sendWebSocketMessage(client, {
              type: 'event',
              event: 'stream_chunk',
              payload: { text: newText },
            });
          }
        }
      },
      onToolResult: (payload: any) => {
        if (abortController.signal.aborted) return;
        
        if (payload && payload.toolName && (payload.toolName === 'write' || payload.toolName === 'edit')) {
          const toolInput = payload.toolInput || {};
          const filePath = toolInput.file || toolInput.path || toolInput.filePath;
          
          if (filePath && typeof filePath === 'string') {
            const relativePath = path.relative(fullSpacePath, filePath);
            const action: 'created' | 'modified' | 'deleted' = toolInput.action || 'modified';
            
            logFileModification(
              client.spacePath,
              relativePath,
              action,
              client.sessionId,
              'agent'
            );
            
            for (const [id, otherClient] of connectedClients) {
              sendWebSocketMessage(otherClient, {
                type: 'event',
                event: 'file_modified',
                payload: {
                  path: relativePath,
                  action: action,
                  triggeredBy: 'agent',
                },
              });
            }
          }
        }
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      sendWebSocketMessage(client, {
        type: 'event',
        event: 'stream_chunk',
        payload: { text: '\n[Stream cancelled]\n' },
      });
    } else {
      sendWebSocketMessage(client, {
        type: 'event',
        event: 'stream_chunk',
        payload: { text: `\n[Error: ${(error as Error).message}]\n` },
      });
    }
  } finally {
    activeStreams.delete(clientId);
    
    const assistantMessage: ChatMessage = {
      id: streamMessageId,
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date().toISOString(),
    };
    addMessageToSession(client.spacePath, client.userId, assistantMessage);
    
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'stream_end',
      payload: {},
    });
  }
}

async function handleFileWrite(
  clientId: string,
  messageId: string,
  filePath: string,
  content: string,
  client: WebSocketClient
): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
    const workspaceDir = path.join(openclawHome, 'workspace');
    const fullSpacePath = path.join(workspaceDir, client.spacePath);
    
    const relativePath = path.relative(fullSpacePath, filePath);
    
    let action: 'created' | 'modified' | 'deleted' = 'modified';
    try {
      await fs.promises.access(filePath);
    } catch {
      action = 'created';
    }
    
    await fs.promises.writeFile(filePath, content, 'utf8');
    
    const stats = await fs.promises.stat(filePath);
    
    logFileModification(
      client.spacePath,
      relativePath,
      action,
      client.sessionId,
      'user'
    );
    
    sendWebSocketMessage(client, {
      type: 'res',
      id: messageId,
      result: {
        success: true,
        path: relativePath,
        modified: stats.mtime.toISOString(),
      },
    });
    
    for (const [id, otherClient] of connectedClients) {
      if (id !== clientId) {
        sendWebSocketMessage(otherClient, {
          type: 'event',
          event: 'file_modified',
          payload: {
            path: relativePath,
            action: action,
            triggeredBy: 'user',
          },
        });
      }
    }
  } catch (error) {
    sendWebSocketMessage(client, {
      type: 'res',
      id: messageId,
      error: { code: 500, message: `Failed to write file: ${(error as Error).message}` },
    });
  }
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
      
      handleChatSend(clientId, message.id, content, client).catch((error) => {
        console.error('[ai-spaces] Chat error:', error);
        sendWebSocketMessage(client, {
          type: 'event',
          event: 'stream_start',
          payload: { messageId: generateMessageId() },
        });
        sendWebSocketMessage(client, {
          type: 'event',
          event: 'stream_chunk',
          payload: { text: `Error processing message: ${(error as Error).message}` },
        });
        sendWebSocketMessage(client, {
          type: 'event',
          event: 'stream_end',
          payload: {},
        });
      });
      
      break;
    }
    
    case 'file.write': {
      if (client.role === 'viewer') {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 403, message: 'Permission denied: viewers cannot write files' },
        });
        return;
      }
      
      const filePath = message.params?.path as string | undefined;
      const fileContent = message.params?.content as string | undefined;
      
      if (!filePath || typeof filePath !== 'string') {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 400, message: 'File path required' },
        });
        return;
      }
      
      if (fileContent === undefined || fileContent === null) {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 400, message: 'File content required' },
        });
        return;
      }
      
      if (typeof fileContent !== 'string') {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 400, message: 'File content must be a string' },
        });
        return;
      }
      
      const contentSize = Buffer.byteLength(fileContent, 'utf8');
      if (contentSize > 10 * 1024 * 1024) {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 400, message: 'File size exceeds 10MB limit' },
        });
        return;
      }
      
      const openclawHome = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
      const workspaceDir = path.join(openclawHome, 'workspace');
      const fullSpacePath = path.join(workspaceDir, client.spacePath);
      const fullFilePath = path.join(fullSpacePath, filePath);
      
      const normalizedSpacePath = path.normalize(fullSpacePath);
      const normalizedFilePath = path.normalize(fullFilePath);
      
      if (!normalizedFilePath.startsWith(normalizedSpacePath)) {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 403, message: 'Permission denied: path escape attempt' },
        });
        return;
      }
      
      handleFileWrite(clientId, message.id, normalizedFilePath, fileContent, client).catch((error) => {
        console.error('[ai-spaces] File write error:', error);
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 500, message: `Failed to write file: ${(error as Error).message}` },
        });
      });
      
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