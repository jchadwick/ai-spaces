import { useFileContent } from "../hooks/useFileContent";
import { writeSpaceFileHttp, renameSpaceFile } from "../api/spaceFiles";
import { useToast } from "./ui/toast";
import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import MDEditor from "@uiw/react-md-editor";
import "highlight.js/styles/github.css";

interface MarkdownEditorProps {
  spaceId?: string;
  filePath?: string;
  role?: "viewer" | "editor" | "admin";
  externalRefreshKey?: number;
  onFileModified?: () => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
}

function getFileIcon(type: string): string {
  switch (type) {
    case "markdown":
      return "description";
    case "text":
      return "article";
    case "image":
      return "image";
    case "binary":
      return "insert_drive_file";
    default:
      return "file_present";
  }
}

function getFileTypeLabel(type: string): string {
  switch (type) {
    case "markdown":
      return "Markdown";
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "binary":
      return "Binary";
    default:
      return "File";
  }
}

function getDraftKey(spaceId: string, filePath: string): string {
  return `ai-spaces:draft:${spaceId}:${filePath}`;
}

function saveDraft(spaceId: string, filePath: string, content: string): void {
  try {
    localStorage.setItem(
      getDraftKey(spaceId, filePath),
      JSON.stringify({
        content,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore localStorage errors (quota exceeded, etc.)
  }
}

function loadDraft(
  spaceId: string,
  filePath: string,
): { content: string; savedAt: string } | null {
  try {
    const data = localStorage.getItem(getDraftKey(spaceId, filePath));
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

function clearDraft(spaceId: string, filePath: string): void {
  try {
    localStorage.removeItem(getDraftKey(spaceId, filePath));
  } catch {
    // Ignore localStorage errors
  }
}

export default function MarkdownEditor({
  spaceId,
  filePath,
  role = "viewer",
  externalRefreshKey = 0,
  onFileModified,
  onFileRenamed,
}: MarkdownEditorProps) {
  const [fileVersion, setFileVersion] = useState(0);

  const { content, fileInfo, loading, error } = useFileContent(
    spaceId,
    filePath,
    { refreshKey: fileVersion + externalRefreshKey },
  );
  const { showToast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftData, setDraftData] = useState<{
    content: string;
    savedAt: string;
  } | null>(null);
  const [showConcurrentWarning, setShowConcurrentWarning] = useState(false);
  const [renamingFile, setRenamingFile] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editContentRef = useRef(editContent);

  useEffect(() => {
    editContentRef.current = editContent;
  }, [editContent]);

  const canEdit = role === "editor" || role === "admin";

  useEffect(() => {
    const handleFileModified = (
      event: CustomEvent<{ path: string; action: string; triggeredBy: string }>,
    ) => {
      if (
        editMode &&
        event.detail?.path === filePath &&
        event.detail?.triggeredBy === "agent"
      ) {
        const fileName = filePath.split("/").pop() || filePath;
        showToast(
          `${fileName} was modified by the AI while you were editing. Consider saving your changes or canceling to see the new version.`,
          "warning",
          5000,
        );
        setShowConcurrentWarning(true);
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
  }, [editMode, filePath, showToast]);

  useEffect(() => {
    setEditMode(false);
    setEditContent("");
    setSaveError(null);
    setShowDraftPrompt(false);
    setDraftData(null);
    setRenamingFile(false);
    setRenameValue("");
  }, [filePath]);

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
        if (autoSaveRef.current) {
          clearInterval(autoSaveRef.current);
        }
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
    if (filePath && spaceId) {
      clearDraft(spaceId, filePath);
    }
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
      const message = err instanceof Error ? err.message : "Unknown error";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [filePath, spaceId, editContent, onFileModified]);

  const handleCancel = useCallback(() => {
    const hasChanges = editContent !== content;
    if (hasChanges) {
      if (filePath && spaceId) {
        saveDraft(spaceId, filePath, editContent);
      }
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

    // Build new path: replace the last segment (filename) in filePath
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

  if (!spaceId || !filePath) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">draft</span>
          <p className="text-body-md">Select a file to preview</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
        <header className="flex-shrink-0 px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-surface-container animate-pulse"></div>
            <div className="flex flex-col gap-1">
              <div className="h-4 w-24 bg-surface-container animate-pulse rounded"></div>
              <div className="h-2 w-32 bg-surface-container animate-pulse rounded"></div>
            </div>
          </div>
        </header>
        <div className="flex-1 p-8">
          <div className="space-y-4">
            <div className="h-8 w-3/4 bg-surface-container animate-pulse rounded"></div>
            <div className="h-4 w-full bg-surface-container animate-pulse rounded"></div>
            <div className="h-4 w-5/6 bg-surface-container animate-pulse rounded"></div>
            <div className="h-4 w-2/3 bg-surface-container animate-pulse rounded"></div>
            <div className="h-32 w-full bg-surface-container animate-pulse rounded"></div>
            <div className="h-4 w-4/5 bg-surface-container animate-pulse rounded"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center p-8">
        <div className="bg-error-container/10 rounded-xl p-lg ">
          <div className="flex items-center gap-sm text-error">
            <span className="material-symbols-outlined">error</span>
            <span className="text-body-md font-medium">
              Failed to load file
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-xs">{error}</p>
        </div>
      </section>
    );
  }

  if (!fileInfo) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">
            folder_open
          </span>
          <p className="text-body-md">File not found</p>
        </div>
      </section>
    );
  }

  if (showDraftPrompt && draftData) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center p-8">
        <div className="bg-surface-container rounded-xl p-lg  shadow-lg">
          <div className="flex items-center gap-sm text-on-surface">
            <span className="material-symbols-outlined">draft</span>
            <span className="text-body-md font-medium">
              Unsaved changes found
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-sm">
            You have unsaved changes from{" "}
            {formatRelativeTime(draftData.savedAt)}. Would you like to restore
            them?
          </p>
          <div className="flex gap-sm mt-md">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="flex-1 bg-primary text-on-primary py-2 px-4 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="flex-1 bg-surface-container-high text-on-surface py-2 px-4 rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (fileInfo.type === "image" && content) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
        <header className="flex-shrink-0 px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">
                {getFileIcon(fileInfo.type)}
              </span>
              <div className="flex flex-col">
                <h2 className="text-title-sm font-medium text-on-surface">
                  {fileInfo.name}
                </h2>
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                  {getFileTypeLabel(fileInfo.type)}
                  {fileInfo.modifiedAt &&
                    ` • Modified ${formatRelativeTime(fileInfo.modifiedAt)}`}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex items-center justify-center">
          <img
            src={content}
            alt={fileInfo.name}
            className="max-w-full h-auto rounded-lg shadow-ambient"
          />
        </div>
      </section>
    );
  }

  if (fileInfo.type === "binary") {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
        <header className="flex-shrink-0 px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">
                {getFileIcon(fileInfo.type)}
              </span>
              <div className="flex flex-col">
                <h2 className="text-title-sm font-medium text-on-surface">
                  {fileInfo.name}
                </h2>
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                  {getFileTypeLabel(fileInfo.type)}
                  {fileInfo.modifiedAt &&
                    ` • Modified ${formatRelativeTime(fileInfo.modifiedAt)}`}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl">
              hide_source
            </span>
            <p className="text-body-md">Cannot preview binary file</p>
            <p className="text-body-sm text-on-surface-variant/70">
              This file type cannot be displayed in the editor.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const isMarkdown = fileInfo.type === "markdown";
  const isText = fileInfo.type === "text" || fileInfo.type === "unknown";

  if (editMode && (isMarkdown || isText)) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
        {showConcurrentWarning && (
          <div className="bg-warning-container border-b border-warning text-on-warning-container px-4 py-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span className="text-sm font-medium">
              This file was modified by the AI while you were editing. Save your
              changes or cancel to see the new version.
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
        <header className="flex-shrink-0 px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">
                {getFileIcon(fileInfo.type)}
              </span>
              <div className="flex flex-col">
                <h2 className="text-title-sm font-medium text-on-surface">
                  {fileInfo.name}
                </h2>
                <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Editing
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-error text-sm">{saveError}</span>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">
                      save
                    </span>
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {isMarkdown ? (
            <div className="h-full flex">
              <div className="flex-1 flex flex-col border-r border-outline-variant/20">
                <div className="px-4 py-2 bg-surface-container text-xs text-on-surface-variant uppercase tracking-wider font-medium border-b border-outline-variant/20">
                  Edit
                </div>
                <div className="flex-1 overflow-hidden">
                  <MDEditor
                    value={editContent}
                    onChange={(val) => setEditContent(val || "")}
                    preview="edit"
                    height={500}
                    visibleDragbar={false}
                    hideToolbar={true}
                  />
                </div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-surface-container text-xs text-on-surface-variant uppercase tracking-wider font-medium border-b border-outline-variant/20">
                  Preview
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <article className="prose prose-slate max-w-none prose-img:rounded-lg prose-headings:font-display prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-on-surface prose-a:text-primary prose-code:font-mono prose-code:bg-surface-container prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-container-low prose-pre:font-mono p-8">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight, rehypeRaw]}
                      components={{
                        img: ({ ...props }) => (
                          <img
                            {...props}
                            className="max-w-full h-auto rounded-lg shadow-ambient"
                            loading="lazy"
                            alt={props.alt || ""}
                          />
                        ),
                      }}
                    >
                      {editContent}
                    </ReactMarkdown>
                  </article>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full p-4">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full font-mono text-sm text-on-surface bg-surface-container-low border border-outline-variant/20 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
      <header className="flex-shrink-0 px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl">
              {getFileIcon(fileInfo.type)}
            </span>
            <div className="flex flex-col">
              {renamingFile ? (
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitRename();
                    if (e.key === "Escape") handleCancelRename();
                  }}
                  onBlur={handleCancelRename}
                  className="text-title-sm font-medium text-on-surface bg-transparent border-b border-primary outline-none w-48"
                />
              ) : (
                <h2
                  className={`text-title-sm font-medium text-on-surface ${canEdit ? "cursor-pointer hover:underline" : ""}`}
                  onClick={canEdit ? handleStartRename : undefined}
                >
                  {fileInfo.name}
                </h2>
              )}
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                {getFileTypeLabel(fileInfo.type)}
                {fileInfo.modifiedAt &&
                  ` • Modified ${formatRelativeTime(fileInfo.modifiedAt)}`}
              </span>
            </div>
          </div>

          {canEdit && (isMarkdown || isText) && content !== null && (
            <button
              type="button"
              onClick={handleEnterEditMode}
              className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              Edit
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <ContentRenderer fileInfo={fileInfo} content={content} />
      </div>
    </section>
  );
}

interface ContentRendererProps {
  fileInfo: NonNullable<ReturnType<typeof useFileContent>["fileInfo"]>;
  content: string | null;
}

function ContentRenderer({ fileInfo, content }: ContentRendererProps) {
  if (content === null) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">
            description
          </span>
          <p className="text-body-md">Empty file</p>
        </div>
      </div>
    );
  }

  const markdownClasses =
    "prose prose-slate max-w-none prose-img:rounded-lg prose-headings:font-display prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-on-surface prose-a:text-primary prose-code:font-mono prose-code:bg-surface-container prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-container-low prose-pre:font-mono";

  if (fileInfo.type === "markdown") {
    return (
      <div className="p-4 grow flex">
        <article className={markdownClasses}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight, rehypeRaw]}
            components={{
              img: ({ ...props }) => (
                <img
                  {...props}
                  className="max-w-full h-auto rounded-lg shadow-ambient"
                  loading="lazy"
                  alt={props.alt || ""}
                />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    );
  }

  return (
    <div className="p-8">
      <pre className="font-mono text-body-sm text-on-surface bg-surface-container-low p-lg rounded-lg overflow-x-auto whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  );
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
