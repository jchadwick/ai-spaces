import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import MDEditor from '@uiw/react-md-editor'
import type { EditorProps } from './types'

const markdownClasses =
  'prose prose-slate max-w-none prose-img:rounded-lg prose-headings:font-display prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-on-surface prose-a:text-primary prose-code:font-mono prose-code:bg-surface-container prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-container-low prose-pre:font-mono'

export default function MarkdownSplitEditor({ content, onChange }: EditorProps) {
  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col border-r border-outline-variant/20">
        <div className="px-4 py-2 bg-surface-container text-xs text-on-surface-variant uppercase tracking-wider font-medium border-b border-outline-variant/20">
          Edit
        </div>
        <div className="flex-1 overflow-hidden">
          <MDEditor
            value={content}
            onChange={(val) => onChange(val || '')}
            preview="edit"
            height={500}
            visibleDragbar={false}
            hideToolbar={true}
          />
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 bg-surface-container text-xs text-on-surface-variant uppercase tracking-wider font-medium border-b border-outline-variant/20">
          Preview
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <article className={`${markdownClasses} p-8`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, rehypeRaw]}
              components={{
                img: ({ ...props }) => (
                  <img
                    {...props}
                    className="max-w-full h-auto rounded-lg shadow-ambient"
                    loading="lazy"
                    alt={props.alt || ''}
                  />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  )
}
