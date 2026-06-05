import type { ChatMessage } from "@ai-spaces/shared";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentGlyph from "../AgentGlyph";
import { markdownComponents } from "./markdownComponents";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[90%] self-end rounded-[14px] rounded-br-[2px] bg-t-ink px-[14px] py-2.5 font-sans text-[13.5px] leading-normal text-t-bg">
        <p className="m-0">{message.content}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 self-start rounded-[14px] rounded-tl-[2px] border border-t-agent/30 bg-t-agent-soft px-[14px] py-3">
      <div className="mb-0.5 flex items-center gap-1.5">
        <AgentGlyph size={12} color="var(--t-agent)" />
        <span className="text-xs font-bold uppercase text-t-agent">agent</span>
        {message.timestamp && (
          <span className="ml-auto font-mono text-[10px] text-t-ink-faint">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {message.content}
      </ReactMarkdown>
    </div>
  );
}
