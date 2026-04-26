import { lazy } from 'react'
import type { FileType } from '@/hooks/useFileContent'
import type { FileTypeHandler } from './types'

const registry: Partial<Record<FileType, FileTypeHandler>> = {
  markdown: {
    viewer: lazy(() => import('./MarkdownViewer')),
    editor: lazy(() => import('./LexicalMarkdownEditor')),
  },
  text: {
    viewer: lazy(() => import('./TextViewer')),
    editor: lazy(() => import('./LexicalTextEditor')),
  },
  json: {
    viewer: lazy(() => import('./JsonViewer')),
    editor: lazy(() => import('./MonacoEditor')),
  },
  unknown: {
    viewer: lazy(() => import('./TextViewer')),
    editor: lazy(() => import('./LexicalTextEditor')),
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
