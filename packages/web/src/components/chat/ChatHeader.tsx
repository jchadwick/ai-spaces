import { X } from "lucide-react";
import type { ConnectionStatus } from "../../contexts/ConnectionStatusContext";
import AgentGlyph from "../AgentGlyph";
import ConnectionStatusIndicator from "./ConnectionStatusIndicator";

interface ChatHeaderProps {
  status: ConnectionStatus;
  reconnectAttempt?: number;
  onRetry?: () => void;
  onClose?: () => void;
}

export default function ChatHeader({
  status,
  reconnectAttempt,
  onRetry,
  onClose,
}: ChatHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-t-hair px-[18px] py-[14px]">
      <div className="flex items-center gap-2">
        <AgentGlyph size={14} color="var(--t-agent)" />
        <span className="text-[13px] font-bold text-t-agent">Chat</span>
      </div>
      <div className="flex items-center gap-3">
        <div data-testid="chat-ws-status" data-status={status}>
          <ConnectionStatusIndicator
            status={status}
            reconnectAttempt={reconnectAttempt}
            onRetry={onRetry}
          />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="grid size-[30px] place-items-center rounded-lg border border-t-hair bg-t-bg text-t-ink-dim"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
