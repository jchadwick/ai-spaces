import type { FileMetadataEntry, SpaceMetadata } from "@ai-spaces/shared";
import { SpaceMetadataSchema } from "@ai-spaces/shared";
import { getAccessToken } from "@/contexts/AuthContext";

/**
 * Rename a file in a space via REST.
 */
export async function renameSpaceFile(
  spaceId: string,
  filePath: string,
  newPath: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const token = getAccessToken();
    const response = await fetch(`/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ newPath }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to rename file" }));
      return {
        success: false,
        error: (error as { error?: string }).error || "Failed to rename file",
      };
    }

    const data = await response.json();
    return { success: true, path: (data as { path?: string }).path ?? newPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Save a file in a space via REST (no WebSocket).
 */
export async function writeSpaceFileHttp(
  spaceId: string,
  filePath: string,
  content: string,
): Promise<{ success: boolean; path?: string; modified?: string; error?: string }> {
  try {
    const token = getAccessToken();
    const response = await fetch(`/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to write file" }));
      return {
        success: false,
        error: (error as { error?: string }).error || "Failed to write file",
      };
    }

    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function fetchSpaceMetadata(spaceId: string): Promise<SpaceMetadata> {
  try {
    const token = getAccessToken();
    const res = await fetch(`/api/spaces/${spaceId}/metadata`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { files: {} };
    const json = await res.json();
    const parsed = SpaceMetadataSchema.safeParse(json);
    return parsed.success ? parsed.data : { files: {} };
  } catch {
    return { files: {} };
  }
}

export async function patchFileMetadata(
  spaceId: string,
  filePath: string,
  patch: Partial<FileMetadataEntry>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAccessToken();
    const res = await fetch(`/api/spaces/${spaceId}/metadata`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files: { [filePath]: patch } }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAccessToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((error as { error?: string }).error || response.statusText);
  }
  return response.json() as Promise<T>;
}

export interface SpaceMember {
  id: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  email: string;
  displayName?: string;
}

export interface SpaceTopic {
  id: string;
  spaceId: string;
  topicPath: string;
  targetType: "root" | "file" | "directory";
  status: "active" | "archived";
  updatedAt?: string;
}

export async function fetchSpaceTopics(spaceId: string): Promise<SpaceTopic[]> {
  const data = await jsonRequest<{ rooms: SpaceTopic[] }>(`/api/spaces/${spaceId}/rooms`);
  return data.rooms;
}

export async function promoteSpaceTopic(
  spaceId: string,
  topicPath: string,
  targetType: "file" | "directory",
): Promise<SpaceTopic> {
  const data = await jsonRequest<{ room: SpaceTopic }>(`/api/spaces/${spaceId}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicPath, targetType }),
  });
  return data.room;
}

export async function archiveSpaceTopic(spaceId: string, roomId: string): Promise<void> {
  await jsonRequest<{ success: true }>(
    `/api/spaces/${spaceId}/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function createSpaceDirectory(spaceId: string, dirPath: string): Promise<void> {
  await jsonRequest<{ success: true }>(`/api/spaces/${spaceId}/directories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dirPath }),
  });
}

export async function createSpaceFile(
  spaceId: string,
  filePath: string,
  content = "",
): Promise<void> {
  await jsonRequest<{ success: true }>(
    `/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
}

function fileNeedsBase64(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    file.type === "application/octet-stream"
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export async function uploadSpaceFile(
  spaceId: string,
  filePath: string,
  file: File,
): Promise<void> {
  const isBase64 = fileNeedsBase64(file);
  await jsonRequest<{ success: true }>(
    `/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isBase64
          ? { content: await fileToBase64(file), encoding: "base64" }
          : { content: await file.text() },
      ),
    },
  );
}

export async function deleteSpacePath(
  spaceId: string,
  filePath: string,
  type: "file" | "directory",
): Promise<void> {
  const resource = type === "directory" ? "directories" : "files";
  await jsonRequest<{ success: true }>(
    `/api/spaces/${spaceId}/${resource}/${encodeURIComponent(filePath)}`,
    {
      method: "DELETE",
    },
  );
}

export async function renameSpacePath(
  spaceId: string,
  fromPath: string,
  toPath: string,
  type: "file" | "directory",
): Promise<string> {
  const resource = type === "directory" ? "directories" : "files";
  const data = await jsonRequest<{ success: true; path?: string }>(
    `/api/spaces/${spaceId}/${resource}/${encodeURIComponent(fromPath)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPath: toPath }),
    },
  );
  return data.path ?? toPath;
}

export async function fetchSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const data = await jsonRequest<{ members: SpaceMember[] }>(`/api/spaces/${spaceId}/members`);
  return data.members;
}

export async function createSpaceInvite(
  spaceId: string,
  role: "owner" | "editor" | "viewer" = "editor",
): Promise<string> {
  const data = await jsonRequest<{ inviteUrl: string }>(`/api/spaces/${spaceId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return data.inviteUrl;
}
