import type { SpaceRole } from "@ai-spaces/shared";
import { hasPermission } from "@ai-spaces/shared";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { renameSpaceFile, writeSpaceFileHttp } from "../api/spaceFiles";
import { useConnectionStatus } from "../contexts/ConnectionStatusContext";
import { useFileMetadata } from "../contexts/FileMetadataContext";
import { useFileContent } from "../hooks/useFileContent";
import { getContentTypeIcon } from "../lib/fileIcons";
import { getFileTypeHandler } from "./editors/registry";
import { FilePropertiesPanel } from "./FilePropertiesPanel";
import { useToast } from "./ui/use-toast";

interface FileEditorProps {
  spaceId?: string;
  filePath?: string;
  role?: SpaceRole;
  externalRefreshKey?: number;
  onFileModified?: () => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
}

function getDraftKey(spaceId: string, filePath: string) {
  return `ai-spaces:draft:${spaceId}:${filePath}`;
}

function saveDraft(spaceId: string, filePath: string, content: string) {
  try {
    localStorage.setItem(
      getDraftKey(spaceId, filePath),
      JSON.stringify({ content, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* quota exceeded */
  }
}

function loadDraft(spaceId: string, filePath: string): { content: string; savedAt: string } | null {
  try {
    const data = localStorage.getItem(getDraftKey(spaceId, filePath));
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function clearDraft(spaceId: string, filePath: string) {
  try {
    localStorage.removeItem(getDraftKey(spaceId, filePath));
  } catch {
    /* ignore */
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FileEditor({
  spaceId,
  filePath,
  role = "viewer",
  externalRefreshKey = 0,
  onFileModified,
  onFileRenamed,
}: FileEditorProps) {
  const { status: wsStatus } = useConnectionStatus();
  const isWsDisconnected = wsStatus !== "connected" && wsStatus !== "connecting";

  const [fileVersion, setFileVersion] = useState(0);
  const { content, fileInfo, loading, error } = useFileContent(spaceId, filePath, {
    refreshKey: fileVersion + externalRefreshKey,
  });
  const { showToast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftData, setDraftData] = useState<{ content: string; savedAt: string } | null>(null);
  const [showConcurrentWarning, setShowConcurrentWarning] = useState(false);
  const [renamingFile, setRenamingFile] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showProperties, setShowProperties] = useState(false);

  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editContentRef = useRef(editContent);

  useEffect(() => {
    editContentRef.current = editContent;
  }, [editContent]);

  const canEdit = hasPermission(role, "files:write");

  const { getEntry } = useFileMetadata();
  const meta = filePath ? (getEntry(filePath) ?? {}) : {};
  const displayName = meta.displayName || fileInfo?.name || "";

  useEffect(() => {
    const handleFileModified = (
      event: CustomEvent<{ path: string; action: string; triggeredBy: string }>,
    ) => {
      if (editMode && event.detail?.path === filePath && event.detail?.triggeredBy === "agent") {
        const fileName = filePath!.split("/").pop() || filePath!;
        showToast(
          `${fileName} was modified by the AI while you were editing. Consider saving your changes or canceling to see the new version.`,
          "warning",
          5000,
        );
        setShowConcurrentWarning(true);
      }
    };
    window.addEventListener("fileModified", handleFileModified as EventListener);
    return () => window.removeEventListener("fileModified", handleFileModified as EventListener);
  }, [editMode, filePath, showToast]);

  useEffect(() => {
    setEditMode(false);
    setEditContent("");
    setSaveError(null);
    setShowDraftPrompt(false);
    setDraftData(null);
    setRenamingFile(false);
    setRenameValue("");
    setShowProperties(false);
  }, []);

  useEffect(() => {
    if (filePath && spaceId && content !== null && !editMode) {
      const draft = loadDraft(spaceId, filePath);
      if (draft) {
        setDraftData(draft);
        setShowDraftPrompt(true);
      }
    }
  }, [filePath, spaceId, content, editMode]);

  useEffect(() => {
    if (editMode && filePath && spaceId) {
      autoSaveRef.current = setInterval(() => {
        saveDraft(spaceId!, filePath!, editContentRef.current);
      }, 30000);
      return () => {
        if (autoSaveRef.current) clearInterval(autoSaveRef.current);
      };
    }
  }, [editMode, filePath, spaceId]);

  const handleEnterEditMode = useCallback(() => {
    if (content !== null) {
      setEditContent(content);
      setEditMode(true);
      setSaveError(null);
    }
  }, [content]);

  const handleRestoreDraft = useCallback(() => {
    if (draftData) {
      setEditContent(draftData.content);
      setEditMode(true);
      setShowDraftPrompt(false);
      setDraftData(null);
    }
  }, [draftData]);

  const handleDiscardDraft = useCallback(() => {
    if (filePath && spaceId) clearDraft(spaceId, filePath);
    setShowDraftPrompt(false);
    setDraftData(null);
  }, [filePath, spaceId]);

  const handleSave = useCallback(async () => {
    if (!filePath || !spaceId) {
      setSaveError("Cannot save: missing file or space");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await writeSpaceFileHttp(spaceId, filePath, editContent);
      if (result.success) {
        clearDraft(spaceId, filePath);
        setEditMode(false);
        setFileVersion((v) => v + 1);
        onFileModified?.();
      } else {
        throw new Error(result.error || "Failed to save");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  }, [filePath, spaceId, editContent, onFileModified]);

  const handleCancel = useCallback(() => {
    if (editContent !== content && filePath && spaceId) {
      saveDraft(spaceId, filePath, editContent);
    }
    setEditMode(false);
    setSaveError(null);
  }, [editContent, content, filePath, spaceId]);

  const handleStartRename = useCallback(() => {
    if (!fileInfo) return;
    setRenameValue(fileInfo.name);
    setRenamingFile(true);
  }, [fileInfo]);

  const handleCancelRename = useCallback(() => {
    setRenamingFile(false);
    setRenameValue("");
  }, []);

  const handleCommitRename = useCallback(async () => {
    if (!filePath || !spaceId || !fileInfo) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === fileInfo.name) {
      handleCancelRename();
      return;
    }
    const parts = filePath.split("/");
    parts[parts.length - 1] = trimmed;
    const newPath = parts.join("/");
    const result = await renameSpaceFile(spaceId, filePath, newPath);
    if (result.success) {
      setRenamingFile(false);
      setRenameValue("");
      showToast(`Renamed to ${trimmed}`, "success");
      onFileRenamed?.(filePath, result.path ?? newPath);
    } else {
      showToast(result.error ?? "Failed to rename file", "error");
      handleCancelRename();
    }
  }, [filePath, spaceId, fileInfo, renameValue, handleCancelRename, showToast, onFileRenamed]);

  // ── Empty / loading / error states ──────────────────────────────────────────

  if (!spaceId || !filePath) {
    return (
      <section className="flex-1 flex flex-col bg-t-bg-raised items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-t-ink-dim">
          <span className="material-symbols-outlined text-4xl">draft</span>
          <p className="text-body-md">Select a file to preview</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex-1 flex flex-col bg-t-bg-raised overflow-hidden">
        <header className="flex-shrink-0 px-6 py-4 bg-t-bg-raised border-b border-t-hair/20">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-t-bg-well animate-pulse"></div>
            <div className="flex flex-col gap-1">
              <div className="h-4 w-24 bg-t-bg-well animate-pulse rounded"></div>
              <div className="h-2 w-32 bg-t-bg-well animate-pulse rounded"></div>
            </div>
          </div>
        </header>
        <div className="flex-1 p-8">
          <div className="space-y-4">
            <div className="h-8 w-3/4 bg-t-bg-well animate-pulse rounded"></div>
            <div className="h-4 w-full bg-t-bg-well animate-pulse rounded"></div>
            <div className="h-4 w-5/6 bg-t-bg-well animate-pulse rounded"></div>
            <div className="h-4 w-2/3 bg-t-bg-well animate-pulse rounded"></div>
            <div className="h-32 w-full bg-t-bg-well animate-pulse rounded"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex-1 flex flex-col bg-t-bg-raised items-center justify-center p-8">
        <div className="bg-destructive/10 rounded-xl p-lg">
          <div className="flex items-center gap-sm text-destructive">
            <span className="material-symbols-outlined">error</span>
            <span className="text-body-md font-medium">Failed to load file</span>
          </div>
          <p className="text-body-sm text-t-ink-dim mt-xs">{error}</p>
        </div>
      </section>
    );
  }

  if (!fileInfo) {
    return (
      <section className="flex-1 flex flex-col bg-t-bg-raised items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-t-ink-dim">
          <span className="material-symbols-outlined text-4xl">folder_open</span>
          <p className="text-body-md">File not found</p>
        </div>
      </section>
    );
  }

  if (showDraftPrompt && draftData) {
    return (
      <section className="flex-1 flex flex-col bg-t-bg-raised items-center justify-center p-8">
        <div className="bg-t-bg-well rounded-xl p-lg shadow-lg">
          <div className="flex items-center gap-sm text-t-ink">
            <span className="material-symbols-outlined">draft</span>
            <span className="text-body-md font-medium">Unsaved changes found</span>
          </div>
          <p className="text-body-sm text-t-ink-dim mt-sm">
            You have unsaved changes from {formatRelativeTime(draftData.savedAt)}. Would you like to
            restore them?
          </p>
          <div className="flex gap-sm mt-md">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="flex-1 bg-primary text-primary-foreground py-2 px-4 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="flex-1 bg-t-bg-well text-t-ink py-2 px-4 rounded-lg text-sm font-medium hover:bg-t-bg-alt transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Resolve handler from registry ────────────────────────────────────────────

  const handler = getFileTypeHandler(fileInfo.type);
  const Viewer = handler?.viewer;
  const Editor = handler?.editor;
  const canEditThisFile = canEdit && !!Editor && content !== null;

  // ── Edit mode ────────────────────────────────────────────────────────────────

  if (editMode && Editor) {
    return (
      <section className="flex-1 flex flex-col bg-t-bg-raised overflow-hidden">
        {isWsDisconnected && (
          <div className="flex items-center gap-1.5 border-b border-t-hair bg-transparent px-4 py-[5px]">
            <span className="inline-block size-1.5 shrink-0 rounded-full bg-t-ink-dim" />
            <span className="font-mono text-[11.5px] tracking-[0.3px] text-t-ink-dim">
              AI connection lost — edits will save but AI cannot see changes until reconnected
            </span>
          </div>
        )}
        {showConcurrentWarning && (
          <div className="bg-warning-container border-b border-warning text-on-warning-container px-4 py-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span className="text-sm font-medium">
              This file was modified by the AI while you were editing. Save your changes or cancel
              to see the new version.
            </span>
            <button
              type="button"
              onClick={() => setShowConcurrentWarning(false)}
              className="ml-auto text-on-warning-container hover:opacity-75"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}
        <header className="flex-shrink-0 px-6 py-4 bg-t-bg-raised border-b border-t-hair/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-t-ink text-xl">
                {getContentTypeIcon(fileInfo.type)}
              </span>
              <div className="flex flex-col">
                <h2 className="text-title-sm font-medium text-t-ink">
                  {displayName || fileInfo.name}
                </h2>
                <span className="text-label-sm text-t-ink-dim uppercase tracking-wider">
                  Editing
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveError && <span className="text-destructive text-sm">{saveError}</span>}
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 bg-t-bg-well text-t-ink rounded-lg text-sm font-medium hover:bg-t-bg-alt transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">save</span>Save
                  </>
                )}
              </button>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex-1 animate-pulse bg-t-bg-well" />}>
            <Editor content={editContent} onChange={setEditContent} />
          </Suspense>
        </div>
      </section>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────────

  return (
    <section className="flex-1 flex flex-col bg-t-bg-raised overflow-hidden">
      {isWsDisconnected && (
        <div className="flex items-center gap-1.5 border-b border-t-hair bg-transparent px-4 py-[5px]">
          <span className="inline-block size-1.5 shrink-0 rounded-full bg-t-ink-dim" />
          <span className="font-mono text-[11.5px] tracking-[0.3px] text-t-ink-dim">
            AI connection lost — edits will save but AI cannot see changes until reconnected
          </span>
        </div>
      )}
      <header className="flex-shrink-0 px-6 py-4 bg-t-bg-raised border-b border-t-hair/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-t-ink text-xl">
              {getContentTypeIcon(fileInfo.type)}
            </span>
            <div className="flex flex-col">
              {renamingFile ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitRename();
                    if (e.key === "Escape") handleCancelRename();
                  }}
                  onBlur={handleCancelRename}
                  className="text-title-sm font-medium text-t-ink bg-transparent border-b border-primary outline-none w-48"
                />
              ) : (
                <h2
                  className={`text-title-sm font-medium text-t-ink ${canEdit ? "cursor-pointer hover:underline" : ""}`}
                  onClick={canEdit ? handleStartRename : undefined}
                >
                  {displayName}
                </h2>
              )}
              <span className="text-label-sm text-t-ink-dim font-mono tracking-tight">
                {filePath}
              </span>
              {meta.summary && (
                <span className="mt-0.5 block text-xs text-t-ink-mid">{meta.summary}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowProperties((v) => !v)}
                title="File properties"
                className="cursor-pointer rounded border-0 bg-transparent px-1.5 py-1 text-t-ink-dim hover:bg-t-bg-well"
              >
                <span className="material-symbols-outlined text-lg">tune</span>
              </button>
            )}
            {canEditThisFile && (
              <button
                type="button"
                onClick={handleEnterEditMode}
                className="px-4 py-2 bg-t-bg-well text-t-ink rounded-lg text-sm font-medium hover:bg-t-bg-alt transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                Edit
              </button>
            )}
          </div>
        </div>
      </header>
      {showProperties && spaceId && filePath && (
        <FilePropertiesPanel
          spaceId={spaceId}
          filePath={filePath}
          fileInfo={fileInfo}
          onClose={() => setShowProperties(false)}
        />
      )}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <Suspense fallback={<div className="flex-1 animate-pulse bg-t-bg-well" />}>
          {Viewer ? (
            <Viewer content={content} fileInfo={fileInfo} />
          ) : (
            <div className="flex items-center justify-center p-8 text-t-ink-dim">
              <p className="text-body-md">No viewer available for this file type.</p>
            </div>
          )}
        </Suspense>
      </div>
    </section>
  );
}
