import type { ViewerProps } from './types'

export default function BinaryViewer(_: ViewerProps) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center p-8">
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
