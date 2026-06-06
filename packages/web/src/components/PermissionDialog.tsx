import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";

export interface PermissionDialogProps {
  request: RequestPermissionRequest;
  onRespond: (response: RequestPermissionResponse) => void;
}

export function PermissionDialog({ request, onRespond }: PermissionDialogProps) {
  const { toolCall, options } = request;
  const title = toolCall.title ?? "Agent Permission Request";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-t-bg-raised border border-t-hair rounded-xl shadow-lg max-w-sm w-full mx-4 p-6">
        <h2 className="font-semibold text-t-ink text-base mb-2">{title}</h2>
        {toolCall.content && toolCall.content.length > 0 && (
          <div className="text-sm text-t-ink-mid mb-4">
            {toolCall.content.map((item) => {
              const textItem = item as unknown as { type: string; text?: string };
              if (textItem.type === "text" && textItem.text) {
                return <p key={textItem.text}>{textItem.text}</p>;
              }
              return null;
            })}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <button
              key={option.optionId}
              onClick={() =>
                onRespond({ outcome: { outcome: "selected", optionId: option.optionId } })
              }
              className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                option.kind.startsWith("allow")
                  ? "bg-t-agent-soft text-t-agent-ink hover:bg-t-agent border border-t-hair"
                  : "bg-t-bg-well text-t-ink-mid hover:bg-t-hair border border-t-hair"
              }`}
            >
              {option.name}
            </button>
          ))}
          <button
            onClick={() => onRespond({ outcome: { outcome: "cancelled" } })}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-t-ink-dim hover:text-t-ink-mid transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
