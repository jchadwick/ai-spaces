import type { ViewerProps } from './types'

export default function PdfViewer({ content }: ViewerProps) {
  if (!content) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-[var(--color-inkDim)]">
        <p className="font-mono text-sm">No content to display</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <iframe
        src={content}
        className="flex-1 w-full border-0"
        title="PDF viewer"
      />
    </div>
  )
}
