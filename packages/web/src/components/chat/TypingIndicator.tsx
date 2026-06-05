import AgentGlyph from "../AgentGlyph";

export default function TypingIndicator() {
  return (
    <div className="flex w-full flex-col gap-2 self-start rounded-[14px] rounded-tl-[2px] border border-t-agent/30 bg-t-agent-soft px-[14px] py-3">
      <div className="mb-0.5 flex items-center gap-1.5">
        <AgentGlyph size={12} color="var(--t-agent)" />
        <span className="text-xs font-bold uppercase text-t-agent">agent</span>
      </div>
      <div className="flex gap-1">
        <span className="inline-block size-[7px] animate-bounce rounded-full bg-t-agent opacity-60" />
        <span className="inline-block size-[7px] animate-bounce rounded-full bg-t-agent opacity-60 [animation-delay:150ms]" />
        <span className="inline-block size-[7px] animate-bounce rounded-full bg-t-agent opacity-60 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
