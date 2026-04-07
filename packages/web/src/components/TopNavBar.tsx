interface TopNavBarProps {
  spaceName?: string
  selectedFile?: string | null
}

export default function TopNavBar({ spaceName, selectedFile }: TopNavBarProps) {
  const pathParts = selectedFile?.split('/').filter(Boolean) || []
  
  return (
    <header className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 w-full h-14 flex justify-between items-center px-6 z-40">
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold text-slate-900 dark:text-white font-headline">AI Spaces</span>
        {spaceName && (
          <nav className="flex items-center gap-2 text-sm ml-4">
            <span className="text-slate-500 dark:text-slate-400">{spaceName}</span>
            {pathParts.map((part, index) => (
              <span key={index} className="flex items-center gap-2">
                <span className="text-slate-400">/</span>
                <span className={index === pathParts.length - 1 
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 font-bold px-1" 
                  : "text-slate-500 dark:text-slate-400"}>
                  {part}
                </span>
              </span>
            ))}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button type="button" className="bg-primary hover:opacity-90 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-95">
          Share
        </button>
        <div className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors">
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">account_circle</span>
        </div>
      </div>
    </header>
  )
}