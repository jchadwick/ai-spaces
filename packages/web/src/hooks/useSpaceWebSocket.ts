import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, WebSocketMessage } from '@ai-spaces/shared';
import { writeSpaceFileHttp } from '../api/spaceFiles';

const generateId = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// File size thresholds — kept in sync with server defaults (FILE_STREAM_THRESHOLD_MB / MAX_FILE_SIZE_MB)
const FILE_STREAM_THRESHOLD_BYTES = 1 * 1024 * 1024; // 1 MB
const FILE_CHUNK_SIZE_BYTES = 256 * 1024; // 256 KB per chunk

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

export type FileChangedAction = 'created' | 'modified' | 'deleted';

export interface FileChangedPayload {
  path: string;
  action: FileChangedAction;
}

interface UseSpaceWebSocketOptions {
  spaceId: string;
  accessToken?: string | null;
  onMessage?: (message: ChatMessage) => void;
  onFileChanged?: (event: FileChangedPayload) => void;
}

interface UseSpaceWebSocketReturn {
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  wasReconnected: boolean;
  clearReconnected: () => void;
  sendMessage: (content: string) => void;
  writeFile: (path: string, content: string) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  writeFileHttp: (spaceId: string, path: string, content: string) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  reconnect: () => void;
  disconnect: () => void;
  isStreaming: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** Hostname safe to use as a WebSocket peer (not a bind-all address). */
function websocketHostForPage(): string {
  let { hostname } = window.location;
  if (hostname === '0.0.0.0' || hostname === '[::]' || hostname === '::') {
    hostname = '127.0.0.1';
  }
  const { port } = window.location;
  return port ? `${hostname}:${port}` : hostname;
}

function buildSpaceWebSocketUrl(spaceId: string, accessToken?: string | null): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${websocketHostForPage()}/ws/spaces/${spaceId}`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

export function useSpaceWebSocket({ spaceId, accessToken, onMessage, onFileChanged }: UseSpaceWebSocketOptions): UseSpaceWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [wasReconnected, setWasReconnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessageIdRef = useRef<string | null>(null);
  const currentStreamContentRef = useRef<string>('');
  const onMessageRef = useRef(onMessage);
  const onFileChangedRef = useRef(onFileChanged);
  const mountedRef = useRef(false);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const wasReconnectingRef = useRef(false);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onFileChangedRef.current = onFileChanged;
  }, [onFileChanged]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const clearReconnected = useCallback(() => {
    setWasReconnected(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    // Wait for auth to load before connecting — a null token causes the server
    // to reject with 1008, leaving the UI stuck in 'error' state.
    if (accessToken === null) return;

    intentionalDisconnectRef.current = false;

    const wsUrl = buildSpaceWebSocketUrl(spaceId, accessToken);

    // Local flag so cleanup can signal "don't use this socket" without calling
    // close() on a CONNECTING socket (which produces a browser error).
    let cancelled = false;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // If cleanup ran before we connected, close now that we safely can.
      if (cancelled) {
        ws.close(1000, 'effect cleanup');
        return;
      }
      const connectMessage: WebSocketMessage = {
        type: 'req',
        id: 'connect',
        method: 'connect',
        params: {},
      };
      ws.send(JSON.stringify(connectMessage));
    };

    ws.onerror = () => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      if (!intentionalDisconnectRef.current) {
        setConnectionStatus('reconnecting');
        wasReconnectingRef.current = true;
        const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && !intentionalDisconnectRef.current) {
            setReconnectAttempt(n => n + 1);
          }
        }, delay);
      }
    };

    // Reset the heartbeat timeout — called on every received message.
    // If no message arrives within 60s, assume a ghost connection and close to trigger reconnect.
    const resetHeartbeat = () => {
      clearHeartbeatTimeout();
      heartbeatTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current || intentionalDisconnectRef.current) return;
        const currentWs = wsRef.current;
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          currentWs.close(4000, 'heartbeat timeout');
        }
      }, 60_000);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;

      // Any message from the server resets the dead-connection timer
      resetHeartbeat();

      try {
        const raw = JSON.parse(event.data);

        // Respond to server ping with a pong
        if (raw.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }

        // Handle server-originated file change events (not from gateway)
        if (raw.type === 'file:changed') {
          const payload = raw as { type: 'file:changed'; spaceId: string; path: string; action: FileChangedAction };
          if (onFileChangedRef.current) {
            onFileChangedRef.current({ path: payload.path, action: payload.action });
          }
          return;
        }

        const message: WebSocketMessage = raw;

        // Handle connected event
        if (message.type === 'event' && message.event === 'connected') {
          setConnectionStatus('connected');
          setReconnectAttempt(0);

          if (wasReconnectingRef.current) {
            setWasReconnected(true);
            wasReconnectingRef.current = false;
          }

          intentionalDisconnectRef.current = false;
          return;
        }

        // Handle response messages (pending request completions)
        if (message.type === 'res' && message.id) {
          const pending = pendingRequestsRef.current.get(message.id);
          if (pending) {
            pendingRequestsRef.current.delete(message.id);

            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
          return;
        }

        // Handle event messages
        if (message.type === 'event') {
          switch (message.event) {
            case 'history_message': {
              const msgPayload = message.payload as ChatMessage;
              setMessages(prev => {
                const exists = prev.some(m => m.id === msgPayload.id);
                if (exists) return prev;
                return [...prev, msgPayload];
              });
              break;
            }

            case 'file_modified': {
              const payload = message.payload as { path: string; action: string; triggeredBy?: string };
              window.dispatchEvent(new CustomEvent('fileModified', {
                detail: {
                  path: payload.path,
                  action: payload.action,
                  triggeredBy: payload.triggeredBy || 'user'
                }
              }));
              break;
            }

            case 'stream_start': {
              const payload = message.payload as { messageId: string };
              pendingMessageIdRef.current = payload.messageId;
              currentStreamContentRef.current = '';
              setIsStreaming(true);

              const assistantMessage: ChatMessage = {
                id: payload.messageId,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
              };
              setMessages(prev => [...prev, assistantMessage]);
              break;
            }

            case 'stream_chunk': {
              const payload = message.payload as { text: string };
              currentStreamContentRef.current += payload.text;

              if (pendingMessageIdRef.current) {
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === pendingMessageIdRef.current
                      ? { ...msg, content: currentStreamContentRef.current }
                      : msg
                  )
                );
              }
              break;
            }

            case 'stream_end': {
              setIsStreaming(false);
              const finalContent = currentStreamContentRef.current;
              const finalId = pendingMessageIdRef.current;
              pendingMessageIdRef.current = null;
              currentStreamContentRef.current = '';

              if (finalId && onMessageRef.current) {
                const assistantMessage: ChatMessage = {
                  id: finalId,
                  role: 'assistant',
                  content: finalContent,
                  timestamp: new Date().toISOString(),
                };
                onMessageRef.current(assistantMessage);
              }
              break;
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      cancelled = true;
      intentionalDisconnectRef.current = true;
      clearReconnectTimeout();
      clearHeartbeatTimeout();
      wsRef.current = null;
      // Only close if already OPEN — if still CONNECTING, onopen will close it
      // once the handshake finishes (avoids the "closed before established" error).
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'effect cleanup');
      }
    };
  }, [spaceId, accessToken, reconnectAttempt, clearHeartbeatTimeout]);

  const reconnect = useCallback(() => {
    clearReconnectTimeout();
    intentionalDisconnectRef.current = true;
    wasReconnectingRef.current = false;

    if (wsRef.current) {
      wsRef.current.close();
    }

    intentionalDisconnectRef.current = false;
    setConnectionStatus('connecting');
    // Force the effect to re-run by always changing reconnectAttempt
    setReconnectAttempt(n => n + 1);
  }, [clearReconnectTimeout]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimeout();
    mountedRef.current = false;
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setConnectionStatus('disconnected');
  }, [clearReconnectTimeout]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || connectionStatus !== 'connected') {
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);

    const requestId = generateId();
    const message: WebSocketMessage = {
      type: 'req',
      id: requestId,
      method: 'chat.send',
      params: { content },
    };

    wsRef.current.send(JSON.stringify(message));
  }, [connectionStatus]);

  const writeFileHttp = useCallback(
    (sid: string, filePath: string, content: string) => writeSpaceFileHttp(sid, filePath, content),
    [],
  );

  const sendRequest = useCallback(<T>(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || connectionStatus !== 'connected') {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = generateId();
      const message: WebSocketMessage = {
        type: 'req',
        id: requestId,
        method,
        params,
      };

      pendingRequestsRef.current.set(requestId, {
        resolve: (result) => resolve(result as T),
        reject,
      });

      wsRef.current.send(JSON.stringify(message));

      const timer = setTimeout(() => {
        if (pendingRequestsRef.current.has(requestId)) {
          pendingRequestsRef.current.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, timeoutMs);

      // Attach cleanup so we don't leak the timer if the request completes
      const originalPending = pendingRequestsRef.current.get(requestId)!;
      pendingRequestsRef.current.set(requestId, {
        resolve: (result) => { clearTimeout(timer); originalPending.resolve(result); },
        reject: (err) => { clearTimeout(timer); originalPending.reject(err); },
      });
    });
  }, [connectionStatus]);

  const writeFile = useCallback(async (filePath: string, content: string): Promise<{ success: boolean; path?: string; modified?: string; error?: string }> => {
    if (!wsRef.current || connectionStatus !== 'connected') {
      throw new Error('WebSocket not connected');
    }

    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content);
    const totalSize = contentBytes.byteLength;

    // Small files: use existing single-message write
    if (totalSize <= FILE_STREAM_THRESHOLD_BYTES) {
      return sendRequest<{ success: boolean; path?: string; modified?: string }>(
        'file.write',
        { path: filePath, content },
        30000
      );
    }

    // Large files: split into chunks and use the chunked streaming protocol
    const chunks: string[] = [];
    const decoder = new TextDecoder();
    for (let offset = 0; offset < contentBytes.length; offset += FILE_CHUNK_SIZE_BYTES) {
      chunks.push(decoder.decode(contentBytes.slice(offset, offset + FILE_CHUNK_SIZE_BYTES)));
    }

    // Start the write stream (timeout: 15s)
    await sendRequest<{ success: boolean }>(
      'file.write.start',
      { path: filePath, totalSize, chunkCount: chunks.length },
      15000
    );

    // Send each chunk (timeout: 30s per chunk)
    for (let i = 0; i < chunks.length; i++) {
      await sendRequest<{ success: boolean; chunksReceived: number }>(
        'file.write.chunk',
        { path: filePath, index: i, data: chunks[i] },
        30000
      );
    }

    // Finalize the stream (timeout: 15s)
    return sendRequest<{ success: boolean; path?: string; modified?: string }>(
      'file.write.end',
      { path: filePath },
      15000
    );
  }, [connectionStatus, sendRequest]);

  return {
    messages,
    connectionStatus,
    reconnectAttempt,
    wasReconnected,
    clearReconnected,
    sendMessage,
    writeFile,
    writeFileHttp,
    reconnect,
    disconnect,
    isStreaming,
  };
}