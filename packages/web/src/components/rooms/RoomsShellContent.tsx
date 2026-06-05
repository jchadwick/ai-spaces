import type { FileMetadataEntry, SpaceMetadata } from "@ai-spaces/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  fetchSpaceMembers,
  fetchSpaceMetadata,
  fetchSpaceTopics,
  patchFileMetadata,
  type SpaceMember,
  type SpaceTopic,
} from "@/api/spaceFiles";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { RoomDetail } from "@/components/rooms/RoomDetail";
import { RoomsHome } from "@/components/rooms/RoomsHome";
import { RoomsRail } from "@/components/rooms/RoomsRail";
import { SpaceExplorer } from "@/components/rooms/SpaceExplorer";
import { makeRooms, roleIsOwner, roomUrl, stripTopicPath } from "@/components/rooms/roomsUtils";
import type { RoomSummary, SpaceSummary } from "@/components/rooms/types";
import { useToast } from "@/components/ui/use-toast";
import { useAPI } from "@/hooks/useAPI";

export function RoomsShellContent() {
  const apiFetch = useAPI();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [topicsBySpace, setTopicsBySpace] = useState<Map<string, SpaceTopic[]>>(new Map());
  const [metadataBySpace, setMetadataBySpace] = useState<Map<string, SpaceMetadata>>(new Map());
  const [membersBySpace, setMembersBySpace] = useState<Map<string, SpaceMember[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | null>(null);
  const routeSpaceId = params.spaceId ?? null;
  const routeRoomId = params.roomId ?? null;
  const routePath = params["*"] ?? null;
  const isRoomRoute =
    location.pathname.startsWith("/room/") || location.pathname.includes("/rooms/");
  const view: "home" | "space" | "room" = isRoomRoute
    ? "room"
    : location.pathname.startsWith("/space/") ||
        (location.pathname.startsWith("/spaces/") && routeSpaceId)
      ? "space"
      : "home";
  const querySpace = searchParams.get("space");
  const activeSpaceId = view === "space" || view === "room" ? routeSpaceId : querySpace;
  const rooms = useMemo(
    () => makeRooms(spaces, topicsBySpace, metadataBySpace, membersBySpace),
    [spaces, topicsBySpace, metadataBySpace, membersBySpace],
  );
  const activeRoom =
    view === "room" && routeSpaceId && (routeRoomId || routePath)
      ? rooms.find(
          (room) =>
            room.spaceId === routeSpaceId &&
            (room.id === routeRoomId ||
              (!routeRoomId && stripTopicPath(room.topicPath) === routePath)),
        )
      : null;
  const activeSpace = activeSpaceId ? spaces.find((space) => space.id === activeSpaceId) : null;

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/spaces");
      if (!response.ok) throw new Error("Failed to load spaces");
      const data = (await response.json()) as { spaces?: SpaceSummary[] };
      const nextSpaces = data.spaces ?? [];
      const topicPairs = await Promise.all(
        nextSpaces.map(async (space) => [space.id, await fetchSpaceTopics(space.id)] as const),
      );
      const metadataPairs = await Promise.all(
        nextSpaces.map(async (space) => [space.id, await fetchSpaceMetadata(space.id)] as const),
      );
      const memberPairs = await Promise.all(
        nextSpaces.map(
          async (space) => [space.id, await fetchSpaceMembers(space.id).catch(() => [])] as const,
        ),
      );
      setSpaces(nextSpaces);
      setTopicsBySpace(new Map(topicPairs));
      setMetadataBySpace(new Map(metadataPairs));
      setMembersBySpace(new Map(memberPairs));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load rooms", "error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showToast]);

  const updateSpaceConfig = useCallback(
    async (spaceId: string, patch: Partial<SpaceSummary["config"]>) => {
      const response = await apiFetch(`/api/spaces/${spaceId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || `Failed to save space (${response.status})`,
        );
      }
      const data = (await response.json()) as {
        space?: { config?: SpaceSummary["config"] };
      };
      const nextConfig = data.space?.config;
      if (!nextConfig) return;
      setSpaces((current) =>
        current.map((space) => (space.id === spaceId ? { ...space, config: nextConfig } : space)),
      );
      showToast("Space updated", "success");
    },
    [apiFetch, showToast],
  );

  const updateRoomMetadata = useCallback(
    async (room: RoomSummary, patch: Partial<FileMetadataEntry>) => {
      const metadataPath = stripTopicPath(room.topicPath);
      const result = await patchFileMetadata(room.spaceId, metadataPath, patch);
      if (!result.success) throw new Error(result.error || "Failed to save room metadata");
      setMetadataBySpace((current) => {
        const next = new Map(current);
        const spaceMetadata = next.get(room.spaceId) ?? { files: {} };
        next.set(room.spaceId, {
          files: {
            ...spaceMetadata.files,
            [metadataPath]: {
              ...(spaceMetadata.files[metadataPath] ?? {}),
              ...patch,
            },
          },
        });
        return next;
      });
      showToast("Room updated", "success");
    },
    [showToast],
  );

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!loading && view === "space" && activeSpace && !roleIsOwner(activeSpace.userRole)) {
      navigate(`/spaces?space=${activeSpace.id}`, { replace: true });
    }
  }, [activeSpace, loading, navigate, view]);

  function goHome() {
    navigate("/spaces");
  }

  function filterOrManageSpace(spaceId: string) {
    const space = spaces.find((candidate) => candidate.id === spaceId);
    if (space && roleIsOwner(space.userRole)) navigate(`/spaces/${spaceId}`);
    else {
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        if (next.get("space") === spaceId) next.delete("space");
        else next.set("space", spaceId);
        return next;
      });
      if (location.pathname !== "/" && location.pathname !== "/spaces")
        navigate(`/spaces?space=${spaceId}`);
    }
  }

  const promotedSet = new Set(
    (activeSpaceId ? (topicsBySpace.get(activeSpaceId) ?? []) : []).map((topic) =>
      stripTopicPath(topic.topicPath),
    ),
  );
  const promotedIdsByPath = new Map(
    (activeSpaceId ? (topicsBySpace.get(activeSpaceId) ?? []) : []).map(
      (topic) => [stripTopicPath(topic.topicPath), topic.id] as const,
    ),
  );
  const roomFilePath = view === "room" && routeRoomId ? routePath : null;

  return (
    <div className="rooms-shell">
      <RoomsRail
        spaces={spaces}
        rooms={rooms}
        activeSpaceId={view === "home" ? querySpace : activeSpaceId}
        view={view}
        onHome={goHome}
        onSpace={filterOrManageSpace}
        onNewRoom={() => setModal("create")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="grid h-full place-items-center text-rooms-muted">Loading rooms...</div>
          )}
          {!loading && view === "home" && (
            <RoomsHome
              spaces={spaces}
              rooms={rooms}
              activeSpaceId={querySpace}
              onOpenRoom={(room) => navigate(roomUrl(room))}
              onNewRoom={() => setModal("create")}
              onManageSpace={(spaceId) => navigate(`/space/${spaceId}`)}
            />
          )}
          {!loading && view === "room" && activeRoom && activeSpace && (
            <RoomDetail
              room={activeRoom}
              role={activeSpace.userRole}
              initialFilePath={roomFilePath}
              onSelectFile={(filePath) =>
                navigate(
                  `/spaces/${activeRoom.spaceId}/rooms/${activeRoom.id}/${filePath
                    .slice(stripTopicPath(activeRoom.topicPath).length)
                    .replace(/^\/+/, "")}`,
                )
              }
              onUpdateRoomMetadata={updateRoomMetadata}
            />
          )}
          {!loading && view === "room" && !activeRoom && (
            <div className="grid h-full place-items-center text-rooms-muted">Room not found.</div>
          )}
          {!loading && view === "space" && activeSpace && roleIsOwner(activeSpace.userRole) && (
            <SpaceExplorer
              space={activeSpace}
              spaces={spaces}
              promotedTopicPaths={promotedSet}
              promotedTopicIdsByPath={promotedIdsByPath}
              initialPath={routePath}
              onBack={() => navigate("/spaces")}
              onOpenRoom={(spaceId, topicPath) => {
                const roomId = topicsBySpace
                  .get(spaceId)
                  ?.find((topic) => topic.topicPath === topicPath)?.id;
                if (roomId) navigate(`/spaces/${spaceId}/rooms/${roomId}`);
              }}
              onRefreshRooms={refreshAll}
              onUpdateSpaceConfig={updateSpaceConfig}
            />
          )}
        </div>
      </div>
      {modal === "create" && (
        <CreateRoomModal
          spaces={spaces}
          onClose={() => setModal(null)}
          onCreated={(spaceId, roomId) => {
            setModal(null);
            void refreshAll();
            navigate(`/spaces/${spaceId}/rooms/${roomId}`);
          }}
        />
      )}
    </div>
  );
}
