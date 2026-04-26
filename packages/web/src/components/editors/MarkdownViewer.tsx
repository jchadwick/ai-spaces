import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import 'highlight.js/styles/github.css'
import type { ViewerProps } from './types'

const markdownClasses =
  'prose prose-slate max-w-none prose-img:rounded-lg prose-headings:font-display prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-on-surface prose-a:text-primary prose-code:font-mono prose-code:bg-surface-container prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-container-low prose-pre:font-mono'

export default function MarkdownViewer({ content }: ViewerProps) {
  if (content === null) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">description</span>
          <p className="text-body-md">Empty file</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 grow flex">
      <article className={markdownClasses}>
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
  )
}
