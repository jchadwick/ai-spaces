import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConnectionStatus, type ConnectionStatus } from "../contexts/ConnectionStatusContext";
import type { ChatMessage, SpaceRole } from "@ai-spaces/shared";
import { hasPermission } from "@ai-spaces/shared";
import ShareSpaceDialog from "./ShareSpaceDialog";

interface AIChatPaneProps {
  role?: SpaceRole;
  spaceId?: string;
}

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  reconnectAttempt?: number;
  onRetry?: () => void;
}

const AgentGlyph = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>
    <circle cx="8" cy="3" r="1.4" fill={color} opacity="0.9" />
    <circle cx="3" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="13" cy="9" r="1" fill={color} opacity="0.7" />
    <circle cx="8" cy="13" r="0.8" fill={color} opacity="0.5" />
    <path d="M8 3 L3 9 L8 13 L13 9 Z" stroke={color} strokeWidth="0.5" opacity="0.3" />
  </svg>
);

function ConnectionStatusIndicator({
  status,
  reconnectAttempt = 0,
  onRetry,
}: ConnectionStatusIndicatorProps) {
  const dotColors: Record<ConnectionStatus, string> = {
    connecting: 'var(--t-inkDim)',
    connected: 'var(--t-agent)',
    disconnected: 'var(--t-accent)',
    reconnecting: 'var(--t-inkDim)',
    error: 'var(--t-accent)',
  };

  const labels: Record<ConnectionStatus, string> = {
    connecting: "connecting",
    connected: "live",
    disconnected: "offline",
    reconnecting:
      reconnectAttempt > 0
        ? `retry ${reconnectAttempt}`
        : "reconnecting",
    error: "error",
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColors[status], display: 'inline-block' }} />
      <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t-inkDim)' }}>
        {labels[status]}
      </span>
      {status === "error" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{ marginLeft: 4, fontSize: 10, color: 'var(--t-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '90%', background: 'var(--t-ink)', color: 'var(--t-bg)', padding: '10px 14px', borderRadius: '14px 14px 2px 14px', fontSize: 13.5, lineHeight: 1.5, fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>
        <p style={{ margin: 0 }}>{message.content}</p>
      </div>
    );
  }

  return (
    <div style={{ alignSelf: 'flex-start', width: '100%', background: 'var(--t-agentSoft)', border: '1px solid var(--t-agent)', borderColor: 'color-mix(in srgb, var(--t-agent) 30%, transparent)', padding: '12px 14px', borderRadius: '2px 14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <AgentGlyph size={12} color="var(--t-agent)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-agent)', letterSpacing: 0, textTransform: 'uppercase' }}>agent</span>
        {message.timestamp && (
          <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--t-inkFaint)' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p style={{ fontSize: 13.5, color: 'var(--t-ink)', lineHeight: 1.55, margin: '4px 0', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t-ink)', margin: '12px 0 4px' }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t-ink)', margin: '8px 0 4px' }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-ink)', margin: '8px 0 2px' }}>{children}</h3>
          ),
          ul: ({ children }) => (
            <ul style={{ paddingLeft: 16, margin: '4px 0', fontSize: 13.5, color: 'var(--t-ink)' }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ paddingLeft: 16, margin: '4px 0', fontSize: 13.5, color: 'var(--t-ink)' }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ lineHeight: 1.55 }}>{children}</li>,
          code: ({ children, className }) => {
            const isBlock = className?.startsWith("language-");
            return isBlock ? (
              <code
                className={className}
                style={{ display: 'block', background: 'var(--t-bgWell)', color: 'var(--t-ink)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", overflowX: 'auto' }}
              >
                {children}
              </code>
            ) : (
              <code style={{ background: 'var(--t-bgWell)', color: 'var(--t-ink)', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre style={{ margin: '8px 0', overflowX: 'auto' }}>{children}</pre>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: 'var(--t-ink)' }}>{children}</strong>
          ),
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: '2px solid var(--t-hair)', paddingLeft: 12, margin: '4px 0', color: 'var(--t-inkDim)', fontStyle: 'italic', fontSize: 13.5 }}>
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              style={{ color: 'var(--t-accent)', textDecoration: 'underline' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr style={{ border: 'none', borderTop: '1px solid var(--t-hair)', margin: '8px 0' }} />
          ),
          table: ({ children }) => (
            <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0', fontSize: 13, fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>{children}</table>
          ),
          th: ({ children }) => (
            <th style={{ textAlign: 'left', padding: '4px 10px', fontWeight: 600, fontSize: 12, color: 'var(--t-inkDim)', borderBottom: '1px solid var(--t-hair)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{ padding: '4px 10px', fontSize: 13, color: 'var(--t-ink)', borderBottom: '1px solid var(--t-hair)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>{children}</td>
          ),
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ alignSelf: 'flex-start', width: '100%', background: 'var(--t-agentSoft)', border: '1px solid var(--t-agent)', borderColor: 'color-mix(in srgb, var(--t-agent) 30%, transparent)', padding: '12px 14px', borderRadius: '2px 14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <AgentGlyph size={12} color="var(--t-agent)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-agent)', letterSpacing: 0, textTransform: 'uppercase' }}>agent</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <span
          style={{ width: 7, height: 7, background: 'var(--t-agent)', opacity: 0.6, borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.2s infinite' }}
          className="animate-bounce"
        />
        <span
          style={{ width: 7, height: 7, background: 'var(--t-agent)', opacity: 0.6, borderRadius: '50%', display: 'inline-block', animationDelay: '150ms' }}
          className="animate-bounce"
        />
        <span
          style={{ width: 7, height: 7, background: 'var(--t-agent)', opacity: 0.6, borderRadius: '50%', display: 'inline-block', animationDelay: '300ms' }}
          className="animate-bounce"
        />
      </div>
    </div>
  );
}

export default function AIChatPane({
  role = "viewer",
  spaceId,
}: AIChatPaneProps) {
  const [inputValue, setInputValue] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);

  const { messages, sendMessage, isStreaming, activeTopicPath, status: connectionStatus, reconnectAttempt, reconnect } = useConnectionStatus();
  const topicSegments = activeTopicPath.split('/').filter(Boolean);

  const isOwner = hasPermission(role, 'space:manage');
  const isDisconnected = connectionStatus !== "connected" && connectionStatus !== "connecting";
  const hasPendingAssistantPlaceholder = messages.some(
    (m) => m.role === "assistant" && m.content.length === 0,
  );
  const visibleMessages = messages.filter(
    (m) => !(m.role === "assistant" && m.content.length === 0),
  );
  const showTypingIndicator = isStreaming && hasPendingAssistantPlaceholder;

  useEffect(() => {
    if (
      messages.length > prevMessagesLengthRef.current &&
      messagesEndRef.current
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming || isDisconnected) return;

    sendMessage(inputValue.trim());
    setInputValue("");
  };

  return (
    <aside className="w-full h-full flex flex-col" style={{ background: 'var(--t-bgRaised)', borderLeft: '1px solid var(--t-hair)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AgentGlyph size={14} color="var(--t-agent)" />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0, color: 'var(--t-agent)', textTransform: 'uppercase' }}>agent</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isOwner && spaceId && (
            <button
              type="button"
              onClick={() => setShareDialogOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--t-bg)', border: '1px solid var(--t-hair)', borderRadius: 6, fontSize: 12, fontWeight: 500, color: 'var(--t-ink)', cursor: 'pointer', fontFamily: "'Inter Tight', sans-serif" }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Share
            </button>
          )}
          <div data-testid="chat-ws-status" data-status={connectionStatus}>
            <ConnectionStatusIndicator
              status={connectionStatus}
              reconnectAttempt={reconnectAttempt}
              onRetry={reconnect}
            />
          </div>
        </div>
      </div>

      <div style={{ padding: '7px 18px', borderBottom: '1px solid var(--t-hair)', fontSize: 11, color: 'var(--t-inkDim)', fontFamily: "'JetBrains Mono', monospace" }}>
        topic: root{topicSegments.map((segment) => ` / ${segment}`).join('')}
      </div>

      {isStreaming && (
        <div style={{ padding: '6px 18px', borderBottom: '1px solid var(--t-hair)', fontSize: 11, color: 'var(--t-agent)', fontFamily: "'JetBrains Mono', monospace" }}>
          agent responding...
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--t-inkFaint)', textAlign: 'center', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>
              Start a conversation with the agent.
            </p>
          </div>
        )}
        {visibleMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {showTypingIndicator && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div style={{ borderTop: '1px solid var(--t-hair)', padding: '12px 14px' }}>
        {/* Quick action chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {['Summarize this doc', 'What changed today?', 'Make a plan'].map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => setInputValue(chip)}
              style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 20, background: 'var(--t-bg)', border: '1px solid var(--t-hair)', color: 'var(--t-inkMid)', cursor: 'pointer', fontFamily: "'Inter Tight', sans-serif" }}
            >
              {chip}
            </button>
          ))}
        </div>
        {/* Input */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-hair)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isStreaming || isDisconnected}
              style={{ background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 13.5, color: 'var(--t-ink)', fontFamily: "'Inter Tight', sans-serif", height: 72, width: '100%', opacity: isStreaming || isDisconnected ? 0.6 : 1 }}
              placeholder={
                isDisconnected
                  ? "Reconnecting..."
                  : isStreaming
                    ? "Agent is responding..."
                    : "Ask AI anything..."
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={!inputValue.trim() || isStreaming || isDisconnected}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--t-accent)', color: 'var(--t-bgRaised)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: !inputValue.trim() || isStreaming || isDisconnected ? 'not-allowed' : 'pointer', opacity: !inputValue.trim() || isStreaming || isDisconnected ? 0.5 : 1, fontFamily: "'Inter Tight', sans-serif" }}
              >
                <AgentGlyph size={11} color="var(--t-bgRaised)" /> {isStreaming ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </div>
        </form>
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--t-inkFaint)', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', letterSpacing: 0.4 }}>
          agent sees only files in this space
        </div>
      </div>

      {isOwner && spaceId && (
        <ShareSpaceDialog
          spaceId={spaceId}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      )}
    </aside>
  );
}
