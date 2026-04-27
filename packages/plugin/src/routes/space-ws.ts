import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Socket } from 'net';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { getSpace, resolveSpaceRoot, type SpaceRecord } from '../space-store.js';
import { validatePath } from '../validation.js';
import { getOrCreateSession, addMessageToSession, getSessionMessages } from '../chat-history.js';
import { logFileModification } from '../file-history.js';
import { config } from '../config.js';
import { validateSession } from '../session-middleware.js';
import { fileWatcher, type FileChangedEvent } from '../file-watcher.js';
import type { WebSocketMessage, SpaceConfig, ChatMessage } from '@ai-spaces/shared';

interface WebSocketClient {
  ws: WsWebSocket;
  spaceId: string;
  role: string;
  userId: string;
  spacePath: string;
  spaceRoot: string;
  config: SpaceConfig;
  sessionId: string;
}

const wss = new WebSocketServer({ noServer: true });
const connectedClients: Map<string, WebSocketClient> = new Map();
const activeStreams: Map<string, AbortController> = new Map();
// Track client count per space to start/stop file watching
const spaceClientCount: Map<string, number> = new Map();
// Paths recently written via handleFileWrite — suppress watcher double-fire
const recentlyWritten: Set<string> = new Set();

fileWatcher.on('file:changed', (event: FileChangedEvent) => {
  const suppressKey = `${event.spaceId}:${event.path}`;
  if (recentlyWritten.has(suppressKey)) return;

  for (const client of connectedClients.values()) {
    if (client.spaceId === event.spaceId) {
      sendWebSocketMessage(client, {
        type: 'event',
        event: 'file_modified',
        payload: {
          path: event.path,
          action: event.action,
          triggeredBy: 'agent',
        },
      });
    }
  }
});

