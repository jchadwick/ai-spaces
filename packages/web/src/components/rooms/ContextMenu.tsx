import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="rooms-fade fixed z-[90] w-54 rounded-xl border-[1.5px] border-rooms-line-strong bg-rooms-paper p-1.5 shadow-rooms-popover"
      style={{
        left: Math.min(x, window.innerWidth - 232),
        top: Math.min(y, window.innerHeight - (items.length * 38 + 16)),
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            onClose();
            item.onClick();
          }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] font-medium text-rooms-ink-soft",
            item.danger && "text-rooms-error",
          )}
        >
          <span className={cn("text-rooms-muted", item.danger && "text-rooms-error")}>
            {item.icon}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
