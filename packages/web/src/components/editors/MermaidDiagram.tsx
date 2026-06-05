import mermaid from "mermaid";
import { useEffect, useState } from "react";

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });
}

interface Props {
  chart: string;
}

export default function MermaidDiagram({ chart }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureInitialized();
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let cancelled = false;

    mermaid
      .render(id, chart)
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) setSvg(renderedSvg);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-mono">
        Mermaid error: {error}
      </div>
    );
  }

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
