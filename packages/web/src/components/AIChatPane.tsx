export default function AIChatPane() {
  return (
    <aside className="w-80 bg-surface-container-low border-l border-slate-200 dark:border-slate-800 flex flex-col">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary">forum</span>
          <span className="font-headline font-bold text-slate-900 dark:text-white">AI Assistant</span>
        </div>
      </div>
      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
        {/* User Bubble */}
        <div className="self-end max-w-[90%] bg-surface-container-lowest p-3 rounded-2xl rounded-tr-none border border-outline-variant/20 shadow-sm">
          <p className="text-sm text-slate-800">What are the vacation options?</p>
        </div>
        {/* AI Response */}
        <div className="self-start max-w-[90%] bg-white dark:bg-slate-900 p-4 rounded-2xl rounded-tl-none shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-2 text-tertiary mb-1">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            <span className="text-[10px] uppercase font-bold tracking-tighter">AI Agent</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            There are 3 options:
          </p>
          <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-2 mt-1">
            <li className="flex gap-2"><strong>1.</strong> Portland: Urban exploration and seafood.</li>
            <li className="flex gap-2"><strong>2.</strong> Bar Harbor: Proximity to nature and trails.</li>
            <li className="flex gap-2"><strong>3.</strong> Ogunquit: Coastal walks and beaches.</li>
          </ol>
          <div className="mt-2 w-full h-32 rounded-lg overflow-hidden relative">
            <img alt="Maine lighthouse" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBfZwk1Bb7WBBrlLjj4L5lR8XiJsXaX6gdrZ2KRIz5ol5oaiEX5c2qMZGCPlOdKCLaCl7y_TPZ8hX-efLM3IxA2XeEFlWjq9rOhFE_HWttAs8m8afeyZ7_r97FV465VbkNmpzuatWSA3EJQWwamY8H2lzYEu4e2jy9nZkK6eYS4CE5E_KpH87vwwX1356jKU6YR4ZtA7oUPnaObz6gLl6FiQZLi3OBbot3LSFu0NBt-sEOJBa2Orw77RP620rRHyd_SxiLzgCE5CvA" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
            <span className="absolute bottom-2 left-2 text-[10px] text-white font-medium">Portland Head Light</span>
          </div>
        </div>
      </div>
      {/* Input Area */}
      <div className="p-4 bg-white/50 backdrop-blur-md border-t border-slate-200 dark:border-slate-800">
        <div className="relative">
          <textarea className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none h-24 custom-scrollbar" placeholder="Ask AI anything..."></textarea>
          <button type="button" className="absolute bottom-3 right-3 p-2 bg-primary text-white rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </div>
      </div>
    </aside>
  )
}