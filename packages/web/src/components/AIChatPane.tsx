import { useState } from 'react'

export default function AIChatPane() {
  const [inputValue, setInputValue] = useState('')

  return (
    <aside className="w-80 bg-surface-container-low border-l border-outline-variant/20 flex flex-col">
      <div className="p-md border-b border-outline-variant/20">
        <h3 className="font-display text-title-sm text-on-surface font-bold">AI Assistant</h3>
      </div>
      <div className="flex-1 p-md overflow-y-auto">
        <div className="bg-surface-container-lowest p-md rounded-2xl shadow-sm">
          <p className="text-body-sm text-on-surface-variant">Ask questions about this space...</p>
        </div>
      </div>
      <div className="p-md border-t border-outline-variant/20">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-sm py-xs text-body-sm resize-none h-16"
          placeholder="Ask AI anything..."
        />
      </div>
    </aside>
  )
}