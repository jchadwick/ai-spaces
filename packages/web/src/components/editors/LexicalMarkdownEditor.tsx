import LexicalEditor from './LexicalEditor'
import type { EditorProps } from './types'

export default function LexicalMarkdownEditor(props: EditorProps) {
  return <LexicalEditor {...props} format="markdown" />
}
