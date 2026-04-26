import LexicalEditor from './LexicalEditor'
import type { EditorProps } from './types'

export default function LexicalTextEditor(props: EditorProps) {
  return <LexicalEditor {...props} format="text" />
}
