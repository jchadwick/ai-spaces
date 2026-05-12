import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import TopNavBar from "../components/TopNavBar";
import FileExplorer from "../components/FileExplorer";
import FileEditor from "../components/FileEditor";
import AIChatPane from "../components/AIChatPane";
import ResizeHandle from "../components/ResizeHandle";
import { ErrorBoundary } from "../components/errors";
import { ToastProvider } from "../components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import type { SpaceRole } from "@ai-spaces/shared";
import { useAPI } from "@/hooks/useAPI";
import { ConnectionStatusProvider, type FileChangedPayload } from "@/contexts/ConnectionStatusContext";
import {
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_RIGHT_DEFAULT,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
} from "@/constants/layout";

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
  const { spaceId, '*': fileSplat } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const apiFetch = useAPI();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [userRole, setUserRole] = useState<SpaceRole>('viewer');

  const selectedFile = fileSplat || null;
  const setSelectedFile = useCallback((filePath: string | null) => {
    navigate(filePath ? `/space/${spaceId}/${filePath}` : `/space/${spaceId}`, { replace: true });
  }, [navigate, spaceId]);
  const [editorRefreshKey, setEditorRefreshKey] = useState(0);
  const [leftWidth, setLeftWidth] = useState(SIDEBAR_LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(SIDEBAR_RIGHT_DEFAULT);
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
    [selectedFile, setSelectedFile],
  );

  useEffect(() => {
    if (!spaceId) {
      Promise.resolve().then(() => { setError("Space ID is required"); setLoading(false) });
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
      .then((data: { space?: Space; userRole?: SpaceRole } & Partial<Space>) => {
        if (!mounted) return;
        setSpace(data.space ?? (data as Space));
        if (data.userRole) {
          setUserRole(data.userRole);
        }
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

  return (
    <ToastProvider>
      <ConnectionStatusProvider
        spaceId={spaceId!}
        accessToken={accessToken}
        onFileChanged={handleFileChanged}
      >
        <div className="bg-surface font-body text-on-surface overflow-hidden h-screen flex flex-col">
          <ErrorBoundary>
            <TopNavBar
              spaceName={space?.config?.name}
            />
          </ErrorBoundary>

          <main className="flex flex-1 overflow-hidden">
            <div
              ref={leftRef}
              className="flex-shrink-0 min-w-0 overflow-hidden transition-[width] duration-200"
              style={{ width: leftCollapsed ? 0 : leftWidth }}
            >
              <ErrorBoundary>
                <FileExplorer
                  spaceId={spaceId}
                  role={userRole}
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
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <ErrorBoundary>
                <FileEditor
                  spaceId={spaceId}
                  filePath={selectedFile ?? undefined}
                  role={userRole}
                  externalRefreshKey={editorRefreshKey}
                  onFileModified={() => {
                    const event = new CustomEvent("fileModified", {
                      detail: {
                        path: selectedFile ?? "",
                        action: "modified",
                        triggeredBy: "user",
                      },
                    });
                    window.dispatchEvent(event);
                  }}
                  onFileRenamed={(_oldPath, newPath) => {
                    setSelectedFile(newPath);
                  }}
                />
              </ErrorBoundary>
            </div>
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
              className="flex-shrink-0 min-w-0 overflow-hidden transition-[width] duration-200"
              style={{ width: rightCollapsed ? 0 : rightWidth }}
            >
              <ErrorBoundary>
                <AIChatPane
                  role={userRole}
                />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </ConnectionStatusProvider>
    </ToastProvider>
  );
}

