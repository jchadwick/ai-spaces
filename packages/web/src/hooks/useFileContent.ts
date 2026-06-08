import { useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken } from "@/contexts/AuthContext";
import { useAPI } from "./useAPI";

export type FileType = "markdown" | "text" | "json" | "image" | "binary" | "pdf" | "unknown";

export interface FileInfo {
  name: string;
  path: string;
  type: FileType;
  modifiedAt?: string;
  size?: number;
}

export interface FileContent {
  content: string | null;
  fileInfo: FileInfo | null;
  loading: boolean;
  error: string | null;
}

function detectFileType(
  contentType: string | null,
  xFileContentType: string | null,
  fileName: string,
): FileType {
  // Prefer the server's explicit file content type header
  if (xFileContentType === "image") return "image";
  if (xFileContentType === "binary") return "binary";
  if (xFileContentType === "markdown") return "markdown";
  if (xFileContentType === "pdf") return "pdf";

  const mimeType = contentType?.split(";")[0].trim();
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/octet-stream") return "binary";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/markdown") return "markdown";
  if (mimeType === "application/json") return "json";
  if (mimeType?.startsWith("text/")) return "text";

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "pdf") return "pdf";
  if (ext === "json") return "json";
  if (["txt", "js", "ts", "jsx", "tsx", "css", "html", "xml", "yaml", "yml"].includes(ext || ""))
    return "text";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) return "image";

  return "unknown";
}

interface UseFileContentOptions {
  refreshKey?: number;
}

export function useFileContent(
  spaceId: string | undefined,
  filePath: string | undefined,
  options?: UseFileContentOptions,
): FileContent {
  const refreshKey = options?.refreshKey ?? 0;
  const apiFetch = useAPI();

  const [content, setContent] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchKey = useMemo(() => {
    if (!spaceId || !filePath) return null;
    return { spaceId, filePath, refreshKey };
  }, [spaceId, filePath, refreshKey]);

  useEffect(() => {
    if (!fetchKey) {
      return;
    }

    const currentFetchId = ++fetchIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const revokeObjectUrl = () => {
      if (!objectUrlRef.current) return;
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };

    const fetchData = async () => {
      try {
        const { spaceId: currentSpaceId, filePath: currentFilePath } = fetchKey;
        const encodedPath = encodeURIComponent(currentFilePath);
        const fileUrl = `/api/spaces/${currentSpaceId}/files/${encodedPath}`;
        const fileName = currentFilePath.split("/").pop() || currentFilePath;
        const expectedFileType = detectFileType(null, null, fileName);
        const metadataMethod = expectedFileType === "pdf" ? "HEAD" : "GET";
        const response = await apiFetch(fileUrl, {
          method: metadataMethod,
          signal: controller.signal,
        });

        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return;

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        const xFileContentType = response.headers.get("x-file-content-type");
        const xFileModified = response.headers.get("x-file-modified") ?? undefined;
        const contentLength = response.headers.get("content-length");
        const fileSize = contentLength ? Number(contentLength) : undefined;
        const fileType = detectFileType(contentType, xFileContentType, fileName);

        if (fileType === "pdf") {
          if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return;
          revokeObjectUrl();
          const token = getAccessToken();
          const pdfUrl = token ? `${fileUrl}?token=${encodeURIComponent(token)}` : fileUrl;
          setContent(pdfUrl);
          setFileInfo({
            name: fileName,
            path: currentFilePath,
            type: fileType,
            modifiedAt: xFileModified,
            size: Number.isFinite(fileSize) ? fileSize : undefined,
          });
          setLoading(false);
          return;
        }

        if (fileType === "image") {
          const blob = await response.blob();
          if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return;
          const url = URL.createObjectURL(blob);
          revokeObjectUrl();
          objectUrlRef.current = url;
          setContent(url);
          setFileInfo({
            name: fileName,
            path: currentFilePath,
            type: fileType,
            modifiedAt: xFileModified,
            size: Number.isFinite(fileSize) ? fileSize : undefined,
          });
          setLoading(false);
          return;
        }

        if (fileType === "binary") {
          if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return;
          revokeObjectUrl();
          setContent(null);
          setFileInfo({
            name: fileName,
            path: currentFilePath,
            type: fileType,
            modifiedAt: xFileModified,
            size: Number.isFinite(fileSize) ? fileSize : undefined,
          });
          setLoading(false);
          return;
        }

        const text = await response.text();
        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return;

        revokeObjectUrl();
        setContent(text);
        setFileInfo({
          name: fileName,
          path: currentFilePath,
          type: fileType,
          modifiedAt: xFileModified,
          size: Number.isFinite(fileSize) ? fileSize : undefined,
        });
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        revokeObjectUrl();
        setContent(null);
        setFileInfo(null);
        setLoading(false);
      }
    };

    setLoading(true);
    setError(null);
    fetchData();

    return () => {
      controller.abort();
      revokeObjectUrl();
    };
  }, [fetchKey, apiFetch]);

  if (!spaceId || !filePath) {
    return { content: null, fileInfo: null, loading: false, error: null };
  }

  return { content, fileInfo, loading, error };
}
