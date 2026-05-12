import { getAccessToken } from '@/contexts/AuthContext'
import type { SpaceMetadata, FileMetadataEntry } from '@ai-spaces/shared'
import { SpaceMetadataSchema } from '@ai-spaces/shared'

/**
 * Rename a file in a space via REST.
 */
export async function renameSpaceFile(
  spaceId: string,
  filePath: string,
  newPath: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const token = getAccessToken()
    const response = await fetch(`/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ newPath }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to rename file' }))
      return { success: false, error: (error as { error?: string }).error || 'Failed to rename file' }
    }

    const data = await response.json()
    return { success: true, path: (data as { path?: string }).path ?? newPath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
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
    const token = getAccessToken()
    const response = await fetch(`/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to write file' }));
      return { success: false, error: (error as { error?: string }).error || 'Failed to write file' };
    }

    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function fetchSpaceMetadata(spaceId: string): Promise<SpaceMetadata> {
  try {
    const token = getAccessToken()
    const res = await fetch(`/api/spaces/${spaceId}/metadata`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return { files: {} }
    const json = await res.json()
    const parsed = SpaceMetadataSchema.safeParse(json)
    return parsed.success ? parsed.data : { files: {} }
  } catch {
    return { files: {} }
  }
}

export async function patchFileMetadata(
  spaceId: string,
  filePath: string,
  patch: Partial<FileMetadataEntry>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAccessToken()
    const res = await fetch(`/api/spaces/${spaceId}/metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files: { [filePath]: patch } }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: text }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
