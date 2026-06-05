import { isValidElement, lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import { remarkCallouts } from "./remarkCallouts";
import type { EditorProps } from "./types";

const MermaidDiagram = lazy(() => import("./MermaidDiagram"));

const markdownClasses =
  "prose prose-slate max-w-none prose-img:rounded-lg prose-headings:font-sans prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-t-ink prose-a:text-t-accent prose-code:font-mono prose-code:bg-t-bg-well prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-t-bg-well prose-pre:font-mono";

export default function MarkdownSplitEditor({ content, onChange }: EditorProps) {
  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col border-r border-t-hair">
        <div className="px-4 py-2 bg-t-bg-well text-xs text-t-ink-dim uppercase tracking-wider font-mono border-b border-t-hair">
          Edit
        </div>
        <textarea
          className="flex-1 resize-none p-4 font-mono text-sm bg-t-bg text-t-ink focus:outline-none"
          value={content ?? ""}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 bg-t-bg-well text-xs text-t-ink-dim uppercase tracking-wider font-mono border-b border-t-hair">
          Preview
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <article className={markdownClasses}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath, remarkCallouts]}
              rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }], rehypeRaw, rehypeKatex]}
              components={{
                img: ({ ...props }) => (
                  <img
                    {...props}
                    className="max-w-full h-auto rounded-lg"
                    loading="lazy"
                    alt={props.alt ?? ""}
                  />
                ),
                pre: ({ children, ...props }) => {
                  const child = Array.isArray(children) ? children[0] : children;
                  if (
                    isValidElement(child) &&
                    (child.props as { className?: string }).className?.includes("language-mermaid")
                  ) {
                    const chart = String(
                      (child.props as { children?: unknown }).children ?? "",
                    ).trim();
                    return (
                      <Suspense fallback={null}>
                        <MermaidDiagram chart={chart} />
                      </Suspense>
                    );
                  }
                  return <pre {...props}>{children}</pre>;
                },
              }}
            >
              {content ?? ""}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}
