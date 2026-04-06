interface FileExplorerProps {
  spacePath: string
}

export default function FileExplorer({ spacePath }: FileExplorerProps) {
  return (
    <aside className="w-64 bg-surface-container-low border-r border-outline-variant/20 flex flex-col">
      <div className="p-lg border-b border-outline-variant/20">
        <h3 className="font-display text-title-sm text-on-surface font-bold mb-md">Files</h3>
        <div className="space-y-xs">
          <div className="flex items-center gap-xs text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-sm">folder</span>
            <span>{spacePath}</span>
          </div>
        </div>
      </div>
      <div className="p-lg mt-auto border-t border-outline-variant/20">
        <button type="button" className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant py-sm rounded-lg text-body-sm font-medium flex items-center justify-center gap-xs">
          <span className="material-symbols-outlined text-sm">add</span>
          New File
        </button>
      </div>
    </aside>
  )
}