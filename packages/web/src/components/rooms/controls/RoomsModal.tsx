import type { ReactNode } from "react";

import { X } from "lucide-react";

import { RoomsIconButton } from "@/components/rooms/controls/RoomsButton";
import { cn } from "@/lib/utils";

export function RoomsModal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className="rooms-fade fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-[rgba(31,31,29,0.32)] px-6 pb-6 pt-[7vh]"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "rooms-rise w-full max-w-[540px] overflow-hidden rounded-[20px] border-[1.5px] border-rooms-line-strong bg-rooms-paper shadow-rooms-modal",
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-[26px] pt-6">
          <div>
            <h2 className="rooms-title m-0 text-[27px] leading-[1.12]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-[9px] max-w-[420px] text-[13.5px] leading-normal text-rooms-muted">
                {subtitle}
              </p>
            )}
          </div>
          <RoomsIconButton
            title="Close"
            onClick={onClose}
            className="size-[34px]"
          >
            <X size={18} />
          </RoomsIconButton>
        </div>
        <div className="px-[26px] pt-[22px]">{children}</div>
        <div className="mt-1 flex justify-end gap-2.5 px-[26px] py-[22px]">
          {footer}
        </div>
      </div>
    </div>
  );
}
