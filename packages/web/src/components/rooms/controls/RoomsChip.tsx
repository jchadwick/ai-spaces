import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type RoomsChipTone = "neutral" | "promoted" | "restricted" | "boundary";

const chipToneClasses: Record<RoomsChipTone, string> = {
  neutral: "border-transparent bg-rooms-paper-3 text-rooms-ink-soft",
  promoted: "border-transparent bg-rooms-success-soft text-rooms-success",
  restricted: "border-rooms-line bg-transparent text-rooms-muted-2",
  boundary: "border-transparent bg-rooms-boundary-soft text-rooms-boundary",
};

export function RoomsChip({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: RoomsChipTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full border px-2 py-[3px] text-[11px] font-semibold leading-[1.2]",
        chipToneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
