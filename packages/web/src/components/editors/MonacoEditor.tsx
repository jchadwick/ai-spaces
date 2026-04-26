import Editor from '@monaco-editor/react'
import type { EditorProps } from './types'

export default function MonacoEditor({ content, onChange }: EditorProps) {
  return (
    <div className="h-full">
      <Editor
        height="100%"
        language="json"
        theme="vs"
        value={content}
        onChange={(value) => onChange(value ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
      />
    </div>
  )
}
