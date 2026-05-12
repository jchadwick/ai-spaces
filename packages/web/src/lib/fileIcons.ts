/** Maps content type string (from useFileContent / X-File-Content-Type header) to Material Symbol icon name */
export function getContentTypeIcon(type: string): string {
  switch (type) {
    case 'markdown': return 'description'
    case 'text': return 'article'
    case 'image': return 'image'
    case 'binary': return 'insert_drive_file'
    default: return 'file_present'
  }
}

/** Maps filename and node type to Material Symbol icon name */
export function getFileNodeIcon(name: string, nodeType: string): string {
  if (nodeType === 'directory') return 'folder'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'description'
  if (ext === 'json') return 'settings'
  if (ext === 'csv' || ext === 'xlsx') return 'table'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) return 'image'
  return 'file_present'
}
