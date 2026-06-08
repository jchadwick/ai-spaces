import { Check, Edit3, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

function RoomsIconButton({
  children,
  label,
  onClick,
  active = false,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded-[9px] border-[1.5px] p-0 disabled:cursor-default disabled:opacity-45 ${
        active
          ? "border-rooms-ink bg-rooms-ink text-rooms-paper"
          : "border-transparent bg-transparent text-rooms-ink-soft enabled:cursor-pointer enabled:hover:border-rooms-line-strong enabled:hover:bg-rooms-paper-2"
      }`}
    >
      {children}
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
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const paneRef = useRef<HTMLDivElement>(null);
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
  const canZoom = Boolean(!editing && Viewer && fileInfo && !loading && !error);

  useEffect(() => {
    setEditing(false);
    setDraft(filePath ? "" : "");
    setSaveError(null);
    setSaving(false);
    setZoomLevel(100);
    setFullscreenError(null);
  }, [filePath]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === paneRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement === paneRef.current) {
        await document.exitFullscreen();
        return;
      }

      await paneRef.current?.requestFullscreen();
    } catch (err) {
      setFullscreenError(err instanceof Error ? err.message : "Fullscreen is unavailable.");
    }
  }

  function adjustZoom(delta: number) {
    setZoomLevel((current) => Math.min(200, Math.max(50, current + delta)));
  }

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
    <div
      ref={paneRef}
      data-rooms-content-pane
      data-fullscreen={isFullscreen ? "true" : "false"}
      className={`flex min-w-0 flex-1 flex-col bg-rooms-paper ${isFullscreen ? "h-screen w-screen" : ""}`}
    >
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
          {!editing && (
            <div className="flex items-center gap-1 border-r border-rooms-line pr-2">
              <RoomsIconButton
                label="Zoom out"
                disabled={!canZoom || zoomLevel <= 50}
                onClick={() => adjustZoom(-10)}
              >
                <ZoomOut size={16} />
              </RoomsIconButton>
              <button
                type="button"
                aria-label="Reset zoom"
                title="Reset zoom"
                disabled={!canZoom || zoomLevel === 100}
                onClick={() => setZoomLevel(100)}
                className="inline-flex h-8 min-w-13 items-center justify-center gap-1 rounded-[9px] border-[1.5px] border-transparent bg-transparent px-2 text-xs font-semibold text-rooms-ink-soft disabled:cursor-default disabled:opacity-45 enabled:cursor-pointer enabled:hover:border-rooms-line-strong enabled:hover:bg-rooms-paper-2"
              >
                <RotateCcw size={14} />
                <span>{zoomLevel}%</span>
              </button>
              <RoomsIconButton
                label="Zoom in"
                disabled={!canZoom || zoomLevel >= 200}
                onClick={() => adjustZoom(10)}
              >
                <ZoomIn size={16} />
              </RoomsIconButton>
            </div>
          )}
          <RoomsIconButton
            label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            active={isFullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </RoomsIconButton>
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
      {fullscreenError && (
        <div className="shrink-0 border-b border-rooms-error-line bg-rooms-error-soft px-7 py-2 text-[13px] text-rooms-error">
          {fullscreenError}
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
            <div
              data-testid="rooms-viewer-zoom"
              data-zoom-level={zoomLevel}
              className="min-h-full"
              style={{ zoom: `${zoomLevel}%` } as CSSProperties}
            >
              <Viewer content={content} fileInfo={fileInfo} />
            </div>
          </Suspense>
        )}
        {!loading && !error && fileInfo && !editing && !Viewer && (
          <PaneState>No viewer is available for this file.</PaneState>
        )}
      </div>
    </div>
  );
}
