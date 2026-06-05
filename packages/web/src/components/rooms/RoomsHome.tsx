import type { CSSProperties } from "react";
import { ArrowRight, Folder, MessageSquare, Plus } from "lucide-react";

import { RoomsAvatarStack } from "@/components/rooms/controls/RoomsAvatar";
import { RoomsButton } from "@/components/rooms/controls/RoomsButton";
import { RoomsChip } from "@/components/rooms/controls/RoomsChip";
import type { RoomSummary, SpaceSummary } from "@/components/rooms/types";
import { roleIsOwner, spaceColor } from "@/components/rooms/roomsUtils";

export function RoomsHome({
  spaces,
  rooms,
  activeSpaceId,
  onOpenRoom,
  onNewRoom,
  onManageSpace,
}: {
  spaces: SpaceSummary[];
  rooms: RoomSummary[];
  activeSpaceId: string | null;
  onOpenRoom: (room: RoomSummary) => void;
  onNewRoom: () => void;
  onManageSpace: (spaceId: string) => void;
}) {
  const list = activeSpaceId ? rooms.filter((room) => room.spaceId === activeSpaceId) : rooms;
  const activeSpace = activeSpaceId ? spaces.find((space) => space.id === activeSpaceId) : null;
  const canCreate = spaces.some((space) => roleIsOwner(space.userRole));

  return (
    <div className="rooms-rise rooms-scrollbar h-full overflow-auto">
      <div className="mx-auto max-w-[1080px] px-12 pb-16 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="rooms-title m-0 text-[44px] leading-[1.05]">Rooms</h1>
            <p className="mt-2.5 mb-0 text-[15px] text-rooms-muted">
              {list.length} room{list.length === 1 ? "" : "s"} you can work in. Pick one to jump in.
            </p>
          </div>
          {canCreate && (
            <RoomsButton variant="primary" icon={<Plus size={18} />} onClick={onNewRoom}>
              New room
            </RoomsButton>
          )}
        </div>
        {activeSpace && (
          <div className="mt-[26px] flex flex-wrap items-center gap-2.5">
            <RoomsChip tone="neutral">
              <span
                className="size-2 rounded-full"
                style={
                  {
                    backgroundColor: spaceColor(spaces, activeSpace.id),
                  } satisfies CSSProperties
                }
              />
              {activeSpace.config.name}
            </RoomsChip>
            {roleIsOwner(activeSpace.userRole) && (
              <RoomsButton
                variant="ghost"
                size="sm"
                icon={<Folder size={16} />}
                onClick={() => onManageSpace(activeSpace.id)}
              >
                Browse raw files & manage this space
              </RoomsButton>
            )}
          </div>
        )}
        <div className="mt-[30px] grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px]">
          {list.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => onOpenRoom(room)}
              className="flex min-h-[168px] cursor-pointer flex-col rounded-2xl border-[1.5px] border-rooms-line bg-rooms-paper px-5 pb-4 pt-5 text-left shadow-rooms-card"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="rooms-title m-0 text-2xl leading-[1.16]">{room.name}</h3>
                <ArrowRight size={20} className="text-rooms-muted" />
              </div>
              <p className="mt-[9px] mb-0 line-clamp-2 overflow-hidden text-sm leading-normal text-rooms-ink-soft">
                {room.summary}
              </p>
              <div className="flex-1" />
              <div className="mt-4 flex items-center justify-between gap-2.5">
                <RoomsAvatarStack members={room.members} />
              </div>
            </button>
          ))}
        </div>
        {list.length === 0 && (
          <div className="mt-[30px] rounded-2xl border-[1.5px] border-rooms-line bg-rooms-paper px-6 py-[42px] text-center text-rooms-muted">
            <MessageSquare size={28} className="mx-auto mb-3" />
            <div className="text-sm">No rooms yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}
