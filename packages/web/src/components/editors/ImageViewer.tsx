import type { ViewerProps } from './types'

export default function ImageViewer({ content, fileInfo }: ViewerProps) {
  if (!content) return null

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex items-center justify-center">
      <img
        src={content}
        alt={fileInfo.name}
        className="max-w-full h-auto rounded-lg shadow-ambient"
      />
    </div>
  )
}
