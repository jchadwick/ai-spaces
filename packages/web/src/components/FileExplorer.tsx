import { useState, useEffect, useRef, useCallback } from "react";
import { useFileTree } from "../hooks/useFileTree";
import { useToast } from "./ui/toast";
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
  onFileSelect,
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
}: {
  node: FileNode;
  depth?: number;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
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
}) {
  const isDirectory = node.type === "directory";
  const isSelected = selectedFile === node.path;
  const isExpanded = expandedFolders.has(node.path);
  const isHidden = node.name.startsWith(".");
  const isSpaceFolder = node.name === ".space";
  const isRenaming = renamingPath === node.path;
  const isDragTarget = isDirectory && dragOverFolder === node.path;

  const paddingLeft = 8 + depth * 16;

  const handleClick = () => {
    if (isRenaming) return;
    if (isDirectory) {
      const expanding = !expandedFolders.has(node.path);
      toggleFolder(node.path);
      if (expanding && node.children === undefined) {
        onLoadChildren(node.path);
      }
    } else {
      onFileSelect(node.path);
    }
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
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        onDragOver={isDirectory ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } : undefined}
        onDragEnter={isDirectory ? () => onFolderDragEnter(node.path) : undefined}
        onDragLeave={isDirectory ? () => onFolderDragLeave(node.path) : undefined}
        onDrop={isDirectory ? (e) => onFolderDrop(e, node.path) : undefined}
        style={nodeStyle}
        onMouseEnter={(e) => { if (!isSelected && !isDragTarget) (e.currentTarget as HTMLElement).style.background = 'rgba(26,23,20,0.04)'; }}
        onMouseLeave={(e) => { if (!isSelected && !isDragTarget) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {isDirectory && (
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSelected ? 'var(--t-accent)' : 'var(--t-inkDim)' }}>
            {isExpanded ? "folder_open" : "folder"}
          </span>
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
          <span style={{ fontWeight: isSelected ? 600 : 400, color: isSpaceFolder ? 'var(--t-inkDim)' : undefined }}>
            {(!node.type || node.type === 'file') ? (getDisplayName(node.path) || node.name) : node.name}
          </span>
        )}
      </button>

      {isDirectory && isExpanded && node.children === undefined && (
        <div
          style={{ fontSize: 12, color: 'var(--t-inkFaint)', fontStyle: 'italic', paddingTop: 2, paddingBottom: 2, paddingLeft: `${paddingLeft + 24}px` }}
        >
          loading…
        </div>
      )}

      {isDirectory &&
        isExpanded &&
        node.children &&
        node.children.length > 0 && (
          <div className="flex flex-col">
            {node.children.map((child: FileNode) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
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
              />
            ))}
          </div>
        )}

      {isDirectory && isExpanded && node.children?.length === 0 && (
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
  const [isCreating, setIsCreating] = useState(false);

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
  ]);

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

      const fileName = event.detail.path.split("/").pop() || event.detail.path;
      const triggeredBy =
        event.detail.triggeredBy === "agent" ? "Agent" : "User";

      if (event.detail.action === "created") {
        showToast(`${fileName} created by ${triggeredBy}`, "success", 3000);
      } else if (event.detail.action === "deleted") {
        showToast(`${fileName} deleted by ${triggeredBy}`, "info", 3000);
      } else {
        showToast(`${fileName} updated by ${triggeredBy}`, "info", 3000);
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
  }, [refresh, loadChildren, showToast]);

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
    if (isViewer || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  }, [isViewer]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isViewer || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, [isViewer]);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    folderDragCounter.current = {};
    setIsDragOver(false);
    setDragOverFolder(null);
    if (isViewer || !e.dataTransfer.files.length) return;
    await uploadFiles(e.dataTransfer.files, "");
  }, [isViewer, uploadFiles]);

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
    if (isViewer || !e.dataTransfer.files.length) return;
    await uploadFiles(e.dataTransfer.files, path);
  }, [isViewer, uploadFiles]);

  const handleCreateFolder = async () => {
    if (!folderName.trim() || !spaceId) {
      return;
    }

    setIsCreating(true);

    try {
      const response = await apiFetch(`/api/spaces/${spaceId}/directories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folderName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create folder");
      }

      showToast(`Folder "${folderName}" created`, "success", 3000);
      setShowFolderModal(false);
      setFolderName("");
      refresh();
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
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--t-inkDim)', textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 500 }}>
                Files
              </span>
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
                  onClick={() => setShowFileModal(true)}
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
                  onClick={() => setShowFolderModal(true)}
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
              {files.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  selectedFile={selectedFile}
                  onFileSelect={onFileSelect}
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
          {contextMenu.node.type === "directory" && (
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
      <Dialog open={showFolderModal} onOpenChange={setShowFolderModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
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
