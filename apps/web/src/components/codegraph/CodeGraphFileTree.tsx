import { memo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, FileIcon, FunctionSquareIcon, SearchIcon } from "lucide-react";
import { codeGraphSearchFunctionsQueryOptions } from "~/lib/codeGraphReactQuery";
import { projectSearchEntriesQueryOptions } from "~/lib/projectReactQuery";
import { useCodeGraphStore } from "~/codeGraphStore";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";

interface CodeGraphFileTreeProps {
  cwd: string;
}

const SUPPORTED_EXTENSIONS = new Set([".py", ".ts", ".tsx", ".js", ".jsx"]);

function isSupported(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return SUPPORTED_EXTENSIONS.has(ext);
}

export const CodeGraphFileTree = memo(function CodeGraphFileTree({ cwd }: CodeGraphFileTreeProps) {
  const [fileQuery, setFileQuery] = useState("");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const focusFunctionId = useCodeGraphStore((s) => s.focusFunctionId);
  const pushNavigation = useCodeGraphStore((s) => s.pushNavigation);

  const filesQuery = useQuery(
    projectSearchEntriesQueryOptions({
      cwd,
      query: fileQuery || ".",
      limit: 200,
      staleTime: 30_000,
    }),
  );

  const functionsQuery = useQuery(
    codeGraphSearchFunctionsQueryOptions({
      cwd,
      query: expandedFile ?? "",
      limit: 100,
      enabled: expandedFile !== null,
    }),
  );

  const handleFileClick = useCallback(
    (filePath: string) => {
      setExpandedFile((prev) => (prev === filePath ? null : filePath));
    },
    [],
  );

  const handleFunctionClick = useCallback(
    (functionId: string) => {
      pushNavigation(functionId);
    },
    [pushNavigation],
  );

  const files = (filesQuery.data?.entries ?? []).filter(
    (e) => e.kind === "file" && isSupported(e.path),
  );

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="border-b border-border p-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
            placeholder="Filter files..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {files.map((file) => (
            <div key={file.path}>
              <button
                type="button"
                onClick={() => handleFileClick(file.path)}
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs hover:bg-accent"
              >
                <ChevronRightIcon
                  className={`size-3 shrink-0 transition-transform ${expandedFile === file.path ? "rotate-90" : ""}`}
                />
                <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.path}</span>
              </button>
              {expandedFile === file.path && (
                <div className="ml-5 border-l border-border pl-2">
                  {functionsQuery.isLoading && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">Loading...</div>
                  )}
                  {functionsQuery.data?.functions.map((fn) => (
                    <button
                      key={fn.id}
                      type="button"
                      onClick={() => handleFunctionClick(fn.id)}
                      className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-0.5 text-left text-xs hover:bg-accent ${
                        focusFunctionId === fn.id ? "bg-accent font-medium text-accent-foreground" : ""
                      }`}
                    >
                      <FunctionSquareIcon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{fn.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        :{fn.lineNumber}
                      </span>
                    </button>
                  ))}
                  {functionsQuery.data?.functions.length === 0 && !functionsQuery.isLoading && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">No functions</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {files.length === 0 && !filesQuery.isLoading && (
            <div className="p-4 text-center text-xs text-muted-foreground">No matching files</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
