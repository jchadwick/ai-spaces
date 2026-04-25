import { useState, useEffect, useRef, useCallback } from 'react'
import { useFileTree } from '../hooks/useFileTree'
import { useToast } from './ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useAPI } from '@/hooks/useAPI'
import type { FileNode } from '@ai-spaces/shared'

interface FileExplorerProps {
  spaceId: string | undefined
  role: 'viewer' | 'editor' | 'admin'
  selectedFile: string | null
  onFileSelect: (filePath: string | null) => void
}

interface ContextMenuState {
  x: number
  y: number
  node: FileNode
}

function getFileIcon(name: string, type: string): string {
  if (type === 'directory') return 'folder'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'description'
  if (ext === 'json') return 'settings'
  if (ext === 'csv' || ext === 'xlsx') return 'table'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) return 'image'
  return 'file_present'
}

function FileTreeNode({
  node,
  depth = 0,
  selectedFile,
  onFileSelect,
  expandedFolders,
  toggleFolder,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  node: FileNode
  depth?: number
  selectedFile: string | null
  onFileSelect: (path: string) => void
  expandedFolders: Set<string>
  toggleFolder: (path: string) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  renamingPath: string | null
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}) {
  const isDirectory = node.type === 'directory'
  const isSelected = selectedFile === node.path
  const isExpanded = expandedFolders.has(node.path)
  const isHidden = node.name.startsWith('.')
  const isSpaceFolder = node.name === '.space'
  const isRenaming = renamingPath === node.path

  const paddingLeft = 8 + depth * 16

  const handleClick = () => {
    if (isRenaming) return
    if (isDirectory) {
      toggleFolder(node.path)
    } else {
      onFileSelect(node.path)
    }
  }

  const icon = getFileIcon(node.name, node.type)

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        className={`w-full flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded transition-all text-left ${
          isSelected
            ? 'text-primary bg-surface-container-lowest'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50'
        } ${isHidden && !isSpaceFolder ? 'italic opacity-70' : ''} ${isSpaceFolder ? 'text-amber-600 dark:text-amber-400' : ''}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {isDirectory && (
          <span className="material-symbols-outlined text-lg">
            {isExpanded ? 'folder_open' : 'folder'}
          </span>
        )}
        {!isDirectory && (
          <span className="material-symbols-outlined text-lg">{icon}</span>
        )}
        {isRenaming ? (
          <input
            autoFocus
            className="text-sm bg-surface-container-lowest border border-outline-variant/20 rounded px-1 py-0 flex-1 outline-none text-on-surface"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
          />
        ) : (
          <span className={`text-sm ${isSelected ? 'font-semibold' : ''}`}>
            {node.name}
          </span>
        )}
      </button>

      {isDirectory && isExpanded && node.children && node.children.length > 0 && (
        <div className="flex flex-col">
          {node.children.map((child: FileNode) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}

      {isDirectory && isExpanded && (!node.children || node.children.length === 0) && (
        <div className="text-xs text-on-surface-variant/50 italic px-4 py-1" style={{ paddingLeft: `${paddingLeft + 24}px` }}>
          (empty)
        </div>
      )}
    </>
  )
}

export default function FileExplorer({ spaceId, role, selectedFile, onFileSelect }: FileExplorerProps) {
  const apiFetch = useAPI()
  const { files, loading, error, refresh } = useFileTree(spaceId)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const { showToast } = useToast()

  // Modal states
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showFileModal, setShowFileModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [fileName, setFileName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renamingType, setRenamingType] = useState<'file' | 'directory'>('file')
  const [renameValue, setRenameValue] = useState('')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const isViewer = role === 'viewer'

  // Dismiss context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    if (isViewer) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.pageX, y: e.pageY, node })
  }, [isViewer])

  const startRename = useCallback((node: FileNode) => {
    setContextMenu(null)
    setRenamingPath(node.path)
    setRenamingType(node.type === 'directory' ? 'directory' : 'file')
    setRenameValue(node.name)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renamingPath || !spaceId || !renameValue.trim()) {
      setRenamingPath(null)
      return
    }

    const parentPath = renamingPath.includes('/')
      ? renamingPath.substring(0, renamingPath.lastIndexOf('/'))
      : ''
    const newPath = parentPath ? `${parentPath}/${renameValue.trim()}` : renameValue.trim()

    if (newPath === renamingPath) {
      setRenamingPath(null)
      return
    }

    try {
      const resourceType = renamingType === 'directory' ? 'directories' : 'files'
      const response = await apiFetch(
        `/api/spaces/${spaceId}/${resourceType}/${renamingPath}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPath }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to rename')
      }

      showToast(`Renamed to "${renameValue.trim()}"`, 'success', 3000)
      if (selectedFile === renamingPath) {
        onFileSelect(newPath)
      }
      refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename'
      showToast(message, 'error', 4000)
    } finally {
      setRenamingPath(null)
    }
  }, [renamingPath, renamingType, renameValue, spaceId, apiFetch, showToast, selectedFile, onFileSelect, refresh])

  const cancelRename = useCallback(() => {
    setRenamingPath(null)
  }, [])

  const startDelete = useCallback((node: FileNode) => {
    setContextMenu(null)
    setDeleteTarget(node)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !spaceId) return

    setIsDeleting(true)
    try {
      const isDirectory = deleteTarget.type === 'directory'
      const endpoint = isDirectory
        ? `/api/spaces/${spaceId}/directories/${deleteTarget.path}`
        : `/api/spaces/${spaceId}/files/${deleteTarget.path}`

      const response = await apiFetch(endpoint, { method: 'DELETE' })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete')
      }

      showToast(`Deleted "${deleteTarget.name}"`, 'success', 3000)
      if (selectedFile === deleteTarget.path || selectedFile?.startsWith(deleteTarget.path + '/')) {
        onFileSelect(null)
      }
      refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete'
      showToast(message, 'error', 4000)
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, spaceId, apiFetch, showToast, selectedFile, onFileSelect, refresh])

  useEffect(() => {
    const handleFileModified = (event: CustomEvent<{ path: string; action: string; triggeredBy: string }>) => {
      refresh()

      if (!event.detail?.path) return;

      const fileName = event.detail.path.split('/').pop() || event.detail.path
      const triggeredBy = event.detail.triggeredBy === 'agent' ? 'Agent' : 'User'

      if (event.detail.action === 'created') {
        showToast(`${fileName} created by ${triggeredBy}`, 'success', 3000)
      } else {
        showToast(`${fileName} updated by ${triggeredBy}`, 'info', 3000)
      }
    }

    window.addEventListener('fileModified', handleFileModified as EventListener)
    return () => {
      window.removeEventListener('fileModified', handleFileModified as EventListener)
    }
  }, [refresh, showToast])

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleCreateFolder = async () => {
    if (!folderName.trim() || !spaceId) {
      return
    }

    setIsCreating(true)

    try {
      const response = await apiFetch(`/api/spaces/${spaceId}/directories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderName.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create folder')
      }

      showToast(`Folder "${folderName}" created`, 'success', 3000)
      setShowFolderModal(false)
      setFolderName('')
      refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create folder'
      showToast(message, 'error', 4000)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateFile = async () => {
    if (!fileName.trim() || !spaceId) {
      return
    }

    setIsCreating(true)

    try {
      const response = await apiFetch(`/api/spaces/${spaceId}/files/${fileName.trim()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create file')
      }

      showToast(`File "${fileName}" created`, 'success', 3000)
      setShowFileModal(false)
      setFileName('')
      refresh()

      // Select the newly created file
      onFileSelect(fileName.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create file'
      showToast(message, 'error', 4000)
    } finally {
      setIsCreating(false)
    }
  }

  if (loading) {
    return (
      <aside className="w-64 bg-surface-container-low flex flex-col">
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin rounded-full w-6 h-6 border-2 border-primary border-t-transparent"></div>
        </div>
      </aside>
    )
  }

  if (error) {
    return (
      <aside className="w-64 bg-surface-container-low flex flex-col">
        <div className="p-4">
          <div className="bg-error-container/10 rounded-lg p-3 text-error text-sm">
            {error}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <>
    <aside className="w-64 bg-surface-container-low flex flex-col">
      <div className="p-4 flex flex-col gap-1 flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-headline font-bold text-on-surface uppercase tracking-wider text-xs">Explorer</span>
            {isViewer && (
              <span className="text-[10px] text-on-surface-variant italic">(view only)</span>
            )}
          </div>
          {!isViewer && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-on-surface-variant hover:text-on-surface transition-colors"
                onClick={() => setShowFileModal(true)}
                title="Create new file"
              >
                <span className="material-symbols-outlined text-lg">note_add</span>
              </button>
              <button
                type="button"
                className="text-on-surface-variant hover:text-on-surface transition-colors"
                onClick={() => setShowFolderModal(true)}
                title="Create new folder"
              >
                <span className="material-symbols-outlined text-lg">create_new_folder</span>
              </button>
            </div>
          )}
        </div>

        {files.length === 0 ? (
          <div className="text-sm text-on-surface-variant italic px-2">
            No files found
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {files.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onContextMenu={handleContextMenu}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameCommit={commitRename}
                onRenameCancel={cancelRename}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-outline-variant/20">
        <div className="px-4 py-3 flex items-center justify-between text-on-surface-variant">
          <span className="text-label-sm uppercase tracking-wider font-bold">History</span>
          <button type="button" className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-sm">unfold_less</span>
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 flex flex-col gap-3 max-h-32 custom-scrollbar">
          <div className="text-xs text-on-surface-variant/50 italic">
            File history coming soon...
          </div>
        </div>
      </div>

    </aside>

    {/* Context Menu */}
    {contextMenu && (
      <div
        ref={contextMenuRef}
        className="fixed z-50 bg-popover text-popover-foreground rounded-lg shadow-lg py-1 min-w-[140px]"
        style={{
          top: contextMenu.y,
          left: contextMenu.x,
          boxShadow: '0 8px 24px rgba(25,28,30,0.06)',
        }}
      >
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-lowest/80 transition-colors text-left"
          onClick={() => startRename(contextMenu.node)}
        >
          <span className="material-symbols-outlined text-base">drive_file_rename_outline</span>
          Rename
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/5 transition-colors text-left"
          onClick={() => startDelete(contextMenu.node)}
        >
          <span className="material-symbols-outlined text-base">delete</span>
          Delete
        </button>
      </div>
    )}

      {/* Create Folder Modal */}
      <Dialog open={showFolderModal} onOpenChange={setShowFolderModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="Folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreateFolder()
                }
              }}
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFolderModal(false)
                setFolderName('')
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!folderName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create File Modal */}
      <Dialog open={showFileModal} onOpenChange={setShowFileModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="File name (e.g., notes.md)"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreateFile()
                }
              }}
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFileModal(false)
                setFileName('')
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFile}
              disabled={!fileName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.type === 'directory' ? 'Folder' : 'File'}</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-on-surface-variant">
            Are you sure you want to delete <span className="font-semibold text-on-surface">"{deleteTarget?.name}"</span>?
            {deleteTarget?.type === 'directory' && (
              <span className="block mt-1 text-error/80">This will delete the folder and all its contents.</span>
            )}
            This action cannot be undone.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
