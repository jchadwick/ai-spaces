import type { FileNode, SpaceMetadata } from "@ai-spaces/shared";
import { ChevronRight, FileText, Folder, FolderOpen, Grid2X2, Lock } from "lucide-react";
import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from "react";
import { useState } from "react";

import { isRestricted, parentPath } from "@/components/rooms/roomsUtils";
import { cn } from "@/lib/utils";

export function TreeList({
  nodes,
  selected,
  promotedRoomPaths,
  metadata,
  onOpen,
  onMenu,
  canDrag,
  dragOverFolder,
  onDragStart,
  onDragEnd,
  onFolderDragEnter,
  onFolderDragLeave,
  onFolderDrop,
}: {
  nodes: FileNode[];
  selected: string | null;
  promotedRoomPaths: ReadonlySet<string>;
  metadata: SpaceMetadata;
  onOpen: (node: FileNode) => void;
  onMenu: (event: MouseEvent, node: FileNode) => void;
  canDrag?: boolean;
  dragOverFolder?: string | null;
  onDragStart?: (event: DragEvent, node: FileNode) => void;
  onDragEnd?: (event: DragEvent, node: FileNode) => void;
  onFolderDragEnter?: (path: string) => void;
  onFolderDragLeave?: (path: string) => void;
  onFolderDrop?: (event: DragEvent, path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragOverNode, setDragOverNode] = useState<string | null>(null);

  function toggleFolder(node: FileNode) {
    if (node.type !== "directory") return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
    onOpen(node);
  }

  function folderDropTarget(node: FileNode) {
    return node.type === "directory" ? node.path : parentPath(node.path);
  }

  function render(node: FileNode, depth: number): ReactNode {
    const active = selected === node.path;
    const open = node.type === "directory" && !collapsed.has(node.path);
    const promoted = promotedRoomPaths.has(node.path);
    const restricted = isRestricted(metadata, node.path);
    const dropTarget = folderDropTarget(node);
    const isFolderDropTarget = dragOverFolder === dropTarget && dragOverNode === node.path;

    return (
      <div key={node.path}>
        <div
          draggable={Boolean(canDrag)}
          onDragStart={(event) => onDragStart?.(event, node)}
          onDragEnd={(event) => {
            setDragOverNode(null);
            onDragEnd?.(event, node);
          }}
          onDragEnter={(event) => {
            if (!onFolderDragEnter) return;
            const isMove = event.dataTransfer.types.includes("ai-spaces/move");
            const isUpload = event.dataTransfer.types.includes("Files");
            if (!isMove && !isUpload) return;
            event.preventDefault();
            event.stopPropagation();
            setDragOverNode(node.path);
            onFolderDragEnter(dropTarget);
          }}
          onDragOver={(event) => {
            const isMove = event.dataTransfer.types.includes("ai-spaces/move");
            const isUpload = event.dataTransfer.types.includes("Files");
            if (!isMove && !isUpload) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = isMove ? "move" : "copy";
          }}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget;
            if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget))
              return;
            event.stopPropagation();
            setDragOverNode(null);
            onFolderDragLeave?.(dropTarget);
          }}
          onDrop={(event) => {
            if (!onFolderDrop) return;
            setDragOverNode(null);
            onFolderDrop(event, dropTarget);
          }}
          onClick={() => {
            if (node.type === "directory") toggleFolder(node);
            else onOpen(node);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onMenu(event, node);
          }}
          className={cn(
            "flex cursor-pointer select-none items-center gap-1.5 rounded-lg border-[1.5px] py-1.5 pr-2 pl-[var(--tree-indent)]",
            isFolderDropTarget
              ? "border-rooms-ink bg-rooms-paper-3"
              : active
                ? "border-rooms-line-strong bg-rooms-paper"
                : "border-transparent bg-transparent",
          )}
          style={
            {
              "--tree-indent": `${8 + depth * 15}px`,
            } as CSSProperties
          }
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFolder(node);
            }}
            className="inline-flex w-3.5 justify-center border-0 bg-transparent p-0 text-rooms-muted-2"
          >
            {node.type === "directory" && (
              <ChevronRight
                size={13}
                className={cn("transition-transform duration-150", open && "rotate-90")}
              />
            )}
          </button>
          {node.type === "directory" ? (
            open ? (
              <FolderOpen size={15} />
            ) : (
              <Folder size={15} />
            )
          ) : (
            <FileText size={15} />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] text-rooms-ink-soft",
              promoted ? "font-[650] text-primary" : active ? "font-semibold" : "font-medium",
              restricted && "text-rooms-muted",
            )}
          >
            {node.name}
          </span>
          {promoted && <Grid2X2 size={13} className="text-rooms-success" />}
          {restricted && <Lock size={13} className="text-rooms-muted-2" />}
        </div>
        {node.type === "directory" &&
          open &&
          node.children?.map((child) => render(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="rooms-scrollbar flex flex-1 flex-col gap-px overflow-auto px-2 pb-4">
      {nodes.map((node) => render(node, 0))}
    </div>
  );
}
