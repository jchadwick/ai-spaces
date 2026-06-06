import { createElement, type ComponentType, type JSX } from "react";
import type { Components, ExtraProps } from "react-markdown";
import { cn } from "@/lib/utils";

type MarkdownElementProps<T extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[T] &
  ExtraProps;

function withClass<T extends keyof JSX.IntrinsicElements>(
  Tag: T,
  baseClassName: string,
): ComponentType<MarkdownElementProps<T>> {
  return function MarkdownElement({ className, node: _node, ...props }) {
    return createElement(Tag, { ...props, className: cn(baseClassName, className) });
  };
}

export const markdownComponents: Components = {
  p: withClass("p", "my-1 font-sans text-[13.5px] leading-[1.55] text-t-ink"),
  h1: withClass("h1", "mb-1 mt-3 text-[15px] font-semibold text-t-ink"),
  h2: withClass("h2", "mb-1 mt-2 text-[13.5px] font-semibold text-t-ink"),
  h3: withClass("h3", "mb-0.5 mt-2 text-[12.5px] font-semibold text-t-ink"),
  ul: withClass("ul", "my-1 list-disc pl-4 text-[13.5px] text-t-ink"),
  ol: withClass("ol", "my-1 list-decimal pl-4 text-[13.5px] text-t-ink"),
  li: withClass("li", "leading-[1.55]"),
  strong: withClass("strong", "font-semibold text-t-ink"),
  em: withClass("em", "italic"),
  blockquote: withClass(
    "blockquote",
    "my-1 border-l-2 border-t-hair pl-3 text-[13.5px] italic text-t-ink-dim",
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("text-t-accent underline", className)}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-2 border-0 border-t border-t-hair", className)} {...props} />
  ),
  table: withClass("table", "my-2 w-full border-collapse font-sans text-[13px]"),
  th: withClass(
    "th",
    "border-b border-t-hair px-2.5 py-1 text-left text-xs font-semibold text-t-ink-dim",
  ),
  td: withClass("td", "border-b border-t-hair px-2.5 py-1 text-[13px] text-t-ink"),
  code: ({ className, ...props }) => {
    const isBlock = className?.startsWith("language-");

    return (
      <code
        className={cn(
          "font-mono text-xs text-t-ink",
          isBlock
            ? "block overflow-x-auto rounded-lg bg-t-bg-well px-3 py-2"
            : "rounded bg-t-bg-well px-1 py-px",
          className,
        )}
        {...props}
      />
    );
  },
  pre: withClass("pre", "my-2 overflow-x-auto"),
};
