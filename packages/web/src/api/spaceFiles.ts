/**
 * Save a file in a space via REST (no WebSocket).
 */
export async function writeSpaceFileHttp(
  spaceId: string,
  filePath: string,
  content: string,
): Promise<{ success: boolean; path?: string; modified?: string; error?: string }> {
  try {
    const response = await fetch(`/api/spaces/${spaceId}/files/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
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
