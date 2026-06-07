import { Check, Edit3 } from "lucide-react";
import { type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { writeSpaceFileHttp } from "@/api/spaceFiles";
import { useFileContent } from "@/hooks/useFileContent";
import { getFileTypeHandler } from "./editors/registry";

interface RoomsContentPaneProps {
  spaceId: string;
  filePath: string | null;
  canEdit: boolean;
  onSaved: () => void;
  headerContent?: ReactNode;
  externalRefreshKey?: number;
}

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function RoomsButton({
  children,
  icon,
  onClick,
  variant = "outline",
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
}) {
  const palette: Record<NonNullable<typeof variant>, string> = {
    primary: "border-rooms-ink bg-rooms-ink text-rooms-paper",
    outline: "border-rooms-line-strong bg-rooms-paper text-rooms-ink",
    ghost: "border-transparent bg-transparent text-rooms-ink-soft",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border-[1.5px] px-3 py-1.5 text-sm font-medium leading-[1.1] disabled:cursor-default disabled:opacity-45 ${palette[variant]}`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function PaneState({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={`grid min-h-45 place-items-center p-7 text-center text-sm ${
        tone === "error" ? "text-rooms-error" : "text-rooms-muted"
      }`}
    >
      {children}
    </div>
  );
}

export default function RoomsContentPane({
  spaceId,
  filePath,
  canEdit,
  onSaved,
  headerContent,
  externalRefreshKey = 0,
}: RoomsContentPaneProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const refreshKey = localRefresh + externalRefreshKey;
  const { content, fileInfo, loading, error } = useFileContent(spaceId, filePath ?? undefined, {
    refreshKey,
  });
  const handler = useMemo(
    () => (fileInfo ? getFileTypeHandler(fileInfo.type) : undefined),
    [fileInfo],
  );
  const Viewer = handler?.viewer;
  const Editor = handler?.editor;
  const showEdit = Boolean(canEdit && Editor && content !== null);

  useEffect(() => {
    setEditing(false);
    setDraft("");
    setSaveError(null);
    setSaving(false);
  }, []);

  async function save() {
    if (!filePath || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const result = await writeSpaceFileHttp(spaceId, filePath, draft);
      if (!result.success) {
        setSaveError(result.error ?? "Failed to save file.");
        return;
      }

      setEditing(false);
      setLocalRefresh((current) => current + 1);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save file.");
    } finally {
      setSaving(false);
    }
  }

  if (!filePath) {
    return (
      <div className="grid flex-1 place-items-center bg-rooms-paper text-rooms-muted">
        <span className="text-sm">No file selected.</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-rooms-paper">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rooms-line px-7 h-12">
        {headerContent ?? (
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="truncate text-sm font-semibold">
              {fileInfo?.name ?? basename(filePath)}
            </span>
            <span className="whitespace-nowrap text-xs text-rooms-muted-2">
              {editing ? "Editing..." : (fileInfo?.modifiedAt ?? "")}
            </span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {editing && (
            <>
              <RoomsButton
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                }}
              >
                Cancel
              </RoomsButton>
              <RoomsButton
                variant="primary"
                icon={<Check size={16} />}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving..." : "Save"}
              </RoomsButton>
            </>
          )}
          {!editing && showEdit && (
            <RoomsButton
              variant="outline"
              icon={<Edit3 size={16} />}
              onClick={() => {
                setDraft(content ?? "");
                setSaveError(null);
                setEditing(true);
              }}
            >
              Edit
            </RoomsButton>
          )}
        </div>
      </div>

      {saveError && (
        <div className="shrink-0 border-b border-rooms-error-line bg-rooms-error-soft px-7 py-2 text-[13px] text-rooms-error">
          {saveError}
        </div>
      )}

      <div className="rooms-scrollbar flex min-h-0 flex-1 flex-col overflow-auto">
        {loading && <PaneState>Loading file...</PaneState>}
        {!loading && error && <PaneState tone="error">{error}</PaneState>}
        {!loading && !error && !fileInfo && <PaneState>Loading file...</PaneState>}
        {!loading && !error && fileInfo && editing && Editor && (
          <div className="h-full min-h-105 bg-rooms-paper-2">
            <Suspense fallback={<PaneState>Loading preview...</PaneState>}>
              <Editor content={draft} onChange={setDraft} />
            </Suspense>
          </div>
        )}
        {!loading && !error && fileInfo && !editing && Viewer && (
          <Suspense fallback={<PaneState>Loading preview...</PaneState>}>
            <Viewer content={content} fileInfo={fileInfo} />
          </Suspense>
        )}
        {!loading && !error && fileInfo && !editing && !Viewer && (
          <PaneState>No viewer is available for this file.</PaneState>
        )}
      </div>
    </div>
  );
}
