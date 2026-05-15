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

function getStoredSessionId(spaceId: string): string | null {
  try { return sessionStorage.getItem(`acp-session:${spaceId}`); } catch { return null; }
}

function storeSessionId(spaceId: string, sessionId: string): void {
  try { sessionStorage.setItem(`acp-session:${spaceId}`, sessionId); } catch { /* ignore */ }
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
  const wsRef = useRef<WebSocket | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const onFileChangedRef = useRef(onFileChanged);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const wasReconnectingRef = useRef(false);

  useEffect(() => { onFileChangedRef.current = onFileChanged; }, [onFileChanged]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearReconnected = useCallback(() => setWasReconnected(false), []);

  useEffect(() => {
    if (accessToken === null) return;

    intentionalDisconnectRef.current = false;
    let cancelled = false;

    const wsUrl = buildSpaceWebSocketUrl(spaceId, accessToken);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setStatus('error');
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
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
      if (cancelled || wsRef.current !== ws) {
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

        await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
        if (cancelled || wsRef.current !== ws) return;

        // Try to resume existing session, fall back to new session
        const storedSessionId = getStoredSessionId(spaceId);
        let sessionId: string;

        setMessages([]); // clear before history replay

        if (storedSessionId) {
          try {
            await connection.loadSession({ sessionId: storedSessionId, cwd: '', mcpServers: [] });
            if (cancelled || wsRef.current !== ws) return;
            sessionId = storedSessionId;
          } catch {
            if (cancelled || wsRef.current !== ws) return;
            const result = await connection.newSession({ cwd: '', mcpServers: [] });
            if (cancelled || wsRef.current !== ws) return;
            sessionId = result.sessionId;
          }
        } else {
          const result = await connection.newSession({ cwd: '', mcpServers: [] });
          if (cancelled || wsRef.current !== ws) return;
          sessionId = result.sessionId;
        }

        storeSessionId(spaceId, sessionId);
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
      } catch {
        if (!cancelled && wsRef.current === ws) {
          setStatus('error');
        }
      }
    };

    return () => {
      cancelled = true;
      intentionalDisconnectRef.current = true;
      clearReconnectTimeout();
      wsRef.current = null;
      connectionRef.current = null;
      sessionIdRef.current = null;
      streamMessageIdRef.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'effect cleanup');
      }
    };
  }, [spaceId, accessToken, connectKey, clearReconnectTimeout]);

  const reconnect = useCallback(() => {
    clearReconnectTimeout();
    intentionalDisconnectRef.current = true; // stays true; new effect resets it
    wasReconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
    if (wsRef.current) wsRef.current.close();
    setStatus('connecting');
    setReconnectAttempt(0);
    setConnectKey((k) => k + 1);
  }, [clearReconnectTimeout]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimeout();
    if (wsRef.current) wsRef.current.close();
    setStatus('disconnected');
  }, [clearReconnectTimeout]);

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
      const connection = connectionRef.current;
      if (!connection || status !== 'connected') {
        return { success: false, error: 'Not connected' };
      }
      try {
        await connection.extMethod('workspace/write_file', {
          spaceId,
          path,
          content,
          encoding: 'utf-8',
        });
        return { success: true, path };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
    [spaceId, status],
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
