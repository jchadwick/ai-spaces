import type { ConnectionStatus } from "../../contexts/ConnectionStatusContext";

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  reconnectAttempt?: number;
  onRetry?: () => void;
}

const dotClassNames: Record<ConnectionStatus, string> = {
  connecting: "bg-t-ink-dim",
  connected: "bg-t-agent",
  disconnected: "bg-t-accent",
  reconnecting: "bg-t-ink-dim",
  error: "bg-t-accent",
};

export default function ConnectionStatusIndicator({
  status,
  reconnectAttempt = 0,
  onRetry,
}: ConnectionStatusIndicatorProps) {
  const labels: Record<ConnectionStatus, string> = {
    connecting: "connecting",
    connected: "live",
    disconnected: "offline",
    reconnecting: reconnectAttempt > 0 ? `retry ${reconnectAttempt}` : "reconnecting",
    error: "error",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full ${dotClassNames[status]}`} />
      <span className="font-mono text-[10px] uppercase tracking-[1px] text-t-ink-dim">
        {labels[status]}
      </span>
      {status === "error" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 bg-transparent text-[10px] font-medium text-t-accent"
        >
          Retry
        </button>
      )}
    </div>
  );
}
