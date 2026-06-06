import { useEffect, useRef, useState } from "react";
import { Grid2X2, LogOut, Plus, Shield, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { RoomsAvatar } from "@/components/rooms/controls/RoomsAvatar";
import type { RoomSummary, SpaceSummary } from "@/components/rooms/types";
import { roleIsOwner, spaceColor, uniqueSpaceAbbreviations } from "@/components/rooms/roomsUtils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export function RoomsRail({
  spaces,
  rooms,
  activeSpaceId,
  view,
  onHome,
  onSpace,
  onNewRoom,
}: {
  spaces: SpaceSummary[];
  rooms: RoomSummary[];
  activeSpaceId: string | null;
  view: "home" | "space" | "room";
  onHome: () => void;
  onSpace: (spaceId: string) => void;
  onNewRoom: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasOwnerSpace = spaces.some((space) => roleIsOwner(space.userRole));
  const visibleSpaces = spaces.filter(
    (space) => roleIsOwner(space.userRole) || rooms.some((room) => room.spaceId === space.id),
  );
  const spaceAbbreviations = uniqueSpaceAbbreviations(visibleSpaces);
  const userLabel = user?.displayName || user?.email || "User";

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [userMenuOpen]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate("/login");
  };

  return (
    <div className="relative flex w-18 shrink-0 flex-col items-center gap-2.5 border-r border-rooms-line bg-rooms-paper-3 py-4">
      <button
        type="button"
        title="Rooms home"
        onClick={onHome}
        className={cn(
          "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[13px] border-0 bg-rooms-ink text-rooms-paper",
          view === "home" &&
            !activeSpaceId &&
            "shadow-[0_0_0_3px_var(--rooms-paper-3),0_0_0_4.5px_var(--rooms-ink)]",
        )}
      >
        <Grid2X2 size={21} />
      </button>
      <div className="my-1 h-px w-6.5 bg-rooms-line-strong" />
      <div className="flex flex-col items-center gap-2 overflow-visible">
        {visibleSpaces.map((space) => {
          const active = activeSpaceId === space.id && (view === "space" || view === "home");
          const color = spaceColor(spaces, space.id);
          const abbreviation = spaceAbbreviations.get(space.id) ?? "?";

          return (
            <button
              key={space.id}
              type="button"
              title={space.config.name}
              onClick={() => onSpace(space.id)}
              className={cn(
                "relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[13px] border-[1.5px] font-bold leading-none tracking-normal",
                abbreviation.length > 3
                  ? "text-[13px]"
                  : abbreviation.length > 2
                    ? "text-[14.5px]"
                    : "text-[17px]",
              )}
              style={{
                borderColor: active ? color : "var(--rooms-line-strong)",
                backgroundColor: active ? color : "var(--rooms-paper)",
                color: active ? "var(--rooms-paper)" : color,
              }}
            >
              {abbreviation}
              {active && <span className="absolute -left-2.5 top-3 h-5 w-1 rounded bg-rooms-ink" />}
            </button>
          );
        })}
        {hasOwnerSpace && (
          <button
            type="button"
            onClick={onNewRoom}
            title="New room"
            className="flex size-11 cursor-pointer items-center justify-center rounded-[13px] border-[1.5px] border-dashed border-rooms-line-strong bg-transparent text-rooms-muted"
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      <div className="flex-1" />
      {user?.serverRole === "admin" && (
        <button
          type="button"
          onClick={() => navigate("/admin")}
          title="Admin"
          className="flex size-11 cursor-pointer items-center justify-center rounded-[13px] border-[1.5px] border-rooms-line-strong bg-rooms-paper text-rooms-muted"
        >
          <Shield size={19} />
        </button>
      )}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          title={userLabel}
          aria-label="Profile menu"
          aria-expanded={userMenuOpen}
          className={cn(
            "flex size-11 cursor-pointer items-center justify-center rounded-[13px] border-[1.5px] bg-rooms-paper p-0 text-rooms-ink-soft",
            userMenuOpen ? "border-rooms-ink" : "border-rooms-line-strong",
          )}
        >
          <RoomsAvatar label={userLabel} size={32} index={1} />
        </button>
        {userMenuOpen && (
          <div className="rooms-fade absolute bottom-0 left-13.5 z-[100] w-54 rounded-xl border-[1.5px] border-rooms-line-strong bg-rooms-paper p-1.5 shadow-rooms-popover">
            <div className="mb-1 border-b border-rooms-line px-2.5 pb-2.5 pt-2">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-bold text-rooms-ink">
                {userLabel}
              </div>
              <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-rooms-muted">
                {user?.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                navigate("/profile");
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] font-medium text-rooms-ink-soft"
            >
              <User size={16} className="text-rooms-muted" />
              Profile
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] font-medium text-rooms-ink-soft"
            >
              <LogOut size={16} className="text-rooms-muted" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
