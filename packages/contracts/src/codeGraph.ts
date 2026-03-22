import { Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

// ── Constants ───────────────────────────────────────────────────────

const CODE_GRAPH_MAX_DEPTH = 5;
const CODE_GRAPH_SEARCH_MAX_LIMIT = 100;
const CODE_GRAPH_SEARCH_QUERY_MAX_LENGTH = 256;

// ── Analyze ─────────────────────────────────────────────────────────

export const CodeGraphAnalyzeInput = Schema.Struct({
  /** Workspace root of the project to analyze. */
  cwd: TrimmedNonEmptyString,
  /** When set, the returned subgraph is centered on this function. When omitted with depth 0, returns the most-connected overview. */
  focusFunctionId: Schema.optional(TrimmedNonEmptyString),
  /** How many levels of callers/callees to walk from the focus function. */
  depth: NonNegativeInt.check(Schema.isLessThanOrEqualTo(CODE_GRAPH_MAX_DEPTH)),
  /** Optional glob pattern to restrict which files are analyzed (e.g. "src/models/**"). */
  includePattern: Schema.optional(TrimmedNonEmptyString),
});
export type CodeGraphAnalyzeInput = typeof CodeGraphAnalyzeInput.Type;

const FunctionKind = Schema.Literals(["function", "method", "arrow", "constructor", "class"]);

export const CodeGraphFunctionNode = Schema.Struct({
  /** Stable identifier: "relativePath::functionName:lineNumber" */
  id: TrimmedNonEmptyString,
  /** Function or method name. */
  name: TrimmedNonEmptyString,
  /** Relative file path within the project. */
  filePath: TrimmedNonEmptyString,
  /** 0-based line number where the function is defined. */
  lineNumber: NonNegativeInt,
  /** Source language. */
  language: TrimmedNonEmptyString,
  /** Kind of declaration. */
  kind: FunctionKind,
  /** IDs of functions this function calls. */
  calls: Schema.Array(TrimmedNonEmptyString),
  /** IDs of functions that call this function. */
  calledBy: Schema.Array(TrimmedNonEmptyString),
});
export type CodeGraphFunctionNode = typeof CodeGraphFunctionNode.Type;

export const CodeGraphAnalyzeResult = Schema.Struct({
  /** Function nodes in the (sub)graph. */
  functions: Schema.Array(CodeGraphFunctionNode),
  /** The function the graph is centered on, if any. */
  focusId: Schema.optional(TrimmedNonEmptyString),
  /** True when the result was capped and does not include all reachable nodes. */
  truncated: Schema.Boolean,
  /** Number of source files that were analyzed. */
  analyzedFiles: NonNegativeInt,
});
export type CodeGraphAnalyzeResult = typeof CodeGraphAnalyzeResult.Type;

// ── Search Functions ────────────────────────────────────────────────

export const CodeGraphSearchFunctionsInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(CODE_GRAPH_SEARCH_QUERY_MAX_LENGTH)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(CODE_GRAPH_SEARCH_MAX_LIMIT)),
});
export type CodeGraphSearchFunctionsInput = typeof CodeGraphSearchFunctionsInput.Type;

const CodeGraphFunctionSummary = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  filePath: TrimmedNonEmptyString,
  lineNumber: NonNegativeInt,
  language: TrimmedNonEmptyString,
  kind: FunctionKind,
});
export type CodeGraphFunctionSummary = typeof CodeGraphFunctionSummary.Type;

export const CodeGraphSearchFunctionsResult = Schema.Struct({
  functions: Schema.Array(CodeGraphFunctionSummary),
  truncated: Schema.Boolean,
});
export type CodeGraphSearchFunctionsResult = typeof CodeGraphSearchFunctionsResult.Type;
