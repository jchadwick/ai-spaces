import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSpaceWebSocket } from '../hooks/useSpaceWebSocket';
import type { ChatMessage } from '@ai-spaces/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface AIChatPaneProps {
  spaceId: string;
  role?: 'viewer' | 'editor' | 'admin';
}

function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  const colors = {
    connecting: 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]',
    connected: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    disconnected: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    error: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  };

  const labels = {
    connecting: 'Connecting',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`}></span>
      <span className="font-['Inter'] text-[11px] uppercase tracking-widest font-semibold text-slate-400">
        {labels[status]}
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[90%] bg-surface-container-lowest p-3 rounded-2xl rounded-tr-none border border-outline-variant/20 shadow-sm">
        <p className="text-sm text-slate-800">{message.content}</p>
      </div>
    );
  }

  return (
    <div className="self-start max-w-[90%] bg-white dark:bg-slate-900 p-4 rounded-2xl rounded-tl-none shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2 text-tertiary mb-1">
        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
          auto_awesome
        </span>
        <span className="text-[10px] uppercase font-bold tracking-tighter">AI Agent</span>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
        {message.content}
      </p>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="self-start max-w-[90%] bg-white dark:bg-slate-900 p-4 rounded-2xl rounded-tl-none shadow-sm">
      <div className="flex items-center gap-2 text-tertiary mb-1">
        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
          auto_awesome
        </span>
        <span className="text-[10px] uppercase font-bold tracking-tighter">AI Agent</span>
      </div>
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
      </div>
    </div>
  );
}

export default function AIChatPane({ spaceId, role = 'viewer' }: AIChatPaneProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') || '';
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);

  const { messages, connectionStatus, sendMessage, isStreaming } = useSpaceWebSocket({
    spaceId,
    token,
  });

  const isViewer = role === 'viewer';
  const showTypingIndicator = isStreaming && messages.every(m => m.role !== 'assistant' || m.content.length === 0);

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isViewer || connectionStatus !== 'connected') return;

    sendMessage(inputValue.trim());
    setInputValue('');
  };

  return (
    <aside className="w-80 bg-surface-container-low border-l border-slate-200 dark:border-slate-800 flex flex-col">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">forum</span>
            <span className="font-headline font-bold text-slate-900 dark:text-white">AI Assistant</span>
          </div>
          <ConnectionStatusIndicator status={connectionStatus} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
        {messages.length === 0 && !isStreaming && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-400 text-center">
              {isViewer
                ? 'Connect to start chatting with the AI assistant.'
                : 'Start a conversation with the AI assistant.'}
            </p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {showTypingIndicator && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white/50 backdrop-blur-md border-t border-slate-200 dark:border-slate-800">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isViewer || connectionStatus !== 'connected'}
              className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none h-24 custom-scrollbar disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isViewer ? 'Read-only mode - cannot send messages' : 'Ask AI anything...'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={isViewer || !inputValue.trim() || connectionStatus !== 'connected'}
              className="absolute bottom-3 right-3 p-2 bg-primary text-white rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}