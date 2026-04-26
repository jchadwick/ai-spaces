import { lazy } from 'react'
import type { FileType } from '@/hooks/useFileContent'
import type { FileTypeHandler } from './types'

const registry: Partial<Record<FileType, FileTypeHandler>> = {
  markdown: {
    viewer: lazy(() => import('./MarkdownViewer')),
    editor: lazy(() => import('./MilkdownEditor')),
  },
  text: {
    viewer: lazy(() => import('./TextViewer')),
    editor: lazy(() => import('./TextEditor')),
  },
  json: {
    viewer: lazy(() => import('./JsonViewer')),
    editor: lazy(() => import('./MonacoEditor')),
  },
  unknown: {
    viewer: lazy(() => import('./TextViewer')),
    editor: lazy(() => import('./TextEditor')),
  },
  image: {
    viewer: lazy(() => import('./ImageViewer')),
  },
  binary: {
    viewer: lazy(() => import('./BinaryViewer')),
  },
}

export function getFileTypeHandler(type: FileType): FileTypeHandler | undefined {
  return registry[type]
}
