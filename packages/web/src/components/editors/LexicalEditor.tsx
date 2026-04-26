import { useCallback, useRef } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { TRANSFORMERS, $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { TABLE_TRANSFORMER } from './tableMarkdownTransformer'

const MD_TRANSFORMERS = [TABLE_TRANSFORMER, ...TRANSFORMERS]
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table'
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical'
import type { EditorState } from 'lexical'
import type { EditorProps } from './types'

const RICH_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, CodeHighlightNode, TableNode, TableCellNode, TableRowNode]

const RICH_THEME = {
  heading: {
    h1: 'text-3xl font-bold my-3',
    h2: 'text-2xl font-bold my-2',
    h3: 'text-xl font-semibold my-2',
    h4: 'text-lg font-semibold my-1',
    h5: 'text-base font-semibold my-1',
    h6: 'text-sm font-semibold my-1',
  },
  text: {
    bold: 'font-bold',
    italic: 'italic',
    strikethrough: 'line-through',
    underline: 'underline',
    code: 'font-mono bg-surface-container rounded px-1 text-sm',
  },
  list: {
    nested: { listitem: 'ml-4' },
    ol: 'list-decimal ml-6 my-2',
    ul: 'list-disc ml-6 my-2',
    listitem: 'my-0.5',
  },
  link: 'text-primary underline cursor-pointer',
  code: 'block font-mono bg-surface-container rounded p-3 my-2 text-sm overflow-x-auto whitespace-pre',
  quote: 'border-l-4 border-primary/40 pl-4 my-2 italic text-on-surface-variant',
  paragraph: 'my-1',
}

export interface LexicalEditorProps extends EditorProps {
  format: 'markdown' | 'text'
}

export default function LexicalEditor({ content, onChange, format }: LexicalEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const isMarkdown = format === 'markdown'

  const initialConfig = {
    namespace: 'ai-spaces-editor',
    theme: isMarkdown ? RICH_THEME : {},
    nodes: isMarkdown ? RICH_NODES : [],
    editorState: isMarkdown
      ? () => { $convertFromMarkdownString(content, MD_TRANSFORMERS) }
      : () => {
          const root = $getRoot()
          root.clear()
          for (const line of content.split('\n')) {
            const p = $createParagraphNode()
            if (line) p.append($createTextNode(line))
            root.append(p)
          }
        },
    onError: (error: Error) => console.error(error),
  }

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        if (isMarkdown) {
          onChangeRef.current($convertToMarkdownString(MD_TRANSFORMERS))
        } else {
          onChangeRef.current($getRoot().getTextContent())
        }
      })
    },
    [isMarkdown],
  )

  const placeholder = (
    <div className="absolute top-0 left-0 text-on-surface-variant pointer-events-none opacity-40 select-none">
      Start writing…
    </div>
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative h-full overflow-y-auto p-6 text-on-surface leading-relaxed">
        {isMarkdown ? (
          <RichTextPlugin
            contentEditable={<ContentEditable className="min-h-full outline-none" />}
            placeholder={placeholder}
            ErrorBoundary={LexicalErrorBoundary}
          />
        ) : (
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="min-h-full outline-none font-mono text-sm whitespace-pre-wrap" />
            }
            placeholder={placeholder}
            ErrorBoundary={LexicalErrorBoundary}
          />
        )}
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <HistoryPlugin />
        {isMarkdown && <MarkdownShortcutPlugin transformers={MD_TRANSFORMERS} />}
        {isMarkdown && <TablePlugin />}
      </div>
    </LexicalComposer>
  )
}
