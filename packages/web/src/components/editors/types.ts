import type { FileInfo } from '@/hooks/useFileContent'
import type { ComponentType } from 'react'

export interface ViewerProps {
  content: string | null
  fileInfo: FileInfo
}

export interface EditorProps {
  content: string
  onChange: (content: string) => void
}

export interface FileTypeHandler {
  viewer: ComponentType<ViewerProps>
  editor?: ComponentType<EditorProps>
}
