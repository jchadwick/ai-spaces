import type { ViewerProps } from './types'

function prettyPrint(content: string | null): string {
  if (content === null) return ''
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

export default function JsonViewer({ content }: ViewerProps) {
  if (content === null) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">description</span>
          <p className="text-body-md">Empty file</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <pre className="font-mono text-body-sm text-on-surface bg-surface-container-low p-lg rounded-lg overflow-x-auto whitespace-pre-wrap">
        {prettyPrint(content)}
      </pre>
    </div>
  )
}
