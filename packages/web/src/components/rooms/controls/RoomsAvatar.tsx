import type { CSSProperties } from "react";

import type { SpaceMember } from "@/api/spaceFiles";
import { initials } from "@/components/rooms/roomsUtils";
import { cn } from "@/lib/utils";

const avatarTintClasses = [
  "bg-rooms-avatar-0",
  "bg-rooms-avatar-1",
  "bg-rooms-avatar-2",
  "bg-rooms-avatar-3",
];

export function RoomsAvatar({
  label,
  size = 30,
  index = 0,
  className,
}: {
  label: string;
  size?: number;
  index?: number;
  className?: string;
}) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-rooms-paper text-rooms-ink-soft shadow-rooms-avatar",
        avatarTintClasses[index % avatarTintClasses.length],
        className,
      )}
      style={
        {
          width: size,
          height: size,
          fontSize: size * 0.36,
        } satisfies CSSProperties
      }
    >
      {initials(label)}
    </span>
  );
}

export function RoomsAvatarStack({
  members,
  className,
}: {
  members: SpaceMember[];
  className?: string;
}) {
  const visible = members.slice(0, 4);
  return (
    <span className={cn("inline-flex", className)}>
      {visible.map((member, index) => (
        <span key={member.userId} className={index ? "-ml-2" : undefined}>
          <RoomsAvatar label={member.displayName || member.email} size={26} index={index} />
        </span>
      ))}
    </span>
  );
}
