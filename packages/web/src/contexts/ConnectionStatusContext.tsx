import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { RequestPermissionRequest, RequestPermissionResponse, SessionNotification } from '@agentclientprotocol/sdk';
import type { ChatMessage } from '@ai-spaces/shared';
import { wsToAcpStream } from '../lib/ws-transport.js';
import { PermissionDialog } from '../components/PermissionDialog.js';
import { writeSpaceFileHttp } from '../api/spaceFiles.js';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export type FileChangedAction = 'created' | 'modified' | 'deleted';

export interface FileChangedPayload {
  path: string;
  action: FileChangedAction;
}

interface ConnectionStatusContextValue {
  status: ConnectionStatus;
  reconnectAttempt: number;
  wasReconnected: boolean;
  clearReconnected: () => void;
  messages: ChatMessage[];
  isStreaming: boolean;
  activeTopicPath: string;
  promotedTopicPaths: ReadonlySet<string>;
  selectTopic: (topicPath: string) => Promise<void>;
  promoteTopic: (topicPath: string, targetType: 'file' | 'directory') => Promise<void>;
  archiveTopic: (topicPath: string) => Promise<void>;
  refreshTopics: () => Promise<void>;
  sendMessage: (content: string) => void;
  writeFile: (path: string, content: string) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  writeFileHttp: (spaceId: string, path: string, content: string) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  reconnect: () => void;
  disconnect: () => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useConnectionStatus(): ConnectionStatusContextValue {
  const ctx = useContext(ConnectionStatusContext);
  if (!ctx) throw new Error('useConnectionStatus must be used within a ConnectionStatusProvider');
  return ctx;
}

const generateId = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function buildSpaceWebSocketUrl(spaceId: string, accessToken?: string | null): string {
  let { hostname } = window.location;
  if (hostname === '0.0.0.0' || hostname === '[::]' || hostname === '::') hostname = '127.0.0.1';
  const { port, protocol } = window.location;
  const host = port ? `${hostname}:${port}` : hostname;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${wsProtocol}//${host}/ws/spaces/${spaceId}`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

function wsDebug(event: string, data?: Record<string, unknown>): void {
  try {
    console.debug('[chat-ws]', event, data ?? {});
  } catch {
    // ignore
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function normalizeTopicPath(topicPath: string): string {
  const segments = topicPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.includes('..') || segments.some((segment) => segment.startsWith('.'))) throw new Error('Invalid topic path');
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

function topicPathToCwd(topicPath: string): string {
  return topicPath === '/' ? '' : topicPath.slice(1);
}

interface ConnectionStatusProviderProps {
  spaceId: string;
  accessToken?: string | null;
  onFileChanged?: (event: FileChangedPayload) => void;
  children: ReactNode;
}

export function ConnectionStatusProvider({
  spaceId,
  accessToken,
  onFileChanged,
  children,
}: ConnectionStatusProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTopicPath, setActiveTopicPath] = useState('/');
  const [promotedTopicPaths, setPromotedTopicPaths] = useState<ReadonlySet<string>>(new Set());
  const [wasReconnected, setWasReconnected] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<{
    request: RequestPermissionRequest;
    resolve: (response: RequestPermissionResponse) => void;
  } | null>(null);

  // connectKey is the effect trigger — only incremented after the backoff delay elapses
  const [connectKey, setConnectKey] = useState(0);
  const reconnectAttemptRef = useRef(0); // for delay calc, does NOT trigger effect

  const connectionRef = useRef<ClientSideConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeTopicPathRef = useRef('/');
  const wsRef = useRef<WebSocket | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const onFileChangedRef = useRef(onFileChanged);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const wasReconnectingRef = useRef(false);

  useEffect(() => { onFileChangedRef.current = onFileChanged; }, [onFileChanged]);
  useEffect(() => { activeTopicPathRef.current = activeTopicPath; }, [activeTopicPath]);

  const refreshTopics = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/spaces/${spaceId}/topics`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) throw new Error('Failed to load promoted topics');
    const data = await response.json() as { topics: Array<{ topicPath: string }> };
    setPromotedTopicPaths(new Set(data.topics.map((topic) => topic.topicPath.replace(/^\/+/, ''))));
  }, [accessToken, spaceId]);

  useEffect(() => {
    if (accessToken === null) return;
    const timeout = setTimeout(() => void refreshTopics(), 0);
    return () => clearTimeout(timeout);
  }, [accessToken, refreshTopics]);

  const fetchPersistedSessionId = useCallback(async (topicPath: string): Promise<string | null> => {
    const response = await fetch(`/api/spaces/${spaceId}/topics/session?path=${encodeURIComponent(topicPath)}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) throw new Error('Failed to load topic session');
    const data = await response.json() as { topic: { acpSessionId: string } | null };
    return data.topic?.acpSessionId ?? null;
  }, [accessToken, spaceId]);

