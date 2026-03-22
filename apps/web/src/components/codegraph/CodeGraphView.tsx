import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  MinusIcon,
  NetworkIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useCodeGraphStore } from "~/codeGraphStore";
import { useStore } from "~/store";
import {
  codeGraphAnalyzeQueryOptions,
  codeGraphSearchFunctionsQueryOptions,
} from "~/lib/codeGraphReactQuery";
import { generateMermaidSource } from "./mermaidGenerator";
import { MermaidRenderer } from "./MermaidRenderer";
import { CodeGraphFileTree } from "./CodeGraphFileTree";
import { CodeGraphEmptyState } from "./CodeGraphEmptyState";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { ScrollArea } from "~/components/ui/scroll-area";

export function CodeGraphView() {
  const projects = useStore((s) => s.projects);
  const {
    focusFunctionId,
    depth,
    groupByFile,
    selectedProjectCwd,
    navigationHistory,
    setDepth,
    setGroupByFile,
    setSelectedProjectCwd,
    pushNavigation,
    popNavigation,
  } = useCodeGraphStore();

  // Auto-select first project if none selected
  const activeCwd = selectedProjectCwd ?? projects[0]?.cwd ?? null;

  // ── Search overlay ────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  const searchQuery = useQuery(
    codeGraphSearchFunctionsQueryOptions({
      cwd: activeCwd,
      query: searchInput,
      limit: 20,
      enabled: searchOpen && searchInput.length > 0,
    }),
  );

  const handleSearchSelect = useCallback(
    (functionId: string) => {
      pushNavigation(functionId);
      setSearchOpen(false);
      setSearchInput("");
    },
    [pushNavigation],
  );

  // ── Graph data ────────────────────────────────────────────────
  const analyzeQuery = useQuery(
    codeGraphAnalyzeQueryOptions({
      cwd: activeCwd,
      focusFunctionId,
      depth,
    }),
  );

  const mermaidSource = useMemo(() => {
    const functions = analyzeQuery.data?.functions ?? [];
    if (functions.length === 0) return null;
    return generateMermaidSource(functions, {
      focusId: focusFunctionId,
      groupByFile,
      direction: "TD",
    });
  }, [analyzeQuery.data, focusFunctionId, groupByFile]);

  const canGoBack = navigationHistory.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
        <NetworkIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Code Graph</span>

        {/* Project selector */}
        {projects.length > 1 && (
          <div className="relative ml-2">
            <select
              value={activeCwd ?? ""}
              onChange={(e) => setSelectedProjectCwd(e.target.value || null)}
              className="h-7 rounded-md border border-border bg-background px-2 pr-6 text-xs"
            >
              {projects.map((p) => (
                <option key={p.cwd} value={p.cwd}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1" />

        {/* Search button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="size-3.5" />
          Search
        </Button>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* File tree — left panel */}
        {activeCwd && (
          <div className="w-[220px] shrink-0">
            <CodeGraphFileTree cwd={activeCwd} />
          </div>
        )}

        {/* Graph area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Controls bar */}
          {activeCwd && (
            <div className="flex items-center gap-3 border-b border-border px-3 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!canGoBack}
                onClick={popNavigation}
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>

              {focusFunctionId && (
                <span className="truncate text-xs text-muted-foreground">
                  Focused: <span className="font-mono text-foreground">{focusFunctionId.split("::").pop()}</span>
                </span>
              )}

              <div className="flex-1" />

              {/* Depth control */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Depth</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setDepth(depth - 1)}
                  disabled={depth <= 0}
                >
                  <MinusIcon className="size-3" />
                </Button>
                <span className="w-4 text-center text-xs font-medium">{depth}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setDepth(depth + 1)}
                  disabled={depth >= 5}
                >
                  <PlusIcon className="size-3" />
                </Button>
              </div>

              {/* Group by file toggle */}
              <div className="flex items-center gap-1.5">
                <LayoutGridIcon className="size-3.5 text-muted-foreground" />
                <Switch checked={groupByFile} onCheckedChange={setGroupByFile} />
              </div>
            </div>
          )}

          {/* Diagram */}
          <ScrollArea className="flex-1">
            {!activeCwd ? (
              <CodeGraphEmptyState hasProject={false} isLoading={false} />
            ) : analyzeQuery.isLoading && !analyzeQuery.data ? (
              <CodeGraphEmptyState hasProject={true} isLoading={true} />
            ) : mermaidSource ? (
              <div className="p-4">
                <MermaidRenderer source={mermaidSource} />
                {analyzeQuery.data?.truncated && (
                  <div className="mt-2 text-center text-xs text-muted-foreground">
                    Graph was truncated. Try reducing depth or focusing on a specific function.
                  </div>
                )}
                {analyzeQuery.data && (
                  <div className="mt-1 text-center text-xs text-muted-foreground">
                    {analyzeQuery.data.functions.length} functions from{" "}
                    {analyzeQuery.data.analyzedFiles} files
                  </div>
                )}
              </div>
            ) : (
              <CodeGraphEmptyState hasProject={true} isLoading={false} />
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh]"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <SearchIcon className="size-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search functions..."
                className="h-8 border-0 p-0 text-sm focus-visible:ring-0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    setSearchInput("");
                  }
                }}
              />
            </div>
            {searchInput.length > 0 && (
              <div className="max-h-[300px] overflow-y-auto p-1">
                {searchQuery.data?.functions.map((fn) => (
                  <button
                    key={fn.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => handleSearchSelect(fn.id)}
                  >
                    <span className="font-mono text-xs font-medium">{fn.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {fn.filePath}:{fn.lineNumber}
                    </span>
                  </button>
                ))}
                {searchQuery.data?.functions.length === 0 && !searchQuery.isLoading && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No functions found
                  </div>
                )}
                {searchQuery.isLoading && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Searching...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
