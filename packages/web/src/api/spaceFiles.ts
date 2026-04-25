import { getAccessToken } from '@/contexts/AuthContext'

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
