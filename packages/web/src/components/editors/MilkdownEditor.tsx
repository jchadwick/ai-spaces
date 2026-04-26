import { useEffect, useRef } from 'react'
import { Editor } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { defaultValueCtx, rootCtx } from '@milkdown/core'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import type { EditorProps } from './types'

function MilkdownEditorInner({ content, onChange }: EditorProps) {
  const onChangeRef = useRef(onChange)
  const contentRef = useRef(content)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEditor(
    (root) => {
      return Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          ctx.set(defaultValueCtx, contentRef.current)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChangeRef.current(markdown)
          })
        })
        .use(commonmark)
        .use(listener)
    },
    []
  )

  return <Milkdown />
}

export default function MilkdownEditor({ content, onChange }: EditorProps) {
  return (
    <MilkdownProvider>
      <div className="h-full overflow-y-auto">
        <MilkdownEditorInner content={content} onChange={onChange} />
      </div>
    </MilkdownProvider>
  )
}
