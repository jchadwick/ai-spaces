import type { FileNode } from "@ai-spaces/shared";
import type { DragEvent, MouseEvent } from "react";
import { getFileNodeIcon } from "../lib/fileIcons";
import { cn } from "../lib/utils";

interface FileTreeNodeProps {
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
  onContextMenu: (e: MouseEvent, node: FileNode) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  dragOverFolder: string | null;
  onFolderDragEnter: (path: string) => void;
  onFolderDragLeave: (path: string) => void;
  onFolderDrop: (e: DragEvent, path: string) => void;
  getDisplayName: (path: string) => string | undefined;
  promotedTopicPaths: ReadonlySet<string>;
  onFolderSelect: (path: string) => void;
  onDragStart: (e: DragEvent, node: FileNode) => void;
  onDragEnd: () => void;
}

export default function FileTreeNode({
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
}: FileTreeNodeProps) {
  const isDirectory = node.type === "directory";
  const isSelected = selectedFile === node.path || selectedFolderPath === node.path;
  const isExpanded = expandedFolders.has(node.path);
  const isHidden = node.name.startsWith(".");
  const isSpaceFolder = node.name === ".space";
  const isRenaming = renamingPath === node.path;
  const isDragTarget = isDirectory && dragOverFolder === node.path;
  const isTopic = promotedTopicPaths.has(node.path);
  const paddingLeft = 8 + depth * 16;
  const icon = getFileNodeIcon(node.name, node.type);

  const handleClick = () => {
    if (isRenaming) return;
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
      const parentPath = node.path.includes("/")
        ? node.path.substring(0, node.path.lastIndexOf("/"))
        : "";
      onFolderSelect(parentPath || "");
    }
    if (!isSpaceFolder && isTopic) onTopicSelect(node.path);
  };

  const iconClass = cn(
    "material-symbols-outlined text-base",
    isSelected ? "text-t-accent" : "text-t-ink-dim",
  );

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
        className={cn(
          "flex w-full cursor-pointer items-center gap-1 border-l-2 pr-2 py-[5px] text-left font-sans text-sm transition-[background] duration-100",
          isSelected
            ? "rounded-none border-l-t-accent bg-t-accent-soft text-t-accent-ink"
            : "rounded border-l-transparent text-t-ink-mid hover:bg-[rgba(26,23,20,0.04)]",
          isDragTarget &&
            "border-l-transparent bg-[color-mix(in_srgb,var(--t-accent)_8%,transparent)] text-t-accent outline outline-1 outline-[color-mix(in_srgb,var(--t-accent)_30%,transparent)]",
          isHidden && !isSpaceFolder && "italic opacity-70",
        )}
        style={{ paddingLeft }}
      >
        {isDirectory && !isSpaceFolder && (
          <span className={iconClass}>{isExpanded ? "folder_open" : "folder"}</span>
        )}
        {isSpaceFolder && <span className={iconClass}>settings</span>}
        {isTopic && (
          <span className="material-symbols-outlined text-sm text-t-agent" title="Topic">
            forum
          </span>
        )}
        {!isDirectory && <span className={iconClass}>{icon}</span>}
        {isRenaming ? (
          <input
            className="flex-1 rounded border border-t-hair bg-t-bg-raised px-1 py-0 font-sans text-sm text-t-ink outline-none"
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
          <span
            className={cn(
              isTopic && isDirectory
                ? "font-semibold text-primary"
                : isSelected
                  ? "font-semibold"
                  : "font-normal",
              isSpaceFolder && "text-t-ink-mid",
            )}
          >
            {isSpaceFolder
              ? "Space Settings"
              : !node.type || node.type === "file"
                ? getDisplayName(node.path) || node.name
                : node.name}
          </span>
        )}
      </button>

      {isDirectory && isExpanded && !isSpaceFolder && node.children === undefined && (
        <div
          className="py-0.5 text-xs italic text-t-ink-faint"
          style={{ paddingLeft: paddingLeft + 24 }}
        >
          loading…
        </div>
      )}

      {isDirectory && isExpanded && !isSpaceFolder && node.children && node.children.length > 0 && (
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
          className="py-0.5 text-xs italic text-t-ink-faint"
          style={{ paddingLeft: paddingLeft + 24 }}
        >
          (empty)
        </div>
      )}
    </>
  );
}
