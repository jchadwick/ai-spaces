import { useState, useEffect, useRef, useCallback } from "react";
import { useFileTree } from "../hooks/useFileTree";
import { useToast } from "./ui/use-toast";
import { useFileMetadata } from "../contexts/FileMetadataContext";
import { getFileNodeIcon } from "../lib/fileIcons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useAPI } from "@/hooks/useAPI";
import type { FileNode, SpaceRole } from "@ai-spaces/shared";
import { hasPermission } from "@ai-spaces/shared";

interface FileExplorerProps {
  spaceId: string | undefined;
  role: SpaceRole;
  selectedFile: string | null;
  onFileSelect: (filePath: string | null) => void;
  onTopicSelect: (topicPath: string) => void;
  onSpaceSettingsSelect: () => void;
  promotedTopicPaths: ReadonlySet<string>;
  onPromoteTopic: (topicPath: string, targetType: 'file' | 'directory') => Promise<void>;
  onArchiveTopic: (topicPath: string) => Promise<void>;
  onPathDeleted: (topicPath: string) => Promise<void>;
  onPathRenamed: (fromPath: string, toPath: string) => Promise<void>;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}


function FileTreeNode({
  node,
  depth = 0,
  selectedFile,
  selectedFolderPath,
  onFileSelect,
  onTopicSelect,
  onSpaceSettingsSelect,
  expandedFolders,
  toggleFolder,
  onLoadChildren,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  dragOverFolder,
  onFolderDragEnter,
  onFolderDragLeave,
  onFolderDrop,
  getDisplayName,
  promotedTopicPaths,
  onFolderSelect,
  onDragStart,
  onDragEnd,
}: {
  node: FileNode;
  depth?: number;
  selectedFile: string | null;
  selectedFolderPath: string | null;
  onFileSelect: (path: string) => void;
  onTopicSelect: (path: string) => void;
  onSpaceSettingsSelect: () => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onLoadChildren: (dirPath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  dragOverFolder: string | null;
  onFolderDragEnter: (path: string) => void;
  onFolderDragLeave: (path: string) => void;
  onFolderDrop: (e: React.DragEvent, path: string) => void;
  getDisplayName: (path: string) => string | undefined;
  promotedTopicPaths: ReadonlySet<string>;
  onFolderSelect: (path: string) => void;
  onDragStart: (e: React.DragEvent, node: FileNode) => void;
  onDragEnd: () => void;
}) {
  const isDirectory = node.type === "directory";
  const isSelected = selectedFile === node.path || selectedFolderPath === node.path;
  const isExpanded = expandedFolders.has(node.path);
  const isHidden = node.name.startsWith(".");
  const isSpaceFolder = node.name === ".space";
  const isRenaming = renamingPath === node.path;
  const isDragTarget = isDirectory && dragOverFolder === node.path;
  const isTopic = promotedTopicPaths.has(node.path);

  const paddingLeft = 8 + depth * 16;

  const handleClick = () => {
    if (isRenaming) return;
    // .space folder opens Space Settings instead of expanding
    if (isSpaceFolder) {
      onSpaceSettingsSelect();
      return;
    }
    if (isDirectory) {
      const expanding = !expandedFolders.has(node.path);
      toggleFolder(node.path);
      onFolderSelect(node.path);
      if (expanding && node.children === undefined) {
        onLoadChildren(node.path);
      }
    } else {
      onFileSelect(node.path);
      // Set folder selection to the file's parent directory
      const parentPath = node.path.includes("/")
        ? node.path.substring(0, node.path.lastIndexOf("/"))
        : "";
      onFolderSelect(parentPath || "");
    }
    if (!isSpaceFolder && isTopic) onTopicSelect(node.path);
  };

  const icon = getFileNodeIcon(node.name, node.type);

  const nodeStyle: React.CSSProperties = {
    paddingLeft: `${paddingLeft}px`,
    paddingRight: 8,
    paddingTop: 5,
    paddingBottom: 5,
    background: isDragTarget
      ? 'rgba(194,65,12,0.08)'
      : isSelected
        ? 'var(--t-accentSoft)'
        : 'transparent',
    color: isDragTarget
      ? 'var(--t-accent)'
      : isSelected
        ? 'var(--t-accentInk)'
        : 'var(--t-inkMid)',
    borderLeft: isSelected ? '2px solid #C2410C' : '2px solid transparent',
    fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
    fontSize: 14,
    fontStyle: isHidden && !isSpaceFolder ? 'italic' : 'normal',
    opacity: isHidden && !isSpaceFolder ? 0.7 : 1,
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    textAlign: 'left',
    outline: isDragTarget ? '1px solid rgba(194,65,12,0.3)' : 'none',
    transition: 'background 0.1s',
    borderRadius: isSelected ? 0 : 4,
  };

  return (
    <>
      <button
        type="button"
        draggable
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        onDragStart={(e) => onDragStart(e, node)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          if (!isDirectory) return;
          const isInternalMove = e.dataTransfer.types.includes("ai-spaces/move");
          const isExternalUpload = e.dataTransfer.types.includes("Files");
          if (isInternalMove || isExternalUpload) {
            e.preventDefault();
            e.dataTransfer.dropEffect = isInternalMove ? "move" : "copy";
          }
        }}
        onDragEnter={isDirectory ? () => onFolderDragEnter(node.path) : undefined}
        onDragLeave={isDirectory ? () => onFolderDragLeave(node.path) : undefined}
        onDrop={isDirectory ? (e) => onFolderDrop(e, node.path) : undefined}
        style={nodeStyle}
        onMouseEnter={(e) => { if (!isSelected && !isDragTarget) (e.currentTarget as HTMLElement).style.background = 'rgba(26,23,20,0.04)'; }}
        onMouseLeave={(e) => { if (!isSelected && !isDragTarget) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {isDirectory && !isSpaceFolder && (
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSelected ? 'var(--t-accent)' : 'var(--t-inkDim)' }}>
            {isExpanded ? "folder_open" : "folder"}
          </span>
        )}
        {isSpaceFolder && (
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSelected ? 'var(--t-accent)' : 'var(--t-inkDim)' }}>
            settings
          </span>
        )}
        {isTopic && (
          <span className="material-symbols-outlined" title="Topic" style={{ fontSize: 14, color: 'var(--t-agent)' }}>forum</span>
        )}
        {!isDirectory && (
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSelected ? 'var(--t-accent)' : 'var(--t-inkDim)' }}>{icon}</span>
        )}
        {isRenaming ? (
          <input
            autoFocus
            style={{ fontSize: 14, background: 'var(--t-bgRaised)', border: '1px solid #E2DBCD', borderRadius: 4, padding: '0 4px', flex: 1, outline: 'none', color: 'var(--t-ink)', fontFamily: "'Inter Tight', sans-serif" }}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onRenameCommit();
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={onRenameCommit}
          />
        ) : (
          <span style={{ fontWeight: isSelected ? 600 : 400, color: isSpaceFolder ? 'var(--t-inkMid)' : undefined }}>
            {isSpaceFolder ? 'Space Settings' : ((!node.type || node.type === 'file') ? (getDisplayName(node.path) || node.name) : node.name)}
          </span>
        )}
      </button>

      {isDirectory && isExpanded && !isSpaceFolder && node.children === undefined && (
        <div
          style={{ fontSize: 12, color: 'var(--t-inkFaint)', fontStyle: 'italic', paddingTop: 2, paddingBottom: 2, paddingLeft: `${paddingLeft + 24}px` }}
        >
          loading…
        </div>
      )}

      {isDirectory &&
        isExpanded &&
        !isSpaceFolder &&
        node.children &&
        node.children.length > 0 && (
          <div className="flex flex-col">
            {node.children.map((child: FileNode) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                selectedFolderPath={selectedFolderPath}
                onFileSelect={onFileSelect}
                onTopicSelect={onTopicSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onLoadChildren={onLoadChildren}
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameChange={onRenameChange}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                dragOverFolder={dragOverFolder}
                onFolderDragEnter={onFolderDragEnter}
                onFolderDragLeave={onFolderDragLeave}
                onFolderDrop={onFolderDrop}
                getDisplayName={getDisplayName}
                promotedTopicPaths={promotedTopicPaths}
                onFolderSelect={onFolderSelect}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onSpaceSettingsSelect={onSpaceSettingsSelect}
              />
            ))}
          </div>
        )}

      {isDirectory && isExpanded && !isSpaceFolder && node.children?.length === 0 && (
        <div
          style={{ fontSize: 12, color: 'var(--t-inkFaint)', fontStyle: 'italic', paddingTop: 2, paddingBottom: 2, paddingLeft: `${paddingLeft + 24}px` }}
        >
          (empty)
        </div>
      )}
    </>
  );
}

