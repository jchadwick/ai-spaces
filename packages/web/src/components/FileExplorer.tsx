export default function FileExplorer() {
  return (
    <aside className="w-64 bg-slate-100 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Navigation Context */}
      <div className="p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between mb-4">
          <span className="font-headline font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">Explorer</span>
          <span className="material-symbols-outlined text-slate-400 text-lg cursor-pointer">create_new_folder</span>
        </div>
        {/* Tree Structure */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer rounded transition-all">
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
            <span className="material-symbols-outlined text-sm text-amber-500">folder_open</span>
            <span className="text-sm font-medium">.space</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer rounded transition-all ml-4">
            <span className="material-symbols-outlined text-sm">folder</span>
            <span className="text-sm">Budget</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 text-blue-600 bg-white dark:bg-slate-900 rounded shadow-sm ml-4">
            <span className="material-symbols-outlined text-sm">description</span>
            <span className="text-sm font-semibold">Maine.md</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer rounded transition-all ml-4">
            <span className="material-symbols-outlined text-sm">description</span>
            <span className="text-sm">CostaRica.md</span>
          </div>
        </div>
      </div>
      {/* New File Button */}
      <div className="px-4 mt-2">
        <button type="button" className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all">
          <span className="material-symbols-outlined text-sm">add</span>
          New File
        </button>
      </div>
      {/* History Panel */}
      <div className="mt-auto border-t border-slate-200 dark:border-slate-800 flex flex-col max-h-48">
        <div className="px-4 py-3 flex items-center justify-between text-slate-500">
          <span className="text-[10px] uppercase tracking-widest font-bold">History</span>
          <span className="material-symbols-outlined text-sm">unfold_less</span>
        </div>
        <div className="overflow-y-auto px-4 pb-4 flex flex-col gap-3 custom-scrollbar">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-900 dark:text-slate-200 font-medium">Added portland options</span>
            <span className="text-[10px] text-slate-400">2 mins ago • AI</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Fixed typo in heading</span>
            <span className="text-[10px] text-slate-400">15 mins ago • You</span>
          </div>
        </div>
      </div>
    </aside>
  )
}