import type { CodeGraphAnalyzeResult, CodeGraphSearchFunctionsResult } from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const codeGraphQueryKeys = {
  all: ["codeGraph"] as const,
  analyze: (cwd: string | null, focusId: string | null, depth: number) =>
    ["codeGraph", "analyze", cwd, focusId, depth] as const,
  searchFunctions: (cwd: string | null, query: string, limit: number) =>
    ["codeGraph", "searchFunctions", cwd, query, limit] as const,
};

const DEFAULT_STALE_TIME = 30_000;
const DEFAULT_SEARCH_LIMIT = 50;

const EMPTY_ANALYZE_RESULT: CodeGraphAnalyzeResult = {
  functions: [],
  truncated: false,
  analyzedFiles: 0,
};

const EMPTY_SEARCH_RESULT: CodeGraphSearchFunctionsResult = {
  functions: [],
  truncated: false,
};

export function codeGraphAnalyzeQueryOptions(input: {
  cwd: string | null;
  focusFunctionId: string | null;
  depth: number;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: codeGraphQueryKeys.analyze(input.cwd, input.focusFunctionId, input.depth),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Code graph analysis requires a workspace.");
      }
      return api.codeGraph.analyze({
        cwd: input.cwd,
        depth: input.depth,
        ...(input.focusFunctionId ? { focusFunctionId: input.focusFunctionId } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_ANALYZE_RESULT,
  });
}

export function codeGraphSearchFunctionsQueryOptions(input: {
  cwd: string | null;
  query: string;
  limit?: number;
  enabled?: boolean;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  return queryOptions({
    queryKey: codeGraphQueryKeys.searchFunctions(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Function search requires a workspace.");
      }
      return api.codeGraph.searchFunctions({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_RESULT,
  });
}
