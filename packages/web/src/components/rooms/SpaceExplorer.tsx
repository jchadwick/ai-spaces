import type { CSSProperties, DragEvent } from "react";
import { useMemo, useRef, useState } from "react";
import type { FileNode } from "@ai-spaces/shared";
import { hasPermission } from "@ai-spaces/shared";
import {
  ArrowLeft,
  ArrowRight,
  Edit3,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  Lock,
  MessageSquare,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import {
  archiveSpaceTopic,
  createSpaceDirectory,
  createSpaceFile,
  deleteSpacePath,
  promoteSpaceTopic,
  renameSpacePath,
  uploadSpaceFile,
} from "@/api/spaceFiles";
import AIChatPane from "@/components/AIChatPane";
import { ContextMenu } from "@/components/rooms/ContextMenu";
import { RoomsAvatarStack } from "@/components/rooms/controls/RoomsAvatar";
import { RoomsButton, RoomsIconButton } from "@/components/rooms/controls/RoomsButton";
import { RoomsChip } from "@/components/rooms/controls/RoomsChip";
import { InlineEditableText } from "@/components/rooms/controls/InlineEditableText";
import { RoomsField } from "@/components/rooms/controls/RoomsField";
import { RoomsModal } from "@/components/rooms/controls/RoomsModal";
import { InviteButton } from "@/components/rooms/InviteButton";
import {
  basename,
  findNode,
  isRestricted,
  joinPath,
  movePath,
  parentPath,
  parseMoveData,
  spaceColor,
} from "@/components/rooms/roomsUtils";
import { TreeList } from "@/components/rooms/TreeList";
import type { RoomSummary, SpaceSummary } from "@/components/rooms/types";
import RoomsContentPane from "@/components/RoomsContentPane";
import SpaceSettingsEditor from "@/components/SpaceSettingsEditor";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ConnectionStatusProvider } from "@/contexts/ConnectionStatusContext";
import { FileMetadataProvider, useFileMetadata } from "@/contexts/FileMetadataContext";
import { useFileTree } from "@/hooks/useFileTree";
import { cn } from "@/lib/utils";

export function SpaceExplorer({
  space,
  spaces,
  rooms,
  promotedTopicPaths,
  promotedTopicIdsByPath,
  initialPath,
  onBack,
  onOpenRoom,
  onNewRoom,
  onRefreshRooms,
  onUpdateSpaceConfig,
}: {
  space: SpaceSummary;
  spaces: SpaceSummary[];
  rooms: RoomSummary[];
  promotedTopicPaths: ReadonlySet<string>;
  promotedTopicIdsByPath: ReadonlyMap<string, string>;
  initialPath: string | null;
  onBack: () => void;
  onOpenRoom: (spaceId: string, topicPath: string) => void;
  onNewRoom: () => void;
  onRefreshRooms: () => void;
  onUpdateSpaceConfig: (spaceId: string, patch: Partial<SpaceSummary["config"]>) => Promise<void>;
}) {
  const { accessToken } = useAuth();

  return (
    <ConnectionStatusProvider spaceId={space.id} accessToken={accessToken}>
      <FileMetadataProvider spaceId={space.id}>
        <div className="flex h-full min-w-0">
          <div className="min-w-0 flex-1">
            <SpaceExplorerInner
              key={`${space.id}:${initialPath ?? ""}`}
              space={space}
              spaces={spaces}
              rooms={rooms}
              promotedTopicPaths={promotedTopicPaths}
              promotedTopicIdsByPath={promotedTopicIdsByPath}
              initialPath={initialPath}
              onBack={onBack}
              onOpenRoom={onOpenRoom}
              onNewRoom={onNewRoom}
              onRefreshRooms={onRefreshRooms}
              onUpdateSpaceConfig={onUpdateSpaceConfig}
            />
          </div>
          <div className="flex min-h-0 w-95 min-w-80 max-w-[40vw] shrink-0">
            <AIChatPane role={space.userRole} spaceId={space.id} />
          </div>
        </div>
      </FileMetadataProvider>
    </ConnectionStatusProvider>
  );
}

