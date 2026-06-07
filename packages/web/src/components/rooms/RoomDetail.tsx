import type { DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileMetadataEntry, FileNode, SpaceRole } from "@ai-spaces/shared";
import { hasPermission } from "@ai-spaces/shared";
import { FileText, Folder, Plus, Shield, Trash2, Upload } from "lucide-react";

import {
  createSpaceDirectory,
  createSpaceFile,
  deleteSpacePath,
  renameSpacePath,
  uploadSpaceFile,
} from "@/api/spaceFiles";
import AIChatPane from "@/components/AIChatPane";
import { ContextMenu } from "@/components/rooms/ContextMenu";
import { RoomsButton, RoomsIconButton } from "@/components/rooms/controls/RoomsButton";
import { InlineEditableText } from "@/components/rooms/controls/InlineEditableText";
import { RoomsField } from "@/components/rooms/controls/RoomsField";
import { RoomsModal } from "@/components/rooms/controls/RoomsModal";
import {
  basename,
  findNode,
  firstFileNode,
  joinPath,
  movePath,
  parentPath,
  parseMoveData,
  replaceNodeChildren,
  roleIsOwner,
  sortFileNodes,
  stripTopicPath,
} from "@/components/rooms/roomsUtils";
import { TreeList } from "@/components/rooms/TreeList";
import type { RoomSummary } from "@/components/rooms/types";
import RoomsContentPane from "@/components/RoomsContentPane";
import ShareSpaceDialog from "@/components/ShareSpaceDialog";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ConnectionStatusProvider, useConnectionStatus } from "@/contexts/ConnectionStatusContext";
import { useAPI } from "@/hooks/useAPI";
import { cn } from "@/lib/utils";

export function RoomDetail({
  room,
  role,
  initialFilePath,
  onSelectFile,
  onUpdateRoomMetadata,
}: {
  room: RoomSummary;
  role: SpaceRole;
  initialFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  onUpdateRoomMetadata: (room: RoomSummary, patch: Partial<FileMetadataEntry>) => Promise<void>;
}) {
  const { accessToken } = useAuth();
  return (
    <ConnectionStatusProvider spaceId={room.spaceId} accessToken={accessToken}>
      <RoomDetailInner
        room={room}
        role={role}
        initialFilePath={initialFilePath}
        onSelectFile={onSelectFile}
        onUpdateRoomMetadata={onUpdateRoomMetadata}
      />
    </ConnectionStatusProvider>
  );
}

