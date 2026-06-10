import { cn } from "@/lib/utils";

export function RoomsField({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  textarea,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  textarea?: boolean;
  className?: string;
}) {
  const controlClassName = cn(
    "min-w-0 flex-1 resize-none border-0 bg-transparent text-[15px] leading-normal text-rooms-ink outline-none",
    textarea ? "p-0" : "py-3",
  );

  return (
    <label className={cn("block", className)}>
      <div className="mb-1.5 text-[13px] font-semibold text-rooms-ink-soft">{label}</div>
      <div
        className={cn(
          "flex gap-1.5 rounded-[10px] border-[1.5px] border-rooms-line-strong bg-rooms-paper",
          textarea ? "items-start px-3.5 py-3" : "min-h-11 items-center px-3.5",
        )}
      >
        {prefix && <span className="whitespace-nowrap text-sm text-rooms-muted">{prefix}</span>}
        {textarea ? (
          <textarea
            rows={3}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={controlClassName}
          />
        ) : (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={controlClassName}
          />
        )}
      </div>
    </label>
  );
}