  const persistSessionId = useCallback(async (topicPath: string, acpSessionId: string): Promise<void> => {
    const response = await fetch(`/api/spaces/${spaceId}/topics/session`, {
      method: 'PUT',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topicPath, acpSessionId }),
    });
    if (!response.ok) throw new Error('Failed to persist topic session');
  }, [accessToken, spaceId]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const clearReconnected = useCallback(() => setWasReconnected(false), []);

  useEffect(() => {
    if (accessToken === null) {
      return;
    }

    intentionalDisconnectRef.current = false;
    let cancelled = false;

    const wsUrl = buildSpaceWebSocketUrl(spaceId, accessToken);
    wsDebug('connect:start', { spaceId, wsUrl, connectKey });
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    // In some environments (TLS/proxy/strict-mode), a ws can remain CONNECTING indefinitely.
    // Force a retry if open hasn't happened within 12s.
    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (wsRef.current === ws && ws.readyState === WebSocket.CONNECTING && !intentionalDisconnectRef.current) {
        wsDebug('connect:timeout', { spaceId, readyState: ws.readyState, reconnectAttempt: reconnectAttemptRef.current + 1 });
        setStatus('reconnecting');
        wasReconnectingRef.current = true;
        reconnectAttemptRef.current += 1;
        ws.close();
      }
    }, 12_000);

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      clearConnectTimeout();
      wsDebug('socket:error', { spaceId, readyState: ws.readyState });
      setStatus('error');
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      clearConnectTimeout();
      wsDebug('socket:close', {
        spaceId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        intentionalDisconnect: intentionalDisconnectRef.current,
      });
      connectionRef.current = null;
      sessionIdRef.current = null;
      streamMessageIdRef.current = null;
      setIsStreaming(false);
      if (!intentionalDisconnectRef.current) {
        setStatus('reconnecting');
        wasReconnectingRef.current = true;
        reconnectAttemptRef.current += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!intentionalDisconnectRef.current) {
            setReconnectAttempt(reconnectAttemptRef.current);
            setConnectKey((k) => k + 1);
          }
        }, delay);
      }
    };

    ws.onopen = async () => {
      clearConnectTimeout();
      wsDebug('socket:open', { spaceId, wsUrl });
      if (cancelled || wsRef.current !== ws) {
        wsDebug('socket:open_stale_cleanup', { spaceId });
        ws.close(1000, 'effect cleanup');
        return;
      }

      try {
        const { output, input } = wsToAcpStream(ws);
        const stream = ndJsonStream(output, input);

        const connection = new ClientSideConnection(
          () => ({
            sessionUpdate: async (params: SessionNotification) => {
              const update = params.update;
              const updateType = update.sessionUpdate;

              if (updateType === 'agent_message_chunk' || updateType === 'user_message_chunk') {
                const block = update.content;
                const text = block.type === 'text' ? block.text : '';

                if (updateType === 'agent_message_chunk') {
                  if (streamMessageIdRef.current) {
                    // Active stream: append to current message
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === streamMessageIdRef.current
                          ? { ...msg, content: msg.content + text }
                          : msg,
                      ),
                    );
                  } else {
                    // History replay: create a complete message
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: generateId(),
                        role: 'assistant' as const,
                        content: text,
                        timestamp: new Date().toISOString(),
                      },
                    ]);
                  }
                } else {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: generateId(),
                      role: 'user' as const,
                      content: text,
                      timestamp: new Date().toISOString(),
                    },
                  ]);
                }
              }
            },

            requestPermission: (params: RequestPermissionRequest) =>
              new Promise<RequestPermissionResponse>((resolve) => {
                setPendingPermission({ request: params, resolve });
              }),

            extNotification: async (method: string, params: Record<string, unknown>) => {
              if (method === 'workspace/file_changed') {
                const { path, action, triggeredBy } = params as {
                  path: string;
                  action: FileChangedAction;
                  triggeredBy?: string;
                };
                onFileChangedRef.current?.({ path, action });
                window.dispatchEvent(
                  new CustomEvent('fileModified', {
                    detail: { path, action, triggeredBy: triggeredBy ?? 'agent' },
                  }),
                );
              }
            },
          }),
          stream,
        );

        wsDebug('acp:initialize_start', { spaceId });
        await withTimeout(
          connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} }),
          12_000,
          'ACP initialize',
        );
        wsDebug('acp:initialize_ok', { spaceId });
        if (cancelled || wsRef.current !== ws) return;

        const topicPath = activeTopicPathRef.current;
        const storedSessionId = await fetchPersistedSessionId(topicPath);
        let sessionId: string;

        setMessages([]); // clear before history replay

        if (storedSessionId) {
          try {
            wsDebug('acp:loadSession_start', { spaceId, storedSessionId });
            await withTimeout(
              connection.loadSession({ sessionId: storedSessionId, cwd: topicPathToCwd(topicPath), mcpServers: [] }),
              12_000,
              'ACP loadSession',
            );
            wsDebug('acp:loadSession_ok', { spaceId, storedSessionId });
            if (cancelled || wsRef.current !== ws) return;
            sessionId = storedSessionId;
          } catch {
            if (cancelled || wsRef.current !== ws) return;
            wsDebug('acp:newSession_start_after_load_fail', { spaceId });
            const result = await withTimeout(
              connection.newSession({ cwd: topicPathToCwd(topicPath), mcpServers: [] }),
              12_000,
              'ACP newSession (after load fail)',
            );
            wsDebug('acp:newSession_ok_after_load_fail', { spaceId, sessionId: result.sessionId });
            if (cancelled || wsRef.current !== ws) return;
            sessionId = result.sessionId;
          }
        } else {
          wsDebug('acp:newSession_start', { spaceId });
          const result = await withTimeout(
            connection.newSession({ cwd: topicPathToCwd(topicPath), mcpServers: [] }),
            12_000,
            'ACP newSession',
          );
          wsDebug('acp:newSession_ok', { spaceId, sessionId: result.sessionId });
          if (cancelled || wsRef.current !== ws) return;
          sessionId = result.sessionId;
        }

        await persistSessionId(topicPath, sessionId);
        connectionRef.current = connection;
        sessionIdRef.current = sessionId;

        if (cancelled || wsRef.current !== ws) return;

        setStatus('connected');
        setReconnectAttempt(0);
        if (wasReconnectingRef.current) {
          setWasReconnected(true);
          wasReconnectingRef.current = false;
        }
        intentionalDisconnectRef.current = false;
      } catch (err) {
        wsDebug('acp:setup_error', { spaceId, error: (err as Error).message });
        if (!cancelled && wsRef.current === ws) {
          setStatus('reconnecting');
          wasReconnectingRef.current = true;
          reconnectAttemptRef.current += 1;
          const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!intentionalDisconnectRef.current) {
              setReconnectAttempt(reconnectAttemptRef.current);
              setConnectKey((k) => k + 1);
            }
          }, delay);
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1011, 'acp setup failed');
          }
        }
      }
    };

    return () => {
      cancelled = true;
      intentionalDisconnectRef.current = true;
      clearReconnectTimeout();
      clearConnectTimeout();
      wsRef.current = null;
      connectionRef.current = null;
      sessionIdRef.current = null;
      streamMessageIdRef.current = null;
      // Avoid noisy browser warning in React StrictMode dev double-invoke:
      // "WebSocket is closed before the connection is established."
      // If still connecting, onopen handler already guards stale sockets and closes safely.
      if (ws.readyState === WebSocket.OPEN) {
        wsDebug('cleanup:close_open_socket', { spaceId });
        ws.close(1000, 'effect cleanup');
      }
    };
  }, [spaceId, accessToken, connectKey, clearReconnectTimeout, clearConnectTimeout, fetchPersistedSessionId, persistSessionId]);

  const selectTopic = useCallback(async (requestedTopicPath: string): Promise<void> => {
    const connection = connectionRef.current;
    if (!connection || status !== 'connected' || isStreaming) return;
    const topicPath = normalizeTopicPath(requestedTopicPath);
    if (topicPath === activeTopicPathRef.current) return;

    setMessages([]);
    const storedSessionId = await fetchPersistedSessionId(topicPath);
    let sessionId = storedSessionId;
    if (sessionId) {
      try {
        await connection.loadSession({ sessionId, cwd: topicPathToCwd(topicPath), mcpServers: [] });
      } catch {
        sessionId = null;
      }
    }
    if (!sessionId) {
      const result = await connection.newSession({ cwd: topicPathToCwd(topicPath), mcpServers: [] });
      sessionId = result.sessionId;
    }
    await persistSessionId(topicPath, sessionId);
    sessionIdRef.current = sessionId;
    activeTopicPathRef.current = topicPath;
    setActiveTopicPath(topicPath);
  }, [fetchPersistedSessionId, isStreaming, persistSessionId, status]);

  const promoteTopic = useCallback(async (topicPath: string, targetType: 'file' | 'directory'): Promise<void> => {
    const response = await fetch(`/api/spaces/${spaceId}/topics`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topicPath, targetType }),
    });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Failed to promote topic');
    await refreshTopics();
  }, [accessToken, refreshTopics, spaceId]);

  const archiveTopic = useCallback(async (topicPath: string): Promise<void> => {
    const response = await fetch(`/api/spaces/${spaceId}/topics`, {
      method: 'DELETE',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topicPath }),
    });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Failed to convert topic back');
    if (normalizeTopicPath(topicPath) === activeTopicPathRef.current) await selectTopic('/');
    await refreshTopics();
  }, [accessToken, refreshTopics, selectTopic, spaceId]);

  const reconnect = useCallback(() => {
    clearReconnectTimeout();
    clearConnectTimeout();
    intentionalDisconnectRef.current = true; // stays true; new effect resets it
    wasReconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
    if (wsRef.current) wsRef.current.close();
    setStatus('connecting');
    setReconnectAttempt(0);
    setConnectKey((k) => k + 1);
  }, [clearReconnectTimeout, clearConnectTimeout]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimeout();
    clearConnectTimeout();
    if (wsRef.current) wsRef.current.close();
    setStatus('disconnected');
  }, [clearReconnectTimeout, clearConnectTimeout]);

  const sendMessage = useCallback(
    (content: string) => {
      const connection = connectionRef.current;
      const sessionId = sessionIdRef.current;
      if (!connection || !sessionId || status !== 'connected' || streamMessageIdRef.current) return;

      const userMsgId = generateId();
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content, timestamp: new Date().toISOString() },
      ]);

      const assistantMsgId = generateId();
      streamMessageIdRef.current = assistantMsgId;
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString() },
      ]);
      setIsStreaming(true);

      connection
        .prompt({ sessionId, prompt: [{ type: 'text', text: content }] })
        .catch(() => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + '\n[Connection error]' }
                : msg,
            ),
          );
        })
        .finally(() => {
          setIsStreaming(false);
          streamMessageIdRef.current = null;
        });
    },
    [status],
  );

  const writeFile = useCallback(
    async (path: string, content: string): Promise<{ success: boolean; path?: string; modified?: string; error?: string }> => {
      return await writeSpaceFileHttp(spaceId, path, content);
    },
    [spaceId],
  );

  const writeFileHttp = useCallback(
    (sid: string, filePath: string, fileContent: string) => writeSpaceFileHttp(sid, filePath, fileContent),
    [],
  );

  const value = useMemo<ConnectionStatusContextValue>(
    () => ({
      status,
      reconnectAttempt,
      wasReconnected,
      clearReconnected,
      messages,
      isStreaming,
      activeTopicPath,
      promotedTopicPaths,
      selectTopic,
      promoteTopic,
      archiveTopic,
      refreshTopics,
      sendMessage,
      writeFile,
      writeFileHttp,
      reconnect,
      disconnect,
    }),
    [
      status,
      reconnectAttempt,
      wasReconnected,
      clearReconnected,
      messages,
      isStreaming,
      activeTopicPath,
      promotedTopicPaths,
      selectTopic,
      promoteTopic,
      archiveTopic,
      refreshTopics,
      sendMessage,
      writeFile,
      writeFileHttp,
      reconnect,
      disconnect,
    ],
  );

  return (
    <ConnectionStatusContext.Provider value={value}>
      {children}
      {pendingPermission && (
        <PermissionDialog
          request={pendingPermission.request}
          onRespond={(response) => {
            pendingPermission.resolve(response);
            setPendingPermission(null);
          }}
        />
      )}
    </ConnectionStatusContext.Provider>
  );
}