export default function FileExplorer({
  spaceId,
  role,
  selectedFile,
  onFileSelect,
  onTopicSelect,
  onSpaceSettingsSelect,
  promotedTopicPaths,
  onPromoteTopic,
  onArchiveTopic,
  onPathDeleted,
  onPathRenamed,
}: FileExplorerProps) {
  const apiFetch = useAPI();
  const { files, loading, error, refresh, loadChildren } = useFileTree(spaceId);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const { showToast } = useToast();
  const { getEntry } = useFileMetadata();

  const getDisplayName = useCallback(
    (path: string) => getEntry(path)?.displayName,
    [getEntry],
  );

  // Modal states
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [fileName, setFileName] = useState("");
  const [newFileParentPath, setNewFileParentPath] = useState("");
  const [newFolderParentPath, setNewFolderParentPath] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Folder selection state — tracks which folder is "active" for new file/folder creation
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<"file" | "directory">(
    "file",
  );
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const folderDragCounter = useRef<Record<string, number>>({});

  const canWrite = hasPermission(role, 'files:write');
  const isViewer = !canWrite;
  const isOwner = hasPermission(role, 'space:manage');

  // Dismiss context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileNode) => {
      if (isViewer) return;
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.pageX, y: e.pageY, node });
    },
    [isViewer],
  );

  const startRename = useCallback((node: FileNode) => {
    setContextMenu(null);
    setRenamingPath(node.path);
    setRenamingType(node.type === "directory" ? "directory" : "file");
    setRenameValue(node.name);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingPath || !spaceId || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const parentPath = renamingPath.includes("/")
      ? renamingPath.substring(0, renamingPath.lastIndexOf("/"))
      : "";
    const newPath = parentPath
      ? `${parentPath}/${renameValue.trim()}`
      : renameValue.trim();

    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }

    try {
      const resourceType =
        renamingType === "directory" ? "directories" : "files";
      const response = await apiFetch(
        `/api/spaces/${spaceId}/${resourceType}/${renamingPath}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPath }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to rename");
      }

      showToast(`Renamed to "${renameValue.trim()}"`, "success", 3000);
      if (selectedFile === renamingPath) {
        onFileSelect(newPath);
      }
      refresh();
      await onPathRenamed(renamingPath, newPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename";
      showToast(message, "error", 4000);
    } finally {
      setRenamingPath(null);
    }
  }, [
    renamingPath,
    renamingType,
    renameValue,
    spaceId,
    apiFetch,
    showToast,
    selectedFile,
    onFileSelect,
    refresh,
    onPathRenamed,
  ]);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const startNewFileInFolder = useCallback((node: FileNode) => {
    setContextMenu(null);
    setNewFileParentPath(node.path);
    setFileName("");
    setExpandedFolders((prev) => new Set(prev).add(node.path));
    setShowFileModal(true);
  }, []);

  const startNewFolderInFolder = useCallback((node: FileNode) => {
    setContextMenu(null);
    setNewFolderParentPath(node.path);
    setFolderName("");
    setExpandedFolders((prev) => new Set(prev).add(node.path));
    setShowFolderModal(true);
  }, []);

  const startDelete = useCallback((node: FileNode) => {
    setContextMenu(null);
    setDeleteTarget(node);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !spaceId) return;

    setIsDeleting(true);
    try {
      const isDirectory = deleteTarget.type === "directory";
      const endpoint = isDirectory
        ? `/api/spaces/${spaceId}/directories/${deleteTarget.path}`
        : `/api/spaces/${spaceId}/files/${deleteTarget.path}`;

      const response = await apiFetch(endpoint, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete");
      }

      showToast(`Deleted "${deleteTarget.name}"`, "success", 3000);
      if (
        selectedFile === deleteTarget.path ||
        selectedFile?.startsWith(deleteTarget.path + "/")
      ) {
        onFileSelect(null);
      }
      refresh();
      await onPathDeleted(deleteTarget.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      showToast(message, "error", 4000);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [
    deleteTarget,
    spaceId,
    apiFetch,
    showToast,
    selectedFile,
    onFileSelect,
    refresh,
    onPathDeleted,
  ]);

  const handlePromoteTopic = useCallback(async (node: FileNode) => {
    setContextMenu(null);
    try {
      await onPromoteTopic(node.path, node.type === 'directory' ? 'directory' : 'file');
      showToast(`Promoted "${node.name}" to topic`, 'success', 3000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to promote topic', 'error', 4000);
    }
  }, [onPromoteTopic, showToast]);

  const handleArchiveTopic = useCallback(async (node: FileNode) => {
    setContextMenu(null);
    try {
      await onArchiveTopic(node.path);
      showToast(`Converted "${node.name}" back`, 'success', 3000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to convert topic back', 'error', 4000);
    }
  }, [onArchiveTopic, showToast]);

  useEffect(() => {
    const handleFileModified = (
      event: CustomEvent<{ path: string; action: string; triggeredBy: string }>,
    ) => {
      if (event.detail.action !== "modified") {
        const changedPath = event.detail.path || "";
        const slashIdx = changedPath.lastIndexOf("/");
        const parentDir = slashIdx > 0 ? changedPath.slice(0, slashIdx) : "";
        if (parentDir) {
          loadChildren(parentDir);
        } else {
          refresh();
        }
      }

      if (!event.detail?.path) return;

      // Only show toast notifications for agent-triggered changes
      if (event.detail.triggeredBy !== "agent") return;

      const filePath = event.detail.path;
      const fileName = filePath.split("/").pop() || filePath;

      const fileLink = (
        <span
          className="underline cursor-pointer hover:text-white/90"
          onClick={() => onFileSelect(filePath)}
        >
          {fileName}
        </span>
      );

      if (event.detail.action === "created") {
        showToast(<>{fileLink} created by Agent</>, "success", 3000);
      } else if (event.detail.action === "deleted") {
        showToast(<>{fileLink} deleted by Agent</>, "info", 3000);
      } else {
        showToast(<>{fileLink} updated by Agent</>, "info", 3000);
      }
    };

    window.addEventListener(
      "fileModified",
      handleFileModified as EventListener,
    );
    return () => {
      window.removeEventListener(
        "fileModified",
        handleFileModified as EventListener,
      );
    };
  }, [refresh, loadChildren, showToast, onFileSelect]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const uploadFiles = useCallback(async (fileList: FileList, targetFolder: string) => {
    if (!spaceId || isViewer) return;

    const uploads = Array.from(fileList).map(async (file) => {
      const isBinary = file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/") || file.type === "application/octet-stream";
      const filePath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
      let body: string;
      if (isBinary) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        body = JSON.stringify({ content: btoa(binary), encoding: "base64" });
      } else {
        body = JSON.stringify({ content: await file.text() });
      }
      const response = await apiFetch(`/api/spaces/${spaceId}/files/${filePath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to upload ${file.name}`);
      }
      return file.name;
    });

    try {
      const names = await Promise.all(uploads);
      const label = names.length === 1 ? `"${names[0]}"` : `${names.length} files`;
      showToast(`Uploaded ${label}`, "success", 3000);
      if (targetFolder) {
        setExpandedFolders((prev) => new Set(prev).add(targetFolder));
        loadChildren(targetFolder);
      } else {
        refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      showToast(message, "error", 4000);
    }
  }, [spaceId, isViewer, apiFetch, showToast, loadChildren, refresh]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (isViewer) return;
    const isInternalMove = e.dataTransfer.types.includes("ai-spaces/move");
    const isExternalUpload = e.dataTransfer.types.includes("Files");
    if (!isInternalMove && !isExternalUpload) return;
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  }, [isViewer]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isViewer) return;
    const isInternalMove = e.dataTransfer.types.includes("ai-spaces/move");
    const isExternalUpload = e.dataTransfer.types.includes("Files");
    if (!isInternalMove && !isExternalUpload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, [isViewer]);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleMoveItem = useCallback(async (source: { path: string; type: 'file' | 'directory' }, targetFolder: string) => {
    if (!spaceId) return;

    // Prevent dropping a folder into itself or its descendants
    if (source.type === 'directory' && (targetFolder === source.path || targetFolder.startsWith(source.path + '/'))) {
      showToast("Cannot move a folder into itself", "error", 3000);
      return;
    }

    // Prevent moving to the same location
    const sourceParent = source.path.includes('/') ? source.path.substring(0, source.path.lastIndexOf('/')) : '';
    if (sourceParent === targetFolder) {
      return; // Already in this folder, nothing to do
    }

    const newName = source.path.includes('/') ? source.path.substring(source.path.lastIndexOf('/') + 1) : source.path;
    const newPath = targetFolder ? `${targetFolder}/${newName}` : newName;

    if (newPath === source.path) return; // Same path, nothing to do

    try {
      const resourceType = source.type === 'directory' ? 'directories' : 'files';
      const response = await apiFetch(
        `/api/spaces/${spaceId}/${resourceType}/${source.path}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPath }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to move");
      }

      showToast(`Moved "${source.path.split('/').pop()}" to ${targetFolder || 'root'}`, "success", 3000);

      // Update selected file if it was moved
      if (selectedFile === source.path) {
        onFileSelect(newPath);
      }

      // Refresh both old and new parent directories
      if (sourceParent) loadChildren(sourceParent);
      if (targetFolder) loadChildren(targetFolder);
      if (!sourceParent || !targetFolder) refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move";
      showToast(message, "error", 4000);
    }
  }, [spaceId, showToast, apiFetch, selectedFile, onFileSelect, loadChildren, refresh]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    folderDragCounter.current = {};
    setIsDragOver(false);
    setDragOverFolder(null);
    if (isViewer) return;

    // Check for internal move first (move to root)
    const moveData = e.dataTransfer.getData("ai-spaces/move");
    if (moveData) {
      try {
        const source = JSON.parse(moveData) as { path: string; type: 'file' | 'directory' };
        await handleMoveItem(source, "");
        return;
      } catch {
        // Fall through to external upload
      }
    }

    if (!e.dataTransfer.files.length) return;
    await uploadFiles(e.dataTransfer.files, "");
  }, [isViewer, uploadFiles, handleMoveItem]);

  const handleFolderDragEnter = useCallback((path: string) => {
    folderDragCounter.current[path] = (folderDragCounter.current[path] ?? 0) + 1;
    setDragOverFolder(path);
  }, []);

  const handleFolderDragLeave = useCallback((path: string) => {
    folderDragCounter.current[path] = (folderDragCounter.current[path] ?? 1) - 1;
    if ((folderDragCounter.current[path] ?? 0) <= 0) {
      folderDragCounter.current[path] = 0;
      setDragOverFolder((prev) => (prev === path ? null : prev));
    }
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    folderDragCounter.current = {};
    setIsDragOver(false);
    setDragOverFolder(null);
    if (isViewer) return;

    // Check for internal move first
    const moveData = e.dataTransfer.getData("ai-spaces/move");
    if (moveData) {
      try {
        const source = JSON.parse(moveData) as { path: string; type: 'file' | 'directory' };
        await handleMoveItem(source, path);
        return;
      } catch {
        // Fall through to external upload
      }
    }

    if (!e.dataTransfer.files.length) return;
    await uploadFiles(e.dataTransfer.files, path);
  }, [isViewer, uploadFiles, handleMoveItem]);

  const handleDragStart = useCallback((e: React.DragEvent, node: FileNode) => {
    if (isViewer) return;
    const source = { path: node.path, type: node.type === 'directory' ? 'directory' as const : 'file' as const };
    e.dataTransfer.setData("ai-spaces/move", JSON.stringify(source));
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image semi-transparent
    (e.currentTarget as HTMLElement).style.opacity = "0.4";
  }, [isViewer]);

  const handleDragEnd = useCallback(() => {
    // Reset opacity on all tree nodes (browser handles this mostly, but be safe)
    document.querySelectorAll('[draggable]').forEach((el) => {
      (el as HTMLElement).style.opacity = "";
    });
  }, []);

  const handleCreateFolder = async () => {
    if (!folderName.trim() || !spaceId) {
      return;
    }

    setIsCreating(true);

    try {
      const fullPath = newFolderParentPath
        ? `${newFolderParentPath}/${folderName.trim()}`
        : folderName.trim();
      const response = await apiFetch(`/api/spaces/${spaceId}/directories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create folder");
      }

      showToast(`Folder "${folderName}" created`, "success", 3000);
      setShowFolderModal(false);
      setFolderName("");
      setNewFolderParentPath("");

      if (newFolderParentPath) {
        loadChildren(newFolderParentPath);
      } else {
        refresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create folder";
      showToast(message, "error", 4000);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFile = async () => {
    if (!fileName.trim() || !spaceId) {
      return;
    }

    setIsCreating(true);

    try {
      const filePath = newFileParentPath
        ? `${newFileParentPath}/${fileName.trim()}`
        : fileName.trim();
      const response = await apiFetch(
        `/api/spaces/${spaceId}/files/${filePath}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "" }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create file");
      }

      const displayName = fileName.trim();
      const fullFilePath = newFileParentPath
        ? `${newFileParentPath}/${displayName}`
        : displayName;
      showToast(`File "${displayName}" created`, "success", 3000);
      setShowFileModal(false);
      setFileName("");
      setNewFileParentPath("");

      if (newFileParentPath) {
        loadChildren(newFileParentPath);
      } else {
        refresh();
      }

      onFileSelect(fullFilePath);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create file";
      showToast(message, "error", 4000);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <aside className="w-full h-full flex flex-col" style={{ background: 'var(--t-bgAlt)' }}>
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin rounded-full w-6 h-6 border-2 border-t-transparent" style={{ borderColor: 'var(--t-accent)', borderTopColor: 'transparent' }}></div>
        </div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="w-full h-full flex flex-col" style={{ background: 'var(--t-bgAlt)' }}>
        <div className="p-4">
          <div style={{ background: 'rgba(194,65,12,0.08)', borderRadius: 8, padding: 12, color: 'var(--t-accent)', fontSize: 14 }}>
            {error}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside
        className="w-full h-full flex flex-col relative transition-colors"
        style={{ background: isDragOver ? 'rgba(194,65,12,0.03)' : 'var(--t-bgAlt)' }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="p-4 flex flex-col gap-1 flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onTopicSelect('/')} style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--t-inkDim)', textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 500, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                Files
              </button>
              {isViewer && (
                <span style={{ fontSize: 11, color: 'var(--t-inkDim)', fontStyle: 'italic' }}>
                  (view only)
                </span>
              )}
            </div>
            {!isViewer && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  style={{ color: 'var(--t-inkDim)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
                  onClick={() => { setNewFileParentPath(selectedFolderPath || ""); setShowFileModal(true); }}
                  title="Create new file"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" />
                    <path d="M9 2v4h4" />
                    <line x1="8" y1="9" x2="8" y2="13" />
                    <line x1="6" y1="11" x2="10" y2="11" />
                  </svg>
                </button>
                <button
                  type="button"
                  style={{ color: 'var(--t-inkDim)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
                  onClick={() => { setNewFolderParentPath(selectedFolderPath || ""); setShowFolderModal(true); }}
                  title="Create new folder"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" />
                    <line x1="8" y1="8" x2="8" y2="12" />
                    <line x1="6" y1="10" x2="10" y2="10" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {files.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--t-inkDim)', fontStyle: 'italic', paddingLeft: 8 }}>
              No files found
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {files
                .filter((node) => isOwner || node.name !== ".space")
                .map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  selectedFile={selectedFile}
                  selectedFolderPath={selectedFolderPath}
                  onFileSelect={onFileSelect}
                  onTopicSelect={onTopicSelect}
                  onSpaceSettingsSelect={onSpaceSettingsSelect}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  onLoadChildren={loadChildren}
                  onContextMenu={handleContextMenu}
                  renamingPath={renamingPath}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameCommit={commitRename}
                  onRenameCancel={cancelRename}
                  dragOverFolder={dragOverFolder}
                  onFolderDragEnter={handleFolderDragEnter}
                  onFolderDragLeave={handleFolderDragLeave}
                  onFolderDrop={handleFolderDrop}
                  getDisplayName={getDisplayName}
                  promotedTopicPaths={promotedTopicPaths}
                  onFolderSelect={(path) => setSelectedFolderPath(path)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}
        </div>

        {isDragOver && !isViewer && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="absolute inset-2 rounded-lg" style={{ border: '2px dashed rgba(194,65,12,0.4)', background: 'rgba(251,228,213,0.5)' }} />
            {!dragOverFolder && (
              <div className="relative flex flex-col items-center gap-1.5" style={{ color: 'var(--t-accent)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'Inter Tight', sans-serif" }}>Drop to upload</span>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-popover text-popover-foreground rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            boxShadow: "0 8px 24px rgba(25,28,30,0.06)",
          }}
        >
          {contextMenu.node.type === "directory" && contextMenu.node.name !== ".space" && (
            <>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-lowest/80 transition-colors text-left"
                onClick={() => startNewFileInFolder(contextMenu.node)}
              >
                <span className="material-symbols-outlined text-base">
                  note_add
                </span>
                New File
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-lowest/80 transition-colors text-left"
                onClick={() => startNewFolderInFolder(contextMenu.node)}
              >
                <span className="material-symbols-outlined text-base">
                  create_new_folder
                </span>
                New Folder
              </button>
            </>
          )}
          {isOwner && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-lowest/80 transition-colors text-left"
              onClick={() => promotedTopicPaths.has(contextMenu.node.path)
                ? void handleArchiveTopic(contextMenu.node)
                : void handlePromoteTopic(contextMenu.node)}
            >
              <span className="material-symbols-outlined text-base">forum</span>
              {promotedTopicPaths.has(contextMenu.node.path)
                ? `Convert Back to ${contextMenu.node.type === 'directory' ? 'Folder' : 'File'}`
                : 'Promote to Topic'}
            </button>
          )}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-lowest/80 transition-colors text-left"
            onClick={() => startRename(contextMenu.node)}
          >
            <span className="material-symbols-outlined text-base">
              drive_file_rename_outline
            </span>
            Rename
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/5 transition-colors text-left"
            onClick={() => startDelete(contextMenu.node)}
          >
            <span className="material-symbols-outlined text-base">delete</span>
            Delete
          </button>
        </div>
      )}

      {/* Create Folder Modal */}
      <Dialog open={showFolderModal} onOpenChange={(open) => {
        if (!open) {
          setShowFolderModal(false);
          setNewFolderParentPath("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create New Folder{newFolderParentPath ? ` in ${newFolderParentPath}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="Folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating) {
                  handleCreateFolder();
                }
              }}
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFolderModal(false);
                setFolderName("");
                setNewFolderParentPath("");
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!folderName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create File Modal */}
      <Dialog
        open={showFileModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowFileModal(false);
            setNewFileParentPath("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              New File{newFileParentPath ? ` in ${newFileParentPath}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="File name (e.g., notes.md)"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating) {
                  handleCreateFile();
                }
              }}
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFileModal(false);
                setFileName("");
                setNewFileParentPath("");
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFile}
              disabled={!fileName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.type === "directory" ? "Folder" : "File"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-on-surface-variant">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-on-surface">
              "{deleteTarget?.name}"
            </span>
            ?
            {deleteTarget?.type === "directory" && (
              <span className="block mt-1 text-error/80">
                This will delete the folder and all its contents.
              </span>
            )}
            This action cannot be undone.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
