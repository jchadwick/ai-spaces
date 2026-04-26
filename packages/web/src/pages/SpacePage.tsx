import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import TopNavBar from "../components/TopNavBar";
import FileExplorer from "../components/FileExplorer";
import FileEditor from "../components/FileEditor";
import AIChatPane from "../components/AIChatPane";
import ResizeHandle from "../components/ResizeHandle";
import { ErrorBoundary, WebSocketErrorBoundary } from "../components/errors";
import { ToastProvider } from "../components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAPI } from "@/hooks/useAPI";
import type { FileChangedPayload } from "@/hooks/useSpaceWebSocket";

const LEFT_DEFAULT = 256;
const RIGHT_DEFAULT = 320;
const SIDEBAR_MIN = 150;
const SIDEBAR_MAX = 600;

interface Space {
  id: string;
  name: string;
  agent: string;
  path: string;
  config: {
    name: string;
    description?: string;
  };
}

export default function SpacePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const apiFetch = useAPI();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorRefreshKey, setEditorRefreshKey] = useState(0);
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const handleFileChanged = useCallback(
    (event: FileChangedPayload) => {
      const { path: changedPath, action } = event;

      window.dispatchEvent(
        new CustomEvent("fileModified", {
          detail: { path: changedPath, action, triggeredBy: "agent" },
        }),
      );

      if (action === "deleted" && selectedFile === changedPath) {
        setSelectedFile(null);
        return;
      }

      if (action === "modified" && selectedFile === changedPath) {
        setEditorRefreshKey((k) => k + 1);
      }
    },
    [selectedFile],
  );

  useEffect(() => {
    if (!spaceId) {
      setError("Space ID is required");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    apiFetch(`/api/spaces/${spaceId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Space not found");
          }
          throw new Error(`Failed to fetch space: ${res.status}`);
        }
        return res.json();
      })
      .then((data: { space?: Space } & Partial<Space>) => {
        if (!mounted) return;
        setSpace(data.space ?? (data as Space));
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        if (err.name === "AbortError") return;
        setError(err.message || "Unable to load space");
        setLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [spaceId, apiFetch]);

  const handleLeaveSpace = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-surface">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent mb-md"></div>
        <p className="text-body-sm text-on-surface-variant">Loading space...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface font-ui text-on-surface flex items-center justify-center p-lg">
        <div className="max-w-md w-full">
          <div className="text-center mb-lg">
            <div className="w-16 h-16 mx-auto mb-md rounded-full bg-error-container flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-3xl">
                error
              </span>
            </div>
            <h1 className="text-title-lg text-on-surface mb-sm">
              Error Loading Space
            </h1>
            <p className="text-body-md text-on-surface-variant">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleLeaveSpace}
            className="w-full px-lg py-sm bg-primary text-on-primary rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-xs"
          >
            <span className="material-symbols-outlined text-lg">home</span>
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="min-h-screen bg-surface font-ui text-on-surface flex items-center justify-center p-lg">
        <div className="max-w-md w-full">
          <div className="text-center mb-lg">
            <div className="w-16 h-16 mx-auto mb-md rounded-full bg-error-container flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-3xl">
                search_off
              </span>
            </div>
            <h1 className="text-title-lg text-on-surface mb-sm">
              Space Not Found
            </h1>
            <p className="text-body-md text-on-surface-variant">
              The space you're looking for doesn't exist.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLeaveSpace}
            className="w-full px-lg py-sm bg-primary text-on-primary rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-xs"
          >
            <span className="material-symbols-outlined text-lg">home</span>
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const role =
    (user?.role as "viewer" | "editor" | "admin" | undefined) ?? "viewer";

  return (
    <ToastProvider>
      <div className="bg-surface font-body text-on-surface overflow-hidden h-screen flex flex-col">
        <ErrorBoundary>
          <TopNavBar
            spaceName={space?.config?.name}
            selectedFile={selectedFile}
            role={role}
          />
        </ErrorBoundary>

        <main className="flex flex-1 overflow-hidden">
          <div
            ref={leftRef}
            className="flex-shrink-0 overflow-hidden transition-[width] duration-200"
            style={{ width: leftCollapsed ? 0 : leftWidth }}
          >
            <ErrorBoundary>
              <FileExplorer
                spaceId={spaceId}
                role={role}
                selectedFile={selectedFile}
                onFileSelect={setSelectedFile}
              />
            </ErrorBoundary>
          </div>
          <ResizeHandle
            side="left"
            collapsed={leftCollapsed}
            containerRef={leftRef}
            minWidth={SIDEBAR_MIN}
            maxWidth={SIDEBAR_MAX}
            onResize={setLeftWidth}
            onCollapse={() => setLeftCollapsed(true)}
            onExpand={() => setLeftCollapsed(false)}
          />
          <ErrorBoundary>
            <FileEditor
              spaceId={spaceId}
              filePath={selectedFile ?? undefined}
              role={role}
              externalRefreshKey={editorRefreshKey}
              onFileModified={() => {
                const event = new CustomEvent("fileModified");
                window.dispatchEvent(event);
              }}
              onFileRenamed={(_oldPath, newPath) => {
                setSelectedFile(newPath);
              }}
            />
          </ErrorBoundary>
          <ResizeHandle
            side="right"
            collapsed={rightCollapsed}
            containerRef={rightRef}
            minWidth={SIDEBAR_MIN}
            maxWidth={SIDEBAR_MAX}
            onResize={setRightWidth}
            onCollapse={() => setRightCollapsed(true)}
            onExpand={() => setRightCollapsed(false)}
          />
          <div
            ref={rightRef}
            className="flex-shrink-0 overflow-hidden transition-[width] duration-200"
            style={{ width: rightCollapsed ? 0 : rightWidth }}
          >
            <WebSocketErrorBoundary showInline>
              <AIChatPane
                spaceId={spaceId!}
                role={role}
                onFileChanged={handleFileChanged}
              />
            </WebSocketErrorBoundary>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

