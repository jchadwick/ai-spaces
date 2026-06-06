import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type RoomsButtonVariant =
  | "primary"
  | "outline"
  | "ghost"
  | "boundary"
  | "danger";
type RoomsButtonSize = "sm" | "md";

const buttonVariantClasses: Record<RoomsButtonVariant, string> = {
  primary: "border-rooms-ink bg-rooms-ink text-rooms-paper",
  outline: "border-rooms-line-strong bg-rooms-paper text-rooms-ink",
  ghost: "border-transparent bg-transparent text-rooms-ink-soft",
  boundary: "border-rooms-boundary bg-rooms-boundary text-rooms-paper",
  danger: "border-rooms-error-line bg-rooms-error-soft text-rooms-error",
};

const buttonSizeClasses: Record<RoomsButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-[15px]",
};

export interface RoomsButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  children?: ReactNode;
  icon?: ReactNode;
  variant?: RoomsButtonVariant;
  size?: RoomsButtonSize;
  ariaLabel?: string;
}

export function RoomsButton({
  children,
  icon,
  variant = "outline",
  size = "md",
  disabled,
  className,
  ariaLabel,
  ...props
}: RoomsButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border-[1.5px] font-medium leading-[1.1] disabled:cursor-default disabled:opacity-45 enabled:cursor-pointer",
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export interface RoomsIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function RoomsIconButton({
  children,
  active,
  className,
  ...props
}: RoomsIconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-[38px] items-center justify-center rounded-[9px] border-[1.5px] p-0 enabled:cursor-pointer",
        active
          ? "border-rooms-ink bg-rooms-ink text-rooms-paper"
          : "border-transparent bg-transparent text-rooms-ink-soft",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
