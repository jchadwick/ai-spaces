import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, WebSocketMessage } from '@ai-spaces/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseSpaceWebSocketOptions {
  spaceId: string;
  token: string;
  onMessage?: (message: ChatMessage) => void;
}

interface UseSpaceWebSocketReturn {
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  sendMessage: (content: string) => void;
  reconnect: () => void;
  isStreaming: boolean;
}

export function useSpaceWebSocket({ spaceId, token, onMessage }: UseSpaceWebSocketOptions): UseSpaceWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessageIdRef = useRef<string | null>(null);
  const currentStreamContentRef = useRef<string>('');
  const onMessageRef = useRef(onMessage);
  const mountedRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    mountedRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/spaces/${spaceId}/ws?t=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) {
        setConnectionStatus('connected');
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setConnectionStatus('disconnected');
      }
      wsRef.current = null;
    };

    ws.onerror = () => {
      if (mountedRef.current) {
        setConnectionStatus('error');
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        if (!mountedRef.current) return;

        if (message.type === 'event') {
          switch (message.event) {
            case 'connected':
              break;

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
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [spaceId, token]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || connectionStatus !== 'connected') {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);

    const requestId = crypto.randomUUID();
    const message: WebSocketMessage = {
      type: 'req',
      id: requestId,
      method: 'chat.send',
      params: { content },
    };

    wsRef.current.send(JSON.stringify(message));
  }, [connectionStatus]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setConnectionStatus('connecting');
  }, []);

  return {
    messages,
    connectionStatus,
    sendMessage,
    reconnect,
    isStreaming,
  };
}