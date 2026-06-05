import type { FileMetadataEntry, SpaceMetadata } from "@ai-spaces/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchSpaceMetadata, patchFileMetadata } from "../api/spaceFiles";

interface FileMetadataContextValue {
  metadata: SpaceMetadata;
  loading: boolean;
  getEntry: (filePath: string) => FileMetadataEntry | undefined;
  updateEntry: (filePath: string, patch: Partial<FileMetadataEntry>) => Promise<void>;
  refresh: () => void;
}

const FileMetadataContext = createContext<FileMetadataContextValue | null>(null);

export function FileMetadataProvider({
  spaceId,
  children,
}: {
  spaceId: string;
  children: ReactNode;
}) {
  const [metadata, setMetadata] = useState<SpaceMetadata>({ files: {} });
  const [loading, setLoading] = useState(true);
  const [_refreshKey, setRefreshKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchSpaceMetadata(spaceId).then((data) => {
      if (!controller.signal.aborted) {
        setMetadata(data);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [spaceId]);

  const getEntry = useCallback((filePath: string) => metadata.files[filePath], [metadata]);

  const updateEntry = useCallback(
    async (filePath: string, patch: Partial<FileMetadataEntry>) => {
      // Optimistic update
      setMetadata((prev) => ({
        files: { ...prev.files, [filePath]: { ...prev.files[filePath], ...patch } },
      }));
      const result = await patchFileMetadata(spaceId, filePath, patch);
      if (!result.success) {
        // Rollback by re-fetching
        setRefreshKey((k) => k + 1);
      }
    },
    [spaceId],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <FileMetadataContext.Provider value={{ metadata, loading, getEntry, updateEntry, refresh }}>
      {children}
    </FileMetadataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFileMetadata(): FileMetadataContextValue {
  const ctx = useContext(FileMetadataContext);
  if (!ctx) throw new Error("useFileMetadata must be used inside FileMetadataProvider");
  return ctx;
}
