import type { SpaceRole } from "@ai-spaces/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useConnectionStatus } from "../contexts/ConnectionStatusContext";
import { cn } from "@/lib/utils";
import AgentGlyph from "./AgentGlyph";
import ChatHeader from "./chat/ChatHeader";
import MessageBubble from "./chat/MessageBubble";
import TypingIndicator from "./chat/TypingIndicator";

interface AIChatPaneProps {
  role?: SpaceRole;
  spaceId?: string;
  onClose?: () => void;
}

export default function AIChatPane({ onClose }: AIChatPaneProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);

  const {
    messages,
    sendMessage,
    isStreaming,
    status: connectionStatus,
    reconnectAttempt,
    reconnect,
  } = useConnectionStatus();

  const isDisconnected = connectionStatus !== "connected" && connectionStatus !== "connecting";
  const hasPendingAssistantPlaceholder = messages.some(
    (m) => m.role === "assistant" && m.content.length === 0,
  );
  const visibleMessages = messages.filter(
    (m) => !(m.role === "assistant" && m.content.length === 0),
  );
  const showTypingIndicator = isStreaming && hasPendingAssistantPlaceholder;

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages.length]);

  const submitMessage = () => {
    if (!inputValue.trim() || isStreaming || isDisconnected) return;

    sendMessage(inputValue.trim());
    setInputValue("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitMessage();
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-t-hair bg-t-bg-raised">
      <ChatHeader
        status={connectionStatus}
        reconnectAttempt={reconnectAttempt}
        onRetry={reconnect}
        onClose={onClose}
      />

      {isStreaming && (
        <div className="border-b border-t-hair px-[18px] py-1.5 font-mono text-[11px] text-t-agent">
          agent responding...
        </div>
      )}

      {/* Messages area */}
      <div className="custom-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-center font-sans text-[13px] text-t-ink-faint">
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
      <div className="border-t border-t-hair px-[14px] py-3">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2 rounded-xl border border-t-hair bg-t-bg px-3 py-2.5">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isStreaming || isDisconnected}
              className="h-[72px] w-full resize-none border-0 bg-transparent font-sans text-[13.5px] text-t-ink outline-none disabled:opacity-60"
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
                  submitMessage();
                }
              }}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!inputValue.trim() || isStreaming || isDisconnected}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg bg-t-accent px-2.5 py-[5px] font-sans text-[13px] font-medium text-t-bg-raised",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <AgentGlyph size={11} color="var(--t-bgRaised)" />{" "}
                {isStreaming ? "Thinking..." : "Send"}
              </button>
            </div>
          </div>
        </form>
        <div className="mt-2 text-center font-mono text-[10px] tracking-[0.4px] text-t-ink-faint">
          agent sees only files in this space
        </div>
      </div>

    </aside>
  );
}
