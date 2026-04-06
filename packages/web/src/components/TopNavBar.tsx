export default function TopNavBar() {
  return (
    <header className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 w-full h-14 flex justify-between items-center px-6 z-40">
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold text-slate-900 dark:text-white font-headline">AI Spaces</span>
        <nav className="flex items-center gap-2 text-sm ml-4">
          <span className="text-slate-500 dark:text-slate-400">Family Vacations</span>
          <span className="text-slate-400">/</span>
          <span className="text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 font-bold px-1">Maine.md</span>
        </nav>
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