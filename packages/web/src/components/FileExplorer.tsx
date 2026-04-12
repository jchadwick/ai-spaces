import { useState, useEffect } from 'react'
import { useFileTree } from '../hooks/useFileTree'
import { useToast } from './ui/toast'
import type { FileNode } from '@ai-spaces/shared'

interface FileExplorerProps {
  spaceId: string | undefined
  role: 'viewer' | 'editor' | 'admin'
  selectedFile: string | null
  onFileSelect: (filePath: string | null) => void
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
  toggleFolder
}: { 
  node: FileNode
  depth?: number
  selectedFile: string | null
  onFileSelect: (path: string) => void
  expandedFolders: Set<string>
  toggleFolder: (path: string) => void
}) {
  const isDirectory = node.type === 'directory'
  const isSelected = selectedFile === node.path
  const isExpanded = expandedFolders.has(node.path)
  const isHidden = node.name.startsWith('.')
  const isSpaceFolder = node.name === '.space'
  
  const paddingLeft = 8 + depth * 16
  
  const handleClick = () => {
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
        <span className={`text-sm ${isSelected ? 'font-semibold' : ''}`}>
          {node.name}
        </span>
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
  const { files, loading, error, refresh } = useFileTree(spaceId)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const { showToast } = useToast()
  
  const isViewer = role === 'viewer'
  
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
            <button type="button" className="text-on-surface-variant hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined text-lg">create_new_folder</span>
            </button>
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
              />
            ))}
          </div>
        )}
      </div>
      
      {!isViewer && (
        <div className="px-4 py-2 border-t border-outline-variant/20">
          <button type="button" className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all">
            <span className="material-symbols-outlined text-sm">add</span>
            New File
          </button>
        </div>
      )}
      
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
  )
}