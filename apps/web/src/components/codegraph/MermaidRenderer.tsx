import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "~/hooks/useTheme";
import { useCodeGraphStore } from "~/codeGraphStore";

interface MermaidRendererProps {
  source: string;
}

let mermaidModule: typeof import("mermaid") | null = null;
let renderCounter = 0;

export const MermaidRenderer = memo(function MermaidRenderer({ source }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pushNavigation = useCodeGraphStore((s) => s.pushNavigation);

  // Register global click callback
  const pushNavigationRef = useRef(pushNavigation);
  pushNavigationRef.current = pushNavigation;

  useEffect(() => {
    (window as any).__t3_codegraph_click = (functionId: string) => {
      pushNavigationRef.current(functionId);
    };
    return () => {
      delete (window as any).__t3_codegraph_click;
    };
  }, []);

  const renderDiagram = useCallback(
    async (diagramSource: string, theme: string) => {
      try {
        setLoading(true);
        setError(null);

        if (!mermaidModule) {
          mermaidModule = await import("mermaid");
        }

        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "loose",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: "basis",
          },
        });

        renderCounter += 1;
        const id = `codegraph-svg-${renderCounter}`;
        const { svg } = await mermaid.render(id, diagramSource);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (source) {
      void renderDiagram(source, resolvedTheme);
    }
  }, [source, resolvedTheme, renderDiagram]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-destructive">
        Failed to render diagram: {error}
      </div>
    );
  }

  return (
    <div className="relative min-h-[200px] w-full overflow-auto">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Rendering graph...</div>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex items-center justify-center [&_svg]:max-w-full [&_.node]:cursor-pointer"
      />
    </div>
  );
});
