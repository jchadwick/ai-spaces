export default function MarkdownEditor() {
  return (
    <section className="flex-1 flex flex-col bg-surface-container-lowest">
      {/* Editor Toolbar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex gap-4 items-center">
          <span className="text-sm font-mono text-slate-400"># Markdown</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="px-3 py-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
          <button type="button" className="px-4 py-1 bg-primary text-white text-sm font-semibold rounded shadow-sm hover:opacity-90 transition-opacity">Save</button>
        </div>
      </div>
      {/* Editor Content */}
      <div className="flex-1 p-10 overflow-y-auto custom-scrollbar flex flex-col items-center">
        <div className="max-w-3xl w-full">
          <h1 className="font-headline text-4xl font-extrabold text-slate-900 dark:text-white mb-6">Maine Vacation</h1>
          <div className="space-y-4 font-body leading-relaxed text-slate-700 dark:text-slate-300">
            <p>Our upcoming summer trip to the Northeast. We are focusing on coastal regions and local dining.</p>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">Options</h2>
            <ul className="list-disc ml-5 space-y-2">
              <li>Portland - Foodie hub with great breweries and harbor views.</li>
              <li>Acadia National Park - Hiking, Cadillac Mountain, and lobster rolls.</li>
              <li>Kennebunkport - Classic beach vibes and charming boutiques.</li>
            </ul>
            <div className="mt-8 p-4 bg-surface-container-low rounded-xl border border-outline-variant/20 italic text-slate-500 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary">auto_awesome</span>
              <span>Suggestion: Consider adding a section for car rental availability in July.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}