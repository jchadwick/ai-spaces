import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { ChatMessage } from "@ai-spaces/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { writeSpaceFileHttp } from "../api/spaceFiles.js";
import { PermissionDialog } from "../components/PermissionDialog.js";
import { wsToAcpStream } from "../lib/ws-transport.js";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

export type FileChangedAction = "created" | "modified" | "deleted";

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
  activeRoomPath: string;
  promotedRoomPaths: ReadonlySet<string>;
  selectRoom: (roomPath: string) => Promise<void>;
  promoteRoom: (roomPath: string, targetType: "file" | "directory") => Promise<void>;
  archiveRoom: (roomPath: string) => Promise<void>;
  refreshRooms: () => Promise<void>;
  sendMessage: (content: string) => void;
  writeFile: (
    path: string,
    content: string,
  ) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  writeFileHttp: (
    spaceId: string,
    path: string,
    content: string,
  ) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  reconnect: () => void;
  disconnect: () => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useConnectionStatus(): ConnectionStatusContextValue {
  const ctx = useContext(ConnectionStatusContext);
  if (!ctx) throw new Error("useConnectionStatus must be used within a ConnectionStatusProvider");
  return ctx;
}

const generateId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function buildSpaceWebSocketUrl(spaceId: string, accessToken?: string | null): string {
  let { hostname } = window.location;
  if (hostname === "0.0.0.0" || hostname === "[::]" || hostname === "::") hostname = "127.0.0.1";
  const { port, protocol } = window.location;
  const host = port ? `${hostname}:${port}` : hostname;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  const base = `${wsProtocol}//${host}/ws/spaces/${spaceId}`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

function wsDebug(_event: string, _data?: Record<string, unknown>): void {
  // Intentionally a no-op; enable browser devtools network filter instead
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function normalizeRoomPath(roomPath: string): string {
  const segments = roomPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.includes("..") || segments.some((segment) => segment.startsWith(".")))
    throw new Error("Invalid room path");
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

function roomPathToCwd(roomPath: string): string {
  return roomPath === "/" ? "" : roomPath.slice(1);
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
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRoomPath, setActiveRoomPath] = useState("/");
  const [promotedRoomPaths, setPromotedRoomPaths] = useState<ReadonlySet<string>>(new Set());
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
  const activeRoomPathRef = useRef("/");
  const wsRef = useRef<WebSocket | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const onFileChangedRef = useRef(onFileChanged);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const wasReconnectingRef = useRef(false);

  useEffect(() => {
    onFileChangedRef.current = onFileChanged;
  }, [onFileChanged]);
  useEffect(() => {
    activeRoomPathRef.current = activeRoomPath;
  }, [activeRoomPath]);

  const refreshRooms = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/spaces/${spaceId}/rooms`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) throw new Error("Failed to load promoted rooms");
    const data = (await response.json()) as { rooms: Array<{ roomPath: string }> };
    setPromotedRoomPaths(new Set(data.rooms.map((room) => room.roomPath.replace(/^\/+/, ""))));
  }, [accessToken, spaceId]);

  useEffect(() => {
    if (accessToken === null) return;
    const timeout = setTimeout(() => void refreshRooms(), 0);
    return () => clearTimeout(timeout);
  }, [accessToken, refreshRooms]);

  const fetchPersistedSessionId = useCallback(
    async (roomPath: string): Promise<string | null> => {
      const response = await fetch(
        `/api/spaces/${spaceId}/rooms/session?path=${encodeURIComponent(roomPath)}`,
        {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        },
      );
      if (!response.ok) throw new Error("Failed to load room session");
      const data = (await response.json()) as { room: { acpSessionId: string } | null };
      return data.room?.acpSessionId ?? null;
    },
    [accessToken, spaceId],
  );

  const persistSessionId = useCallback(
    async (roomPath: string, acpSessionId: string): Promise<void> => {
      const response = await fetch(`/api/spaces/${spaceId}/rooms/session`, {
        method: "PUT",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomPath, acpSessionId }),
      });
      if (!response.ok) throw new Error("Failed to persist room session");
    },
    [accessToken, spaceId],
  );

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
    wsDebug("connect:start", { spaceId, wsUrl, connectKey });
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    // In some environments (TLS/proxy/strict-mode), a ws can remain CONNECTING indefinitely.
    // Force a retry if open hasn't happened within 12s.
    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (
        wsRef.current === ws &&
        ws.readyState === WebSocket.CONNECTING &&
        !intentionalDisconnectRef.current
      ) {
        wsDebug("connect:timeout", {
          spaceId,
          readyState: ws.readyState,
          reconnectAttempt: reconnectAttemptRef.current + 1,
        });
        setStatus("reconnecting");
        wasReconnectingRef.current = true;
        reconnectAttemptRef.current += 1;
        ws.close();
      }
    }, 12_000);

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      clearConnectTimeout();
      wsDebug("socket:error", { spaceId, readyState: ws.readyState });
      setStatus("error");
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      clearConnectTimeout();
      wsDebug("socket:close", {
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
        setStatus("reconnecting");
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
      wsDebug("socket:open", { spaceId, wsUrl });
      if (cancelled || wsRef.current !== ws) {
        wsDebug("socket:open_stale_cleanup", { spaceId });
        ws.close(1000, "effect cleanup");
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

              if (updateType === "agent_message_chunk" || updateType === "user_message_chunk") {
                const block = update.content;
                const text = block.type === "text" ? block.text : "";
                const replace =
                  (update as { _meta?: { replace?: boolean } })._meta?.replace ?? false;

                if (updateType === "agent_message_chunk") {
                  if (streamMessageIdRef.current) {
                    // Active stream: append or replace current message
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === streamMessageIdRef.current
                          ? { ...msg, content: replace ? text : msg.content + text }
                          : msg,
                      ),
                    );
                  } else {
                    // History replay: create a complete message
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: generateId(),
                        role: "assistant" as const,
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
                      role: "user" as const,
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
              if (method === "workspace/file_changed") {
                const { path, action, triggeredBy } = params as {
                  path: string;
                  action: FileChangedAction;
                  triggeredBy?: string;
                };
                onFileChangedRef.current?.({ path, action });
                window.dispatchEvent(
                  new CustomEvent("fileModified", {
                    detail: { path, action, triggeredBy: triggeredBy ?? "agent" },
                  }),
                );
              }
            },
          }),
          stream,
        );

        wsDebug("acp:initialize_start", { spaceId });
        await withTimeout(
          connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} }),
          12_000,
          "ACP initialize",
        );
        wsDebug("acp:initialize_ok", { spaceId });
        if (cancelled || wsRef.current !== ws) return;

        const roomPath = activeRoomPathRef.current;
        const storedSessionId = await fetchPersistedSessionId(roomPath);
        let sessionId: string;

        setMessages([]); // clear before history replay

        if (storedSessionId) {
          try {
            wsDebug("acp:loadSession_start", { spaceId, storedSessionId });
            await withTimeout(
              connection.loadSession({
                sessionId: storedSessionId,
                cwd: roomPathToCwd(roomPath),
                mcpServers: [],
              }),
              12_000,
              "ACP loadSession",
            );
            wsDebug("acp:loadSession_ok", { spaceId, storedSessionId });
            if (cancelled || wsRef.current !== ws) return;
            sessionId = storedSessionId;
          } catch {
            if (cancelled || wsRef.current !== ws) return;
            wsDebug("acp:newSession_start_after_load_fail", { spaceId });
            const result = await withTimeout(
              connection.newSession({ cwd: roomPathToCwd(roomPath), mcpServers: [] }),
              12_000,
              "ACP newSession (after load fail)",
            );
            wsDebug("acp:newSession_ok_after_load_fail", { spaceId, sessionId: result.sessionId });
            if (cancelled || wsRef.current !== ws) return;
            sessionId = result.sessionId;
          }
        } else {
          wsDebug("acp:newSession_start", { spaceId });
          const result = await withTimeout(
            connection.newSession({ cwd: roomPathToCwd(roomPath), mcpServers: [] }),
            12_000,
            "ACP newSession",
          );
          wsDebug("acp:newSession_ok", { spaceId, sessionId: result.sessionId });
          if (cancelled || wsRef.current !== ws) return;
          sessionId = result.sessionId;
        }

        await persistSessionId(roomPath, sessionId);
        connectionRef.current = connection;
        sessionIdRef.current = sessionId;

        if (cancelled || wsRef.current !== ws) return;

        setStatus("connected");
        setReconnectAttempt(0);
        if (wasReconnectingRef.current) {
          setWasReconnected(true);
          wasReconnectingRef.current = false;
        }
        intentionalDisconnectRef.current = false;
      } catch (err) {
        wsDebug("acp:setup_error", { spaceId, error: (err as Error).message });
        if (!cancelled && wsRef.current === ws) {
          setStatus("reconnecting");
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
            ws.close(1011, "acp setup failed");
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
        wsDebug("cleanup:close_open_socket", { spaceId });
        ws.close(1000, "effect cleanup");
      }
    };
  }, [
    spaceId,
    accessToken,
    connectKey,
    clearReconnectTimeout,
    clearConnectTimeout,
    fetchPersistedSessionId,
    persistSessionId,
  ]);

  const selectRoom = useCallback(
    async (requestedRoomPath: string): Promise<void> => {
      const connection = connectionRef.current;
      if (!connection || status !== "connected" || isStreaming) return;
      const roomPath = normalizeRoomPath(requestedRoomPath);
      // #region agent log
      fetch("http://127.0.0.1:7399/ingest/acbd8104-ecfc-434c-a54a-bcf58319b4b4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "897816" },
        body: JSON.stringify({
          sessionId: "897816",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "ConnectionStatusContext.tsx:selectRoom",
          message: "selectRoom normalized path",
          data: { requestedRoomPath, normalizedRoomPath: roomPath, spaceId },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (roomPath === activeRoomPathRef.current) return;

      setMessages([]);
      const storedSessionId = await fetchPersistedSessionId(roomPath);
      let sessionId = storedSessionId;
      if (sessionId) {
        try {
          await connection.loadSession({
            sessionId,
            cwd: roomPathToCwd(roomPath),
            mcpServers: [],
          });
        } catch {
          sessionId = null;
        }
      }
      if (!sessionId) {
        const result = await connection.newSession({
          cwd: roomPathToCwd(roomPath),
          mcpServers: [],
        });
        sessionId = result.sessionId;
      }
      await persistSessionId(roomPath, sessionId);
      sessionIdRef.current = sessionId;
      activeRoomPathRef.current = roomPath;
      setActiveRoomPath(roomPath);
    },
    [fetchPersistedSessionId, isStreaming, persistSessionId, spaceId, status],
  );

  const promoteRoom = useCallback(
    async (roomPath: string, targetType: "file" | "directory"): Promise<void> => {
      const response = await fetch(`/api/spaces/${spaceId}/rooms`, {
        method: "POST",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomPath, targetType }),
      });
      if (!response.ok)
        throw new Error(
          ((await response.json()) as { error?: string }).error ?? "Failed to promote room",
        );
      await refreshRooms();
    },
    [accessToken, refreshRooms, spaceId],
  );

  const archiveRoom = useCallback(
    async (roomPath: string): Promise<void> => {
      const response = await fetch(`/api/spaces/${spaceId}/rooms`, {
        method: "DELETE",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomPath }),
      });
      if (!response.ok)
        throw new Error(
          ((await response.json()) as { error?: string }).error ?? "Failed to convert room back",
        );
      if (normalizeRoomPath(roomPath) === activeRoomPathRef.current) await selectRoom("/");
      await refreshRooms();
    },
    [accessToken, refreshRooms, selectRoom, spaceId],
  );

  const reconnect = useCallback(() => {
    clearReconnectTimeout();
    clearConnectTimeout();
    intentionalDisconnectRef.current = true; // stays true; new effect resets it
    wasReconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");
    setReconnectAttempt(0);
    setConnectKey((k) => k + 1);
  }, [clearReconnectTimeout, clearConnectTimeout]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimeout();
    clearConnectTimeout();
    if (wsRef.current) wsRef.current.close();
    setStatus("disconnected");
  }, [clearReconnectTimeout, clearConnectTimeout]);

  const sendMessage = useCallback(
    (content: string) => {
      const connection = connectionRef.current;
      const sessionId = sessionIdRef.current;
      if (!connection || !sessionId || status !== "connected" || streamMessageIdRef.current) return;

      const userMsgId = generateId();
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content, timestamp: new Date().toISOString() },
      ]);

      const assistantMsgId = generateId();
      streamMessageIdRef.current = assistantMsgId;
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date().toISOString() },
      ]);
      setIsStreaming(true);

      // #region agent log
      fetch("http://127.0.0.1:7399/ingest/acbd8104-ecfc-434c-a54a-bcf58319b4b4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "897816" },
        body: JSON.stringify({
          sessionId: "897816",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "ConnectionStatusContext.tsx:sendMessage",
          message: "sendMessage prompt",
          data: {
            spaceId,
            sessionId,
            activeRoomPath: activeRoomPathRef.current,
            status,
            contentLength: content.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      connection
        .prompt({ sessionId, prompt: [{ type: "text", text: content }] })
        .catch(() => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: `${msg.content}\n[Connection error]` }
                : msg,
            ),
          );
        })
        .finally(() => {
          setIsStreaming(false);
          streamMessageIdRef.current = null;
        });
    },
    [spaceId, status],
  );

  const writeFile = useCallback(
    async (
      path: string,
      content: string,
    ): Promise<{ success: boolean; path?: string; modified?: string; error?: string }> => {
      return await writeSpaceFileHttp(spaceId, path, content);
    },
    [spaceId],
  );

  const writeFileHttp = useCallback(
    (sid: string, filePath: string, fileContent: string) =>
      writeSpaceFileHttp(sid, filePath, fileContent),
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
      activeRoomPath,
      promotedRoomPaths,
      selectRoom,
      promoteRoom,
      archiveRoom,
      refreshRooms,
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
      activeRoomPath,
      promotedRoomPaths,
      selectRoom,
      promoteRoom,
      archiveRoom,
      refreshRooms,
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