function SpaceExplorerInner({
  space,
  spaces,
  rooms,
  promotedTopicPaths,
  promotedTopicIdsByPath,
  initialPath,
  onBack,
  onOpenRoom,
  onNewRoom,
  onRefreshRooms,
  onUpdateSpaceConfig,
}: {
  space: SpaceSummary;
  spaces: SpaceSummary[];
  rooms: RoomSummary[];
  promotedTopicPaths: ReadonlySet<string>;
  promotedTopicIdsByPath: ReadonlyMap<string, string>;
  initialPath: string | null;
  onBack: () => void;
  onOpenRoom: (spaceId: string, topicPath: string) => void;
  onNewRoom: () => void;
  onRefreshRooms: () => void;
  onUpdateSpaceConfig: (spaceId: string, patch: Partial<SpaceSummary["config"]>) => Promise<void>;
}) {
  const { files, loading, refresh, loadChildren } = useFileTree(space.id);
  const { metadata, updateEntry } = useFileMetadata();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const routeSelection = useMemo(() => {
    if (!initialPath || files.length === 0) {
      return {
        currentFolder: null as string | null,
        selectedFile: null as string | null,
      };
    }
    const node = findNode(files, initialPath);
    if (node?.type === "directory") {
      return { currentFolder: node.path, selectedFile: null as string | null };
    }
    if (node?.type === "file") {
      const parent = node.path.includes("/")
        ? node.path.slice(0, node.path.lastIndexOf("/"))
        : null;
      return { currentFolder: parent, selectedFile: node.path };
    }
    return {
      currentFolder: null as string | null,
      selectedFile: null as string | null,
    };
  }, [files, initialPath]);
  const [currentFolderOverride, setCurrentFolderOverride] = useState<string | null>();
  const [selectedFileOverride, setSelectedFileOverride] = useState<string | null>();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    node: FileNode | null;
  } | null>(null);
  const [draftFile, setDraftFile] = useState<{
    parent: string | null;
    type: "file" | "directory";
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<"rooms" | "files" | "members">(
    initialPath ? "files" : "rooms",
  );
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const canWrite = hasPermission(space.userRole, "files:write");
  const spaceRooms = rooms.filter((room) => room.spaceId === space.id);
  const currentFolder =
    currentFolderOverride === undefined ? routeSelection.currentFolder : currentFolderOverride;
  const selectedFile =
    selectedFileOverride === undefined ? routeSelection.selectedFile : selectedFileOverride;
  const setCurrentFolder = (path: string | null) => setCurrentFolderOverride(path);
  const setSelectedFile = (path: string | null) => setSelectedFileOverride(path);
  const selectedNode = selectedFile ? findNode(files, selectedFile) : null;
  const selectedPathParts = selectedFile?.split("/").filter(Boolean) ?? [];
  const selectedPathCrumbs = selectedPathParts.map((part, index) => ({
    part,
    path: selectedPathParts.slice(0, index + 1).join("/"),
    isLast: index === selectedPathParts.length - 1,
  }));

  async function promote(node: FileNode) {
    if (isRestricted(metadata, node.path)) {
      showToast("Restricted paths cannot be promoted to Rooms", "error");
      return;
    }
    try {
      await promoteSpaceTopic(
        space.id,
        `/${node.path}`,
        node.type === "directory" ? "directory" : "file",
      );
      showToast(`${node.name} promoted to a Room`, "success");
      onRefreshRooms();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to promote", "error");
    }
  }

  async function demote(node: FileNode) {
    const roomId = promotedTopicIdsByPath.get(node.path);
    if (!roomId) return;
    try {
      await archiveSpaceTopic(space.id, roomId);
      showToast("Demoted to a folder - files kept", "success");
      onRefreshRooms();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to demote", "error");
    }
  }

  async function toggleRestricted(node: FileNode) {
    await updateEntry(node.path, {
      restricted: !isRestricted(metadata, node.path),
    } as never);
    showToast(
      isRestricted(metadata, node.path) ? "Sharing allowed" : "Restricted - never shared",
      "success",
    );
    onRefreshRooms();
  }

  async function deleteNode(node: FileNode) {
    try {
      await deleteSpacePath(space.id, node.path, node.type === "directory" ? "directory" : "file");
      showToast(`Deleted ${node.name}`, "success");
      if (selectedFile === node.path) setSelectedFile(null);
      setContentRefreshKey((current) => current + 1);
      refresh();
      onRefreshRooms();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to delete", "error");
    }
  }

  async function renameNode(node: FileNode) {
    const name = window.prompt("Rename", node.name)?.trim();
    if (!name || name === node.name) return;
    const parent = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
    const nextPath = parent ? `${parent}/${name}` : name;
    try {
      const actualPath = await renameSpacePath(
        space.id,
        node.path,
        nextPath,
        node.type === "directory" ? "directory" : "file",
      );
      if (selectedFile === node.path) setSelectedFile(actualPath);
      setContentRefreshKey((current) => current + 1);
      refresh();
      onRefreshRooms();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to rename", "error");
    }
  }

  async function createNew() {
    if (!draftFile || !newName.trim()) return;
    const path = draftFile.parent ? `${draftFile.parent}/${newName.trim()}` : newName.trim();
    try {
      if (draftFile.type === "directory") await createSpaceDirectory(space.id, path);
      else await createSpaceFile(space.id, path);
      setDraftFile(null);
      setNewName("");
      refresh();
      if (draftFile.parent) await loadChildren(draftFile.parent);
      if (draftFile.type === "file") setSelectedFile(path);
      showToast(draftFile.type === "directory" ? "Folder created" : "File created", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create", "error");
    }
  }

  async function uploadFiles(fileList: FileList, targetFolder: string | null) {
    if (!canWrite || fileList.length === 0) return;
    try {
      const uploaded = await Promise.all(
        Array.from(fileList).map(async (file) => {
          await uploadSpaceFile(space.id, joinPath(targetFolder, file.name), file);
          return file.name;
        }),
      );
      const label = uploaded.length === 1 ? `"${uploaded[0]}"` : `${uploaded.length} files`;
      showToast(`Uploaded ${label}`, "success");
      refresh();
      if (targetFolder) await loadChildren(targetFolder);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Upload failed", "error");
    }
  }

  function chooseUploadTarget(targetFolder: string | null) {
    setUploadTarget(targetFolder);
    fileInputRef.current?.click();
  }

  async function moveNode(
    source: { path: string; type: "file" | "directory" },
    targetFolder: string | null,
  ) {
    if (!canWrite) return;
    const target = targetFolder ?? "";
    if (
      source.type === "directory" &&
      (target === source.path || target.startsWith(`${source.path}/`))
    ) {
      showToast("Cannot move a folder into itself", "error");
      return;
    }
    const sourceParent = parentPath(source.path);
    if (sourceParent === target) return;
    const nextPath = joinPath(target, basename(source.path));
    try {
      const actualPath = await renameSpacePath(space.id, source.path, nextPath, source.type);
      setSelectedFile(movePath(selectedFile, source.path, actualPath));
      setCurrentFolder(movePath(currentFolder, source.path, actualPath));
      refresh();
      if (sourceParent) await loadChildren(sourceParent);
      if (target) await loadChildren(target);
      onRefreshRooms();
      showToast(`Moved ${basename(source.path)}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to move", "error");
    }
  }

  function handleDrop(event: DragEvent, targetFolder: string | null) {
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
    if (!canWrite || (!isMove && !isUpload)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isMove ? "move" : "copy";
    setIsDragOver(true);
  }

  function openNode(node: FileNode) {
    if (node.type === "directory") {
      setCurrentFolder(node.path);
      setSelectedFile(null);
      void loadChildren(node.path);
      return;
    }
    setSelectedFile(node.path);
  }

  return (
    <div
      className="rooms-rise flex h-full flex-col overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="shrink-0 border-b border-rooms-line px-8 pb-4.5 pt-5.5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13.5px] text-rooms-muted"
        >
          <ArrowLeft size={16} /> All rooms
        </button>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="font-semibold text-rooms-ink-soft">Workspace root</span>
          <span className="text-rooms-muted">Only owners see this view.</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-[1_1_520px]">
            <div className="flex w-full items-center gap-3">
              <span
                className="size-[13px] rounded-full"
                style={
                  {
                    backgroundColor: spaceColor(spaces, space.id),
                  } satisfies CSSProperties
                }
              />
              <h1 className="rooms-title m-0 min-w-0 flex-auto text-[32px] leading-[1.08]">
                <InlineEditableText
                  value={space.config.name}
                  placeholder="Untitled space"
                  ariaLabel="Space name"
                  canEdit
                  required
                  className="text-[32px] font-bold leading-[1.08]"
                  onSave={(name) => onUpdateSpaceConfig(space.id, { name })}
                />
              </h1>
            </div>
            <div className="mt-2 w-full text-[13.5px] text-rooms-muted">
              <InlineEditableText
                value={space.config.description ?? ""}
                placeholder="Add a space description"
                ariaLabel="Space description"
                canEdit
                multiline
                className="text-[13.5px] font-normal leading-normal"
                emptyClassName="text-rooms-muted-2"
                onSave={(description) => onUpdateSpaceConfig(space.id, { description })}
              />
            </div>
          </div>
          <InviteButton spaceId={space.id} />
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5 border-b border-rooms-line px-8">
        {(["rooms", "files", "members"] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-3 pb-2.5 pt-3 text-[13.5px] font-[650]",
                active ? "border-rooms-ink text-rooms-ink" : "border-transparent text-rooms-muted",
              )}
            >
              {tab === "rooms" ? "Rooms" : tab === "files" ? "Files" : "Members"}
            </button>
          );
        })}
      </div>
      {activeTab === "rooms" ? (
        <div className="rooms-scrollbar flex-1 overflow-auto bg-rooms-paper">
          <div className="mx-auto w-full max-w-270 px-8 pb-12 pt-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="rooms-title m-0 text-[30px] leading-[1.08]">Rooms</h2>
                <p className="mt-2 mb-0 text-[13.5px] text-rooms-muted">
                  {spaceRooms.length} room{spaceRooms.length === 1 ? "" : "s"} promoted from this
                  space.
                </p>
              </div>
              <RoomsButton variant="primary" icon={<Plus size={18} />} onClick={onNewRoom}>
                New room
              </RoomsButton>
            </div>
            <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {spaceRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onOpenRoom(room.spaceId, room.topicPath)}
                  className="flex min-h-39 cursor-pointer flex-col rounded-2xl border-[1.5px] border-rooms-line bg-rooms-paper px-5 pb-4 pt-5 text-left shadow-rooms-card transition hover:border-rooms-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="rooms-title m-0 text-[22px] leading-[1.16]">{room.name}</h3>
                    <ArrowRight size={20} className="shrink-0 text-rooms-muted" />
                  </div>
                  <p className="mt-2 mb-0 line-clamp-2 overflow-hidden text-sm leading-normal text-rooms-ink-soft">
                    {room.summary}
                  </p>
                  <div className="flex-1" />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                    <RoomsChip tone="promoted" icon={<Grid2X2 size={12} />}>
                      {room.targetType === "directory" ? "Folder room" : "File room"}
                    </RoomsChip>
                    <RoomsAvatarStack members={room.members} />
                  </div>
                </button>
              ))}
            </div>
            {spaceRooms.length === 0 && (
              <div className="mt-6 rounded-2xl border-[1.5px] border-rooms-line bg-rooms-paper px-6 py-10 text-center text-rooms-muted">
                <MessageSquare size={28} className="mx-auto mb-3" />
                <div className="text-sm">No rooms yet.</div>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "files" ? (
        <div className="flex min-h-0 flex-1">
          <div
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => handleDrop(event, currentFolder)}
            className={cn(
              "flex w-66 shrink-0 flex-col border-r border-rooms-line",
              isDragOver ? "bg-rooms-paper-3" : "bg-rooms-paper-2",
            )}
          >
            <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
              <span className="text-xs font-bold uppercase tracking-[0.04em] text-rooms-muted">
                Files
              </span>
              <div className="flex gap-0.5">
                <RoomsIconButton
                  title="New folder"
                  onClick={() => setDraftFile({ parent: currentFolder, type: "directory" })}
                  className="size-[30px]"
                >
                  <Folder size={16} />
                </RoomsIconButton>
                <RoomsIconButton
                  title="New file"
                  onClick={() => setDraftFile({ parent: currentFolder, type: "file" })}
                  className="size-[30px]"
                >
                  <Plus size={16} />
                </RoomsIconButton>
                <RoomsIconButton
                  title="Upload files"
                  onClick={() => chooseUploadTarget(currentFolder)}
                  className="size-[30px]"
                >
                  <Upload size={16} />
                </RoomsIconButton>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void uploadFiles(event.target.files, uploadTarget);
                event.currentTarget.value = "";
              }}
            />
            <TreeList
              nodes={files}
              selected={selectedFile ?? currentFolder}
              promotedTopicPaths={promotedTopicPaths}
              metadata={metadata}
              onOpen={openNode}
              onMenu={(event, node) => setMenu({ x: event.clientX, y: event.clientY, node })}
              canDrag={canWrite}
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
          {selectedNode ? (
            <RoomsContentPane
              spaceId={space.id}
              filePath={selectedNode.path}
              canEdit={true}
              onSaved={() => {
                refresh();
                setContentRefreshKey((current) => current + 1);
              }}
              externalRefreshKey={contentRefreshKey}
              headerContent={
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentFolder(null);
                      setSelectedFile(null);
                    }}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[13.5px] font-semibold text-rooms-muted"
                  >
                    {space.config.name}
                  </button>
                  {selectedPathCrumbs.map((crumb) => (
                    <span
                      key={crumb.path}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[13.5px]",
                        crumb.isLast ? "font-[650] text-rooms-ink" : "font-medium text-rooms-muted",
                      )}
                    >
                      <span className="text-rooms-muted-2">/</span>
                      {crumb.part}
                    </span>
                  ))}
                </div>
              }
            />
          ) : (
            <div
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, node: null });
              }}
              className="grid min-w-0 flex-1 place-items-center bg-rooms-paper text-rooms-muted"
            >
              <div className="flex flex-col items-center gap-3">
                {loading ? (
                  <div className="text-sm">Loading files...</div>
                ) : (
                  <>
                    <FileText size={32} className="text-rooms-muted-2" />
                    <div className="text-sm">Select a file</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rooms-scrollbar flex-1 overflow-auto bg-rooms-paper">
          <SpaceSettingsEditor
            spaceId={space.id}
            spaceConfig={space.config}
            onConfigUpdated={() => {
              void onRefreshRooms();
            }}
            initialTab="users"
            allowedTabs={["users"]}
            showHeader={false}
          />
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.node
              ? [
                  {
                    label: "Open",
                    icon:
                      menu.node.type === "directory" ? <FolderOpen size={16} /> : <Eye size={16} />,
                    onClick: () => openNode(menu.node!),
                  },
                  ...(menu.node.type === "directory"
                    ? [
                        {
                          label: "Add File",
                          icon: <FileText size={16} />,
                          onClick: () =>
                            setDraftFile({
                              parent: menu.node!.path,
                              type: "file",
                            }),
                        },
                        {
                          label: "Add Folder",
                          icon: <Folder size={16} />,
                          onClick: () =>
                            setDraftFile({
                              parent: menu.node!.path,
                              type: "directory",
                            }),
                        },
                        {
                          label: "Upload files",
                          icon: <Upload size={16} />,
                          onClick: () => chooseUploadTarget(menu.node!.path),
                        },
                      ]
                    : []),
                  {
                    label: "Rename",
                    icon: <Edit3 size={16} />,
                    onClick: () => void renameNode(menu.node!),
                  },
                  ...(menu.node.type === "directory"
                    ? promotedTopicPaths.has(menu.node.path)
                      ? [
                          {
                            label: "Open Room",
                            icon: <Grid2X2 size={16} />,
                            onClick: () => onOpenRoom(space.id, `/${menu.node!.path}`),
                          },
                          {
                            label: "Demote to folder",
                            icon: <ArrowRight size={16} />,
                            onClick: () => void demote(menu.node!),
                          },
                        ]
                      : [
                          {
                            label: "Promote to Room",
                            icon: <Grid2X2 size={16} />,
                            onClick: () => void promote(menu.node!),
                          },
                        ]
                    : []),
                  {
                    label: isRestricted(metadata, menu.node.path)
                      ? "Allow sharing"
                      : "Restrict (make private)",
                    icon: isRestricted(metadata, menu.node.path) ? (
                      <Eye size={16} />
                    ) : (
                      <Lock size={16} />
                    ),
                    onClick: () => void toggleRestricted(menu.node!),
                  },
                  {
                    label: "Delete",
                    icon: <Trash2 size={16} />,
                    danger: true,
                    onClick: () => void deleteNode(menu.node!),
                  },
                ]
              : [
                  {
                    label: "Add Folder",
                    icon: <Folder size={16} />,
                    onClick: () =>
                      setDraftFile({
                        parent: currentFolder,
                        type: "directory",
                      }),
                  },
                  {
                    label: "Add File",
                    icon: <FileText size={16} />,
                    onClick: () => setDraftFile({ parent: currentFolder, type: "file" }),
                  },
                  {
                    label: "Upload files",
                    icon: <Upload size={16} />,
                    onClick: () => chooseUploadTarget(currentFolder),
                  },
                ]
          }
        />
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
    </div>
  );
}