function generateMessageId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function sendWebSocketMessage(client: WebSocketClient, message: WebSocketMessage): void {
  try {
    if (client.ws.readyState === WsWebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  } catch {}
}

function getEffectiveTools(spaceConfig: SpaceConfig): { allowed: string[]; denied: string[] } {
  const capabilities = spaceConfig.agent?.capabilities || config.DEFAULT_ALLOWED_TOOLS;
  const denied = spaceConfig.agent?.denied || config.DEFAULT_DENIED_TOOLS;

  return {
    allowed: capabilities,
    denied: [...new Set([...denied, ...config.DEFAULT_DENIED_TOOLS])],
  };
}

function buildSystemPrompt(spaceConfig: SpaceConfig, fullSpacePath: string): string {
  const { allowed, denied } = getEffectiveTools(spaceConfig);

  return [
    `CONTEXT: You are helping with a space called "${spaceConfig.name}".`,
    spaceConfig.description ? `DESCRIPTION: ${spaceConfig.description}` : '',
    `WORKSPACE: You can ONLY access files within the space directory: ${fullSpacePath}`,
    `RESTRICTION: You MUST refuse to read files outside this space with: "I don't have access to files outside this space."`,
    `RESTRICTION: You MUST refuse agent memory requests with: "I don't have knowledge of your agent's private memory."`,
    `RESTRICTION: Do NOT load AGENTS.md, MEMORY.md, USER.md, or memory/ directory.`,
    `ALLOWED TOOLS: ${allowed.join(', ')}`,
    denied.length > 0 ? `DENIED TOOLS: ${denied.join(', ')}` : '',
    denied.length > 0 ? `RESTRICTION: If asked to use a denied tool, respond: "I cannot perform that action in this space."` : '',
    `REFERENCE: Check .space/SPACE.md if it exists for space-specific preferences.`,
  ].filter(Boolean).join('\n');
}

// Strip openclaw internal <think>...</think> blocks and <final>...</final> wrappers.
// Returns the cleaned answer text, or the raw content if no tags are present.
function extractFinalContent(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const finalMatch = withoutThinking.match(/<final>([\s\S]*?)<\/final>/);
  if (finalMatch) return finalMatch[1].trim();
  // No <final> wrapper — strip any partial/orphaned tags and return what's left
  return withoutThinking.replace(/<\/?(?:think|final)[^>]*>/g, '').trim();
}

async function handleChatSend(
  clientId: string,
  messageId: string,
  content: string,
  client: WebSocketClient
): Promise<void> {
  const userMessage: ChatMessage = {
    id: messageId,
    role: 'user',
    content: content,
    timestamp: new Date().toISOString(),
  };
  addMessageToSession(client.spacePath, client.userId, userMessage);

  if (client.role === 'viewer') {
    sendWebSocketMessage(client, { type: 'event', event: 'stream_start', payload: { messageId: generateMessageId() } });
    sendWebSocketMessage(client, { type: 'event', event: 'stream_chunk', payload: { text: 'I cannot modify files as a viewer. Ask the owner to upgrade your role if you need edit access.' } });
    sendWebSocketMessage(client, { type: 'event', event: 'stream_end', payload: {} });
    return;
  }

  const systemPrompt = buildSystemPrompt(client.config, client.spaceRoot);

  const history = getSessionMessages(client.spacePath, client.userId);
  const MAX_HISTORY = 40;
  const recentHistory = history.slice(-MAX_HISTORY);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content },
  ];

  const abortController = new AbortController();
  activeStreams.set(clientId, abortController);

  const streamMessageId = generateMessageId();
  // Accumulates the raw SSE text so we can strip think/final wrappers at the end.
  let rawAccumulated = '';
  // Tracks how many chars of rawAccumulated have already been forwarded after stripping.
  let sentLength = 0;

  sendWebSocketMessage(client, { type: 'event', event: 'stream_start', payload: { messageId: streamMessageId } });

  try {
    const res = await fetch(`${config.GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ model: 'openclaw', stream: true, messages }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gateway error ${res.status}: ${errText}`);
    }

    if (!res.body) {
      throw new Error('Gateway returned no response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = sseBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      sseBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const jsonStr = trimmed.slice('data: '.length);
          const chunk = JSON.parse(jsonStr) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
          };

          const deltaContent = chunk.choices?.[0]?.delta?.content;
          if (deltaContent) {
            rawAccumulated += deltaContent;

            // Strip think/final tags incrementally and forward only the visible portion
            const cleaned = extractFinalContent(rawAccumulated);
            if (cleaned.length > sentLength) {
              const newText = cleaned.slice(sentLength);
              sentLength = cleaned.length;
              sendWebSocketMessage(client, { type: 'event', event: 'stream_chunk', payload: { text: newText } });
            }
          }
        } catch {
          // Ignore malformed SSE chunks
        }
      }
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      sendWebSocketMessage(client, { type: 'event', event: 'stream_chunk', payload: { text: '\n[Stream cancelled]\n' } });
    } else {
      sendWebSocketMessage(client, { type: 'event', event: 'stream_chunk', payload: { text: `\n[Error: ${(error as Error).message}]\n` } });
    }
  } finally {
    activeStreams.delete(clientId);
    // Use the final cleaned content for storage
    const fullResponse = extractFinalContent(rawAccumulated);
    addMessageToSession(client.spacePath, client.userId, {
      id: streamMessageId,
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date().toISOString(),
    });
    sendWebSocketMessage(client, { type: 'event', event: 'stream_end', payload: {} });
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

    const relativePath = path.relative(client.spaceRoot, filePath);

    let action: 'created' | 'modified' | 'deleted' = 'modified';
    try {
      await fs.promises.access(filePath);
    } catch {
      action = 'created';
    }

    await fs.promises.writeFile(filePath, content, 'utf8');

    // Suppress the watcher event for this write — the file_modified broadcast below covers it
    const suppressKey = `${client.spaceId}:${relativePath}`;
    recentlyWritten.add(suppressKey);
    setTimeout(() => recentlyWritten.delete(suppressKey), 500);

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
    case 'connect': {
      sendWebSocketMessage(client, {
        type: 'res',
        id: message.id,
        result: { success: true },
      });

      sendWebSocketMessage(client, {
        type: 'event',
        event: 'connected',
        payload: {
          role: client.role,
          spaceId: client.spaceId,
          sessionId: client.sessionId,
        },
      });
      break;
    }

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

      const pathValidation = validatePath(filePath, client.spaceRoot);
      if (!pathValidation.valid) {
        sendWebSocketMessage(client, {
          type: 'res',
          id: message.id,
          error: { code: 403, message: 'Permission denied: path escape attempt' },
        });
        return;
      }

      handleFileWrite(clientId, message.id, pathValidation.resolvedPath!, fileContent, client).catch((error) => {
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

function setupWebSocketClient(ws: WsWebSocket, spaceId: string, space: SpaceRecord, userId: string, userRole: string): void {
  const { session: chatSession } = getOrCreateSession(space.path, userId);

  const clientId = generateMessageId();
  const client: WebSocketClient = {
    ws,
    spaceId,
    role: userRole,
    userId,
    spacePath: space.path,
    spaceRoot: resolveSpaceRoot(space),
    config: space.config,
    sessionId: chatSession.id,
  };

  connectedClients.set(clientId, client);

  // Start watching this space on first client connection
  const count = (spaceClientCount.get(spaceId) ?? 0) + 1;
  spaceClientCount.set(spaceId, count);
  if (count === 1) {
    fileWatcher.watch(spaceId, client.spaceRoot);
  }

  const historyMessages = getSessionMessages(space.path, userId);
  for (const msg of historyMessages) {
    sendWebSocketMessage(client, {
      type: 'event',
      event: 'history_message',
      payload: msg,
    });
  }

  ws.on('message', (data) => {
    try {
      const message: WebSocketMessage = JSON.parse(String(data));
      handleMessage(clientId, message);
    } catch {}
  });

  const cleanupClient = () => {
    const abortController = activeStreams.get(clientId);
    if (abortController) {
      abortController.abort();
      activeStreams.delete(clientId);
    }
    connectedClients.delete(clientId);

    // Stop watching this space when last client disconnects
    const remaining = (spaceClientCount.get(spaceId) ?? 1) - 1;
    if (remaining <= 0) {
      spaceClientCount.delete(spaceId);
      fileWatcher.unwatch(spaceId);
    } else {
      spaceClientCount.set(spaceId, remaining);
    }
  };

  ws.on('close', cleanupClient);
  ws.on('error', cleanupClient);
}

/**
 * Starts a dedicated HTTP+WebSocket server for the plugin.
 * The gateway does not route WebSocket upgrades to plugin HTTP routes —
 * it treats all WS connections to its port as gateway control-plane clients.
 * This standalone server bypasses that limitation entirely.
 */
export function startWebSocketServer(port: number): void {
  console.log(`[ai-spaces] Starting WebSocket server on port ${port}`);
  const httpServer = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('AI Spaces WebSocket server');
  });

  httpServer.on('error', (err) => {
    console.error(`[ai-spaces] WebSocket server error:`, err.message);
  });

  const wsServer = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathMatch =
      url.pathname.match(/^\/api\/spaces\/([^/]+)\/ws$/) ||
      url.pathname.match(/^\/ws\/spaces\/([^/]+)$/);

    if (!pathMatch) {
      socket.destroy();
      return;
    }

    const spaceId = pathMatch[1];
    const space = getSpace(spaceId);
    if (!space) {
      socket.destroy();
      return;
    }

    const session = validateSession(req);
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const userId = (session.userId as string) || 'anonymous';
    const userRole = (session.role as string) || 'viewer';

    wsServer.handleUpgrade(req, socket, head, (ws) => {
      setupWebSocketClient(ws, spaceId, space, userId, userRole);
    });
  });

  httpServer.listen(port, '127.0.0.1', () => {
    console.log(`[ai-spaces] WebSocket server listening on ws://127.0.0.1:${port}`);
  });
}

export async function handleSpaceWebSocket(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  console.log('[ai-spaces] handleSpaceWebSocket called, url:', req.url);

  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'WebSocket upgrade required' }));
    return true;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathMatch =
    url.pathname.match(/^\/api\/spaces\/([^/]+)\/ws$/) ||
    url.pathname.match(/^\/spaces-ws\/([^/]+)$/);

  if (!pathMatch) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
    return true;
  }

  const spaceId = pathMatch[1];
  const space = getSpace(spaceId);
  if (!space) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Space not found' }));
    return true;
  }

  const session = validateSession(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return true;
  }
  const userId = (session.userId as string) || 'anonymous';
  const userRole = (session.role as string) || 'viewer';

  console.log('[ai-spaces] Upgrading WebSocket for space:', spaceId);

  // Keep this promise pending until the WS session ends.
  // This prevents the gateway's HTTP framework from finalizing/destroying
  // the socket while the WebSocket session is active.
  await new Promise<void>((resolve) => {
    wss.handleUpgrade(req, req.socket as Socket, Buffer.alloc(0), (ws) => {
      setupWebSocketClient(ws, spaceId, space, userId, userRole);
      ws.on('close', resolve);
      ws.on('error', () => resolve());
    });
  });

  return true;
}
