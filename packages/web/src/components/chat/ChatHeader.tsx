import { Upload, X } from "lucide-react";
import type { ConnectionStatus } from "../../contexts/ConnectionStatusContext";
import AgentGlyph from "../AgentGlyph";
import ConnectionStatusIndicator from "./ConnectionStatusIndicator";

interface ChatHeaderProps {
  isOwner: boolean;
  spaceId?: string;
  status: ConnectionStatus;
  reconnectAttempt?: number;
  onRetry?: () => void;
  onShare: () => void;
  onClose?: () => void;
}

export default function ChatHeader({
  isOwner,
  spaceId,
  status,
  reconnectAttempt,
  onRetry,
  onShare,
  onClose,
}: ChatHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-t-hair px-[18px] py-[14px]">
      <div className="flex items-center gap-2">
        <AgentGlyph size={14} color="var(--t-agent)" />
        <span className="text-[13px] font-bold text-t-agent">Chat</span>
      </div>
      <div className="flex items-center gap-3">
        {isOwner && spaceId && (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1 rounded-md border border-t-hair bg-t-bg px-2.5 py-1 text-xs font-medium text-t-ink"
          >
            <Upload size={12} />
            Share
          </button>
        )}
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
