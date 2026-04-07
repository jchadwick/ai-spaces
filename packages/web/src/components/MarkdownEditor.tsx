import { useFileContent } from '../hooks/useFileContent'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

interface MarkdownEditorProps {
  spaceId?: string
  filePath?: string
}

function getFileIcon(type: string): string {
  switch (type) {
    case 'markdown':
      return 'description'
    case 'text':
      return 'article'
    case 'image':
      return 'image'
    case 'binary':
      return 'insert_drive_file'
    default:
      return 'file_present'
  }
}

function getFileTypeLabel(type: string): string {
  switch (type) {
    case 'markdown':
      return 'Markdown'
    case 'text':
      return 'Text'
    case 'image':
      return 'Image'
    case 'binary':
      return 'Binary'
    default:
      return 'File'
  }
}

export default function MarkdownEditor({ spaceId, filePath }: MarkdownEditorProps) {
  const { content, fileInfo, loading, error } = useFileContent(spaceId, filePath)

  if (!spaceId || !filePath) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">draft</span>
          <p className="text-body-md">Select a file to preview</p>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent"></div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center p-8">
        <div className="bg-error-container/10 rounded-xl p-lg max-w-md">
          <div className="flex items-center gap-sm text-error">
            <span className="material-symbols-outlined">error</span>
            <span className="text-body-md font-medium">Failed to load file</span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-xs">{error}</p>
        </div>
      </section>
    )
  }

  if (!fileInfo) {
    return (
      <section className="flex-1 flex flex-col bg-surface-container-lowest items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">folder_open</span>
          <p className="text-body-md">File not found</p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden">
      <header className="flex-shrink-0 px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-xl">
            {getFileIcon(fileInfo.type)}
          </span>
          <div className="flex flex-col">
            <h2 className="text-title-sm font-medium text-on-surface">{fileInfo.name}</h2>
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">
              {getFileTypeLabel(fileInfo.type)}
              {fileInfo.modifiedAt && ` • Modified ${formatRelativeTime(fileInfo.modifiedAt)}`}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <ContentRenderer fileInfo={fileInfo} content={content} />
      </div>
    </section>
  )
}

interface ContentRendererProps {
  fileInfo: NonNullable<ReturnType<typeof useFileContent>['fileInfo']>
  content: string | null
}

function ContentRenderer({ fileInfo, content }: ContentRendererProps) {
  if (fileInfo.type === 'image' && content) {
      return (
        <div className="p-8 flex items-center justify-center">
          <img 
            src={content} 
            alt={fileInfo.name}
            className="max-w-full h-auto rounded-lg shadow-ambient"
          />
        </div>
      )
    }

    if (fileInfo.type === 'binary') {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl">hide_source</span>
            <p className="text-body-md">Cannot preview binary file</p>
            <p className="text-body-sm text-on-surface-variant/70">
              This file type cannot be displayed in the editor.
            </p>
          </div>
        </div>
      )
    }

    if (content === null) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl">description</span>
            <p className="text-body-md">Empty file</p>
          </div>
        </div>
      )
    }

    const markdownClasses = "prose prose-slate prose-img:rounded-lg prose-headings:font-display prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-on-surface prose-a:text-primary prose-code:font-mono prose-code:bg-surface-container prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-container-low prose-pre:font-mono max-w-3xl"

    if (fileInfo.type === 'markdown') {
      return (
        <div className="p-8 flex flex-col items-center">
          <article className={markdownClasses}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      )
    }

    return (
    <div className="p-8">
      <pre className="font-mono text-body-sm text-on-surface bg-surface-container-low p-lg rounded-lg overflow-x-auto whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}