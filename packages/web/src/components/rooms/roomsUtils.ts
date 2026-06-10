import type { FileNode, SpaceMetadata, SpaceRole } from "@ai-spaces/shared";
import type { DragEvent } from "react";

import type { SpaceMember, SpaceRoom } from "@/api/spaceFiles";
import type { RoomSummary, SpaceSummary } from "@/components/rooms/types";

const SPACE_COLORS = [
  "var(--rooms-space-0)",
  "var(--rooms-space-1)",
  "var(--rooms-space-2)",
  "var(--rooms-space-3)",
];

export function spaceColor(spaces: SpaceSummary[], spaceId: string) {
  const index = Math.max(
    0,
    spaces.findIndex((space) => space.id === spaceId),
  );
  return SPACE_COLORS[index % SPACE_COLORS.length];
}

export function stripRoomPath(roomPath: string) {
  return roomPath.replace(/^\/+/, "");
}

export function pathParts(roomPath: string) {
  return stripRoomPath(roomPath).split("/").filter(Boolean);
}

export function basename(roomPath: string) {
  const parts = pathParts(roomPath);
  return parts[parts.length - 1] || "Root";
}

export function parentPath(filePath: string) {
  return filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/"))
    : "";
}

export function joinPath(parent: string | null | undefined, name: string) {
  const cleanParent = (parent ?? "").replace(/^\/+|\/+$/g, "");
  const cleanName = name.trim().replace(/^\/+/, "");
  return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
}

export function sortFileNodes(nodes: FileNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function replaceNodeChildren(
  nodes: FileNode[],
  targetPath: string,
  children: FileNode[],
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return { ...node, children };
    if (node.children && targetPath.startsWith(`${node.path}/`)) {
      return {
        ...node,
        children: replaceNodeChildren(node.children, targetPath, children),
      };
    }
    return node;
  });
}

export function firstFileNode(nodes: FileNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.type === "file") return node;
    const childFile = node.children ? firstFileNode(node.children) : null;
    if (childFile) return childFile;
  }
  return null;
}

export function movePath(
  path: string | null,
  fromPath: string,
  toPath: string,
) {
  if (!path) return path;
  if (path === fromPath) return toPath;
  if (path.startsWith(`${fromPath}/`))
    return `${toPath}/${path.slice(fromPath.length + 1)}`;
  return path;
}

export function parseMoveData(
  event: DragEvent,
): { path: string; type: "file" | "directory" } | null {
  const raw = event.dataTransfer.getData("ai-spaces/move");
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { path?: unknown; type?: unknown };
    if (typeof data.path !== "string") return null;
    if (data.type !== "file" && data.type !== "directory") return null;
    return { path: data.path, type: data.type };
  } catch {
    return null;
  }
}

export function initials(label: string) {
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function spaceAbbreviationBase(space: SpaceSummary) {
  const label = space.config.name || space.path || space.id;
  return label.replace(/[^a-z0-9]/gi, "").toUpperCase() || "?";
}

export function uniqueSpaceAbbreviations(spaces: SpaceSummary[]) {
  const bases = spaces.map(spaceAbbreviationBase);
  const abbreviations = bases.map((base) => base.slice(0, 1));
  const counts = new Map<string, number>();

  abbreviations.forEach((abbreviation) => {
    counts.set(abbreviation, (counts.get(abbreviation) ?? 0) + 1);
  });

  bases.forEach((base, index) => {
    if ((counts.get(abbreviations[index]) ?? 0) > 1) {
      abbreviations[index] = base.slice(0, Math.min(2, base.length));
    }
  });

  for (let width = 3; width <= 4; width += 1) {
    const duplicateCounts = new Map<string, number>();
    abbreviations.forEach((abbreviation) => {
      duplicateCounts.set(
        abbreviation,
        (duplicateCounts.get(abbreviation) ?? 0) + 1,
      );
    });
    bases.forEach((base, index) => {
      if (
        (duplicateCounts.get(abbreviations[index]) ?? 0) > 1 &&
        base.length >= width
      ) {
        abbreviations[index] = base.slice(0, width);
      }
    });
  }

  const finalCounts = new Map<string, number>();
  abbreviations.forEach((abbreviation) => {
    finalCounts.set(abbreviation, (finalCounts.get(abbreviation) ?? 0) + 1);
  });

  const seen = new Map<string, number>();
  return new Map(
    spaces.map((space, index) => {
      const abbreviation = abbreviations[index];
      if ((finalCounts.get(abbreviation) ?? 0) <= 1)
        return [space.id, abbreviation] as const;

      const seenCount = seen.get(abbreviation) ?? 0;
      seen.set(abbreviation, seenCount + 1);
      const suffix = String(seenCount + 1);
      return [
        space.id,
        `${abbreviation.slice(0, Math.max(1, 4 - suffix.length))}${suffix}`,
      ] as const;
    }),
  );
}

export function roleIsOwner(role?: SpaceRole) {
  return role === "owner";
}

export function roomUrl(room: RoomSummary) {
  return `/spaces/${room.spaceId}/rooms/${room.id}`;
}

export function findNode(
  nodes: FileNode[],
  targetPath: string,
): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export function isRestricted(metadata: SpaceMetadata, nodePath: string) {
  return Object.entries(metadata.files).some(([path, entry]) => {
    const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");
    return (
      (entry as { restricted?: boolean }).restricted &&
      (nodePath === normalized || nodePath.startsWith(`${normalized}/`))
    );
  });
}

export function makeRooms(
  spaces: SpaceSummary[],
  roomsBySpace: Map<string, SpaceRoom[]>,
  metadataBySpace: Map<string, SpaceMetadata>,
  membersBySpace: Map<string, SpaceMember[]>,
): RoomSummary[] {
  return spaces.flatMap((space) => {
    const metadata = metadataBySpace.get(space.id) ?? { files: {} };
    const members = membersBySpace.get(space.id) ?? [];
    return (roomsBySpace.get(space.id) ?? [])
      .filter(
        (room) =>
          room.targetType === "directory" || room.targetType === "file",
      )
      .map((room) => {
        const cleanPath = stripRoomPath(room.roomPath);
        const entry =
          metadata.files[cleanPath] ?? metadata.files[room.roomPath] ?? {};
        return {
          id: room.id,
          spaceId: space.id,
          roomPath: room.roomPath,
          targetType: room.targetType === "file" ? "file" : "directory",
          name: entry.displayName || basename(room.roomPath),
          summary:
            entry.summary ??
            `Focused room for ${basename(room.roomPath)} inside ${space.config.name}.`,
          pathParts: pathParts(room.roomPath),
          members,
          updatedAt: room.updatedAt,
        };
      });
  });
}
