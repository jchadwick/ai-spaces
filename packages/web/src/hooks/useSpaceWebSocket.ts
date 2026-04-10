import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, WebSocketMessage } from '@ai-spaces/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

interface UseSpaceWebSocketOptions {
  spaceId: string;
  onMessage?: (message: ChatMessage) => void;
}

interface UseSpaceWebSocketReturn {
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  wasReconnected: boolean;
  clearReconnected: () => void;
  sendMessage: (content: string) => void;
  writeFile: (path: string, content: string) => Promise<{ success: boolean; path?: string; modified?: string; error?: string }>;
  reconnect: () => void;
  disconnect: () => void;
  isStreaming: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

function calculateReconnectDelay(attempt: number): number {
  const delay = Math.pow(2, attempt) * INITIAL_RECONNECT_DELAY;
  return Math.min(delay, MAX_RECONNECT_DELAY);
}

export function useSpaceWebSocket({ spaceId, onMessage }: UseSpaceWebSocketOptions): UseSpaceWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [wasReconnected, setWasReconnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessageIdRef = useRef<string | null>(null);
  const currentStreamContentRef = useRef<string>('');
  const onMessageRef = useRef(onMessage);
  const mountedRef = useRef(false);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const wasReconnectingRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearPartialStream = useCallback(() => {
    if (pendingMessageIdRef.current) {
      setMessages(prev => prev.filter(msg => msg.id !== pendingMessageIdRef.current));
      pendingMessageIdRef.current = null;
      currentStreamContentRef.current = '';
      setIsStreaming(false);
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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/spaces/${spaceId}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      
      setConnectionStatus('connected');
      setReconnectAttempt(0);
      
      if (wasReconnectingRef.current) {
        setWasReconnected(true);
        wasReconnectingRef.current = false;
      }
      
      intentionalDisconnectRef.current = false;
      
      if (isStreaming && pendingMessageIdRef.current) {
        clearPartialStream();
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      
      wsRef.current = null;

      if (intentionalDisconnectRef.current) {
        setConnectionStatus('disconnected');
        return;
      }

      clearPartialStream();
      wasReconnectingRef.current = true;

      if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus('reconnecting');
        const delay = calculateReconnectDelay(reconnectAttempt);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && !intentionalDisconnectRef.current) {
            setReconnectAttempt(prev => prev + 1);
          }
        }, delay);
      } else {
        setConnectionStatus('error');
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        if (!mountedRef.current) return;

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

        if (message.type === 'event') {
          switch (message.event) {
            case 'connected':
              break;
            
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
      intentionalDisconnectRef.current = true;
      clearReconnectTimeout();
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [spaceId, reconnectAttempt, isStreaming, clearPartialStream, clearReconnectTimeout]);

  const reconnect = useCallback(() => {
    setReconnectAttempt(0);
    intentionalDisconnectRef.current = true;
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    intentionalDisconnectRef.current = false;
    setConnectionStatus('connecting');
  }, []);

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

  const writeFile = useCallback((path: string, content: string): Promise<{ success: boolean; path?: string; modified?: string; error?: string }> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || connectionStatus !== 'connected') {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = crypto.randomUUID();
      const message: WebSocketMessage = {
        type: 'req',
        id: requestId,
        method: 'file.write',
        params: { path, content },
      };

      pendingRequestsRef.current.set(requestId, {
        resolve: (result) => resolve(result as { success: boolean; path?: string; modified?: string }),
        reject,
      });

      wsRef.current.send(JSON.stringify(message));

      setTimeout(() => {
        if (pendingRequestsRef.current.has(requestId)) {
          pendingRequestsRef.current.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }, [connectionStatus]);

  return {
    messages,
    connectionStatus,
    reconnectAttempt,
    wasReconnected,
    clearReconnected,
    sendMessage,
    writeFile,
    reconnect,
    disconnect,
    isStreaming,
  };
}