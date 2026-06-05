import { isValidElement, lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import type { Element } from "hast";
import { remarkCallouts } from "./remarkCallouts";
import type { ViewerProps } from "./types";

const MermaidDiagram = lazy(() => import("./MermaidDiagram"));

type CalloutType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const CALLOUT_LABELS: Record<CalloutType, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

const CALLOUT_CLASSES: Record<CalloutType, string> = {
  NOTE: "bg-t-bg-well border-t-hair text-t-ink-mid",
  TIP: "bg-green-50 border-green-500 text-green-700",
  IMPORTANT: "bg-t-accent-soft border-t-accent text-t-accent-ink",
  WARNING: "bg-amber-50 border-amber-500 text-amber-700",
  CAUTION: "bg-amber-50 border-amber-500 text-amber-700",
};

const markdownClasses =
  "prose prose-slate max-w-none prose-img:rounded-lg prose-headings:font-sans prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-t-ink prose-a:text-t-accent prose-code:font-mono prose-code:bg-t-bg-well prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-t-bg-well prose-pre:font-mono";

export default function MarkdownViewer({ content }: ViewerProps) {
  if (content === null) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-t-ink-dim">
          <span className="material-symbols-outlined text-4xl">description</span>
          <p className="text-body-md">Empty file</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-[10px] grow flex">
      <article className={markdownClasses}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkCallouts]}
          rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }], rehypeRaw, rehypeKatex]}
          components={{
            img: ({ ...props }) => (
              <img
                {...props}
                className="max-w-full h-auto rounded-lg shadow-ambient"
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
                const chart = String((child.props as { children?: unknown }).children ?? "").trim();
                return (
                  <Suspense fallback={null}>
                    <MermaidDiagram chart={chart} />
                  </Suspense>
                );
              }
              return <pre {...props}>{children}</pre>;
            },
            blockquote: ({ children, node, ...props }) => {
              const calloutType = (node as Element | undefined)?.properties?.["data-callout"] as
                | CalloutType
                | undefined;
              if (!calloutType || !CALLOUT_CLASSES[calloutType]) {
                return <blockquote {...props}>{children}</blockquote>;
              }
              return (
                <div
                  className={`not-prose my-4 rounded-r border-l-[3px] px-4 py-3 ${CALLOUT_CLASSES[calloutType]}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide">
                    {CALLOUT_LABELS[calloutType]}
                  </p>
                  <div>{children}</div>
                </div>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
