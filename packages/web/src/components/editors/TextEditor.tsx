import type { EditorProps } from './types'

export default function TextEditor({ content, onChange }: EditorProps) {
  return (
    <div className="h-full p-4">
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full font-mono text-sm text-on-surface bg-surface-container-low border border-outline-variant/20 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        spellCheck={false}
      />
    </div>
  )
}