function RoomDetailInner({
  room,
  role,
  initialFilePath,
  onSelectFile,
  onUpdateRoomMetadata,
}: {
  room: RoomSummary;
  role: SpaceRole;
  initialFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  onUpdateRoomMetadata: (room: RoomSummary, patch: Partial<FileMetadataEntry>) => Promise<void>;
}) {
  const apiFetch = useAPI();
  const { selectTopic } = useConnectionStatus();
  const { showToast } = useToast();
  const canEdit = hasPermission(role, "files:write");
  const canManageSpace = hasPermission(role, "space:manage");
  const canEditMetadata = roleIsOwner(role);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [draftFile, setDraftFile] = useState<{
    parent: string | null;
    type: "file" | "directory";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newName, setNewName] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    node: FileNode | null;
  } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const roomRoot = stripTopicPath(room.topicPath);
  const routedFilePath = initialFilePath ? joinPath(roomRoot, initialFilePath) : null;

  const fetchDir = useCallback(
    async (dirPath: string) => {
      const res = await apiFetch(
        `/api/spaces/${room.spaceId}/files?path=${encodeURIComponent(dirPath)}`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({
          error: "Failed to load files",
        }))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Failed to load files");
      }
      const data = (await res.json()) as { files?: FileNode[] };
      return sortFileNodes(data.files ?? []);
    },
    [apiFetch, room.spaceId],
  );

  const loadChildren = useCallback(
    async (dirPath: string) => {
      const children = await fetchDir(dirPath);
      setNodes((current) => replaceNodeChildren(current, dirPath, children));
    },
    [fetchDir],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchDir(roomRoot);
      setNodes(next);
      setActivePath((current) => {
        const preferred = routedFilePath ?? current;
        const preferredNode = preferred ? findNode(next, preferred) : null;
        if (preferredNode?.type === "file") return preferredNode.path;
        return firstFileNode(next)?.path ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [fetchDir, roomRoot, routedFilePath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (routedFilePath) setActivePath(routedFilePath);
  }, [routedFilePath]);

  useEffect(() => {
    void selectTopic(room.topicPath);
  }, [room.topicPath, selectTopic]);

  const activeFile = activePath ? findNode(nodes, activePath) : firstFileNode(nodes);
  const activeFilePath = activeFile?.type === "file" ? activeFile.path : null;

  useEffect(() => {
    const handleFileModified = (event: CustomEvent<{ path: string; action: string }>) => {
      const changedPath = event.detail?.path;
      const action = event.detail?.action;
      if (!changedPath || (changedPath !== roomRoot && !changedPath.startsWith(`${roomRoot}/`)))
        return;
      void refresh();
      if (changedPath === activeFilePath) {
        if (action === "deleted") setActivePath(null);
        else setContentRefreshKey((current) => current + 1);
      }
    };
    window.addEventListener("fileModified", handleFileModified as EventListener);
    return () => window.removeEventListener("fileModified", handleFileModified as EventListener);
  }, [activeFilePath, refresh, roomRoot]);

  async function createNew() {
    if (!draftFile || !newName.trim()) return;
    const parent = draftFile.parent ?? roomRoot;
    const path = joinPath(parent, newName);
    try {
      if (draftFile.type === "directory") {
        await createSpaceDirectory(room.spaceId, path);
        setSelectedFolder(path);
      } else {
        await createSpaceFile(room.spaceId, path);
        setActivePath(path);
        onSelectFile(path);
      }
      setDraftFile(null);
      setNewName("");
      if (parent === roomRoot) await refresh();
      else await loadChildren(parent);
      showToast(draftFile.type === "directory" ? "Folder created" : "File created", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create", "error");
    }
  }

  async function uploadFiles(fileList: FileList, targetFolder: string) {
    if (!canEdit || fileList.length === 0) return;
    try {
      const uploaded = await Promise.all(
        Array.from(fileList).map(async (file) => {
          await uploadSpaceFile(room.spaceId, joinPath(targetFolder, file.name), file);
          return file.name;
        }),
      );
      const label = uploaded.length === 1 ? `"${uploaded[0]}"` : `${uploaded.length} files`;
      showToast(`Uploaded ${label}`, "success");
      if (targetFolder === roomRoot) await refresh();
      else await loadChildren(targetFolder);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Upload failed", "error");
    }
  }

  function chooseUploadTarget(targetFolder: string) {
    setUploadTarget(targetFolder);
    fileInputRef.current?.click();
  }

  async function moveNode(
    source: { path: string; type: "file" | "directory" },
    targetFolder: string,
  ) {
    if (!canEdit) return;
    if (
      source.type === "directory" &&
      (targetFolder === source.path || targetFolder.startsWith(`${source.path}/`))
    ) {
      showToast("Cannot move a folder into itself", "error");
      return;
    }
    const sourceParent = parentPath(source.path);
    if (sourceParent === targetFolder) return;
    const nextPath = joinPath(targetFolder, basename(source.path));
    try {
      const actualPath = await renameSpacePath(room.spaceId, source.path, nextPath, source.type);
      setActivePath((current) => movePath(current, source.path, actualPath));
      setSelectedFolder((current) => movePath(current, source.path, actualPath));
      if (sourceParent === roomRoot || targetFolder === roomRoot) await refresh();
      if (sourceParent && sourceParent !== roomRoot) await loadChildren(sourceParent);
      if (targetFolder !== roomRoot) await loadChildren(targetFolder);
      showToast(`Moved ${basename(source.path)}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to move", "error");
    }
  }

  async function deleteNode(node: FileNode) {
    setIsDeleting(true);
    try {
      await deleteSpacePath(
        room.spaceId,
        node.path,
        node.type === "directory" ? "directory" : "file",
      );
      setActivePath((current) =>
        current === node.path || current?.startsWith(`${node.path}/`) ? null : current,
      );
      setSelectedFolder((current) =>
        current === node.path || current?.startsWith(`${node.path}/`)
          ? parentPath(node.path)
          : current,
      );
      const parent = parentPath(node.path);
      if (!parent || parent === roomRoot) await refresh();
      else await loadChildren(parent);
      setContentRefreshKey((current) => current + 1);
      setDeleteTarget(null);
      showToast(`Deleted ${node.name}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to delete", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  function openNode(node: FileNode) {
    if (node.type === "directory") {
      setSelectedFolder(node.path);
      void loadChildren(node.path);
      return;
    }
    setActivePath(node.path);
    onSelectFile(node.path);
  }

  function handleDrop(event: DragEvent, targetFolder: string) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    setDragOverFolder(null);
    const moveData = parseMoveData(event);
    if (moveData) {
      void moveNode(moveData, targetFolder);
      return;
    }
    if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files, targetFolder);
  }

  function handleDragOver(event: DragEvent) {
    const isMove = event.dataTransfer.types.includes("ai-spaces/move");
    const isUpload = event.dataTransfer.types.includes("Files");
    if (!canEdit || (!isMove && !isUpload)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isMove ? "move" : "copy";
    setIsDragOver(true);
  }

  return (
    <div className="rooms-rise flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-rooms-line px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-[1_1_520px]">
            <h1 className="rooms-title m-0 w-full text-[34px] leading-[1.08]">
              <InlineEditableText
                value={room.name}
                placeholder="Untitled room"
                ariaLabel="Room name"
                canEdit={canEditMetadata}
                required
                className="text-[34px] font-bold leading-[1.08]"
                onSave={(displayName) => onUpdateRoomMetadata(room, { displayName })}
              />
            </h1>
            <div className="mt-2 w-full text-sm leading-normal text-rooms-ink-soft">
              <InlineEditableText
                value={room.summary}
                placeholder="Add a room description"
                ariaLabel="Room description"
                canEdit={canEditMetadata}
                multiline
                className="text-sm font-normal leading-normal"
                emptyClassName="text-rooms-muted"
                onSave={(summary) => onUpdateRoomMetadata(room, { summary })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {canManageSpace && (
              <button
                type="button"
                onClick={() => setShareDialogOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rooms-line bg-rooms-paper px-3 text-sm font-semibold text-rooms-ink shadow-sm transition hover:bg-rooms-paper-2"
              >
                <Upload size={15} />
                Share
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => handleDrop(event, roomRoot)}
          className={cn(
            "flex w-58 shrink-0 flex-col border-r border-rooms-line",
            isDragOver ? "bg-rooms-paper-3" : "bg-rooms-paper-2",
          )}
        >
          <div className="flex items-center justify-between px-3.5 pb-2 pt-4">
            <span className="text-xs font-bold uppercase tracking-[0.04em] text-rooms-muted">
              Files
            </span>
            {canEdit ? (
              <div className="flex gap-0.5">
                <RoomsIconButton
                  title="New folder"
                  onClick={() =>
                    setDraftFile({
                      parent: selectedFolder ?? roomRoot,
                      type: "directory",
                    })
                  }
                  className="size-[30px]"
                >
                  <Folder size={16} />
                </RoomsIconButton>
                <RoomsIconButton
                  title="New file"
                  onClick={() =>
                    setDraftFile({
                      parent: selectedFolder ?? roomRoot,
                      type: "file",
                    })
                  }
                  className="size-[30px]"
                >
                  <Plus size={16} />
                </RoomsIconButton>
                <RoomsIconButton
                  title="Upload files"
                  onClick={() => chooseUploadTarget(selectedFolder ?? roomRoot)}
                  className="size-[30px]"
                >
                  <Upload size={16} />
                </RoomsIconButton>
              </div>
            ) : (
              <span className="text-xs text-rooms-muted-2">{nodes.length}</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files)
                void uploadFiles(event.target.files, uploadTarget ?? roomRoot);
              event.currentTarget.value = "";
            }}
          />
          <div
            className="rooms-scrollbar flex flex-1 flex-col gap-0.5 overflow-auto px-2 pb-3"
            onContextMenu={(event) => {
              if (canEdit) {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, node: null });
              }
            }}
          >
            {loading && <div className="p-3 text-[13px] text-rooms-muted">Loading...</div>}
            <TreeList
              nodes={nodes}
              selected={activeFilePath ?? selectedFolder}
              promotedTopicPaths={new Set()}
              metadata={{ files: {} }}
              onOpen={openNode}
              onMenu={(event, node) => {
                if (canEdit) setMenu({ x: event.clientX, y: event.clientY, node });
              }}
              canDrag={canEdit}
              dragOverFolder={dragOverFolder}
              onDragStart={(event, node) => {
                event.dataTransfer.setData(
                  "ai-spaces/move",
                  JSON.stringify({
                    path: node.path,
                    type: node.type === "directory" ? "directory" : "file",
                  }),
                );
                event.dataTransfer.effectAllowed = "move";
              }}
              onFolderDragEnter={(path) => setDragOverFolder(path)}
              onFolderDragLeave={(path) =>
                setDragOverFolder((current) => (current === path ? null : current))
              }
              onFolderDrop={(event, path) => handleDrop(event, path)}
            />
          </div>
          <div className="flex items-start gap-2 border-t border-rooms-line px-3.5 py-3">
            <Shield size={15} className="text-rooms-boundary" />
            <span className="text-[11.5px] leading-normal text-rooms-muted">
              Only this folder is shared. The rest of the Space stays private.
            </span>
          </div>
        </div>
        <RoomsContentPane
          key={activeFilePath ?? "no-file"}
          spaceId={room.spaceId}
          filePath={activeFilePath}
          canEdit={canEdit}
          onSaved={refresh}
          externalRefreshKey={contentRefreshKey}
        />
        <div className="flex min-h-0 w-95 min-w-80 max-w-[40vw] shrink-0">
          <AIChatPane role={role} spaceId={room.spaceId} />
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(!menu.node || menu.node.type === "directory"
              ? [
                  {
                    label: "Add File",
                    icon: <FileText size={16} />,
                    onClick: () =>
                      setDraftFile({
                        parent: menu.node?.path ?? roomRoot,
                        type: "file",
                      }),
                  },
                  {
                    label: "Add Folder",
                    icon: <Folder size={16} />,
                    onClick: () =>
                      setDraftFile({
                        parent: menu.node?.path ?? roomRoot,
                        type: "directory",
                      }),
                  },
                  {
                    label: "Upload files",
                    icon: <Upload size={16} />,
                    onClick: () => chooseUploadTarget(menu.node?.path ?? roomRoot),
                  },
                ]
              : []),
            ...(menu.node
              ? [
                  {
                    label: "Delete",
                    icon: <Trash2 size={16} />,
                    danger: true,
                    onClick: () => setDeleteTarget(menu.node),
                  },
                ]
              : []),
          ]}
        />
      )}
      {deleteTarget && (
        <RoomsModal
          title={`Delete ${deleteTarget.type === "directory" ? "folder" : "file"}`}
          onClose={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
          footer={
            <>
              <RoomsButton
                variant="ghost"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </RoomsButton>
              <RoomsButton
                variant="danger"
                disabled={isDeleting}
                onClick={() => void deleteNode(deleteTarget)}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </RoomsButton>
            </>
          }
        >
          <p className="m-0 text-sm leading-normal text-rooms-ink-soft">
            Delete "{deleteTarget.name}"? This cannot be undone.
          </p>
        </RoomsModal>
      )}
      {draftFile && (
        <RoomsModal
          title={draftFile.type === "directory" ? "New folder" : "New file"}
          onClose={() => setDraftFile(null)}
          footer={
            <>
              <RoomsButton variant="ghost" onClick={() => setDraftFile(null)}>
                Cancel
              </RoomsButton>
              <RoomsButton variant="primary" disabled={!newName.trim()} onClick={createNew}>
                Create
              </RoomsButton>
            </>
          }
        >
          <RoomsField
            label="Name"
            value={newName}
            onChange={setNewName}
            placeholder={draftFile.type === "directory" ? "Folder name" : "notes.md"}
          />
        </RoomsModal>
      )}
      {canManageSpace && (
        <ShareSpaceDialog
          spaceId={room.spaceId}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      )}
    </div>
  );
}
