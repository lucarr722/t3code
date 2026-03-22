import fs from "node:fs/promises";
import path from "node:path";

import { Effect, Layer } from "effect";

import type {
  CodeGraphAnalyzeInput,
  CodeGraphAnalyzeResult,
  CodeGraphSearchFunctionsInput,
  CodeGraphSearchFunctionsResult,
  CodeGraphFunctionNode,
} from "@t3tools/contracts";

import { CodeGraphAnalyzerError } from "../Errors.ts";
import { CodeGraphAnalyzer, type CodeGraphAnalyzerShape } from "../Services/CodeGraphAnalyzer.ts";
import {
  getHandlerForExtension,
  getSupportedExtensions,
  type ExtractedFunction,
  type LanguageHandler,
} from "./languageQueries.ts";

// ── Constants ───────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_KEYS = 2;
const MAX_SOURCE_FILES = 5_000;
const MAX_SUBGRAPH_NODES = 200;
const MAX_OVERVIEW_NODES = 15;
const SCAN_CONCURRENCY = 32;

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".mypy_cache",
  ".pytest_cache",
  ".tox",
  "egg-info",
]);

// ── Types ───────────────────────────────────────────────────────────

interface FunctionIndex {
  id: string;
  name: string;
  filePath: string;
  lineNumber: number;
  language: string;
  kind: ExtractedFunction["kind"];
  calls: string[]; // IDs
  calledBy: string[]; // IDs
  /** Raw call names before resolution — used during build phase only. */
  rawCallNames: string[];
  /** Degree = calls.length + calledBy.length — for ranking. */
  degree: number;
}

interface ProjectIndex {
  scannedAt: number;
  functions: Map<string, FunctionIndex>;
  /** Map from unqualified name → function IDs (for call resolution). */
  nameToIds: Map<string, string[]>;
  analyzedFiles: number;
  truncated: boolean;
}

// ── Cache ───────────────────────────────────────────────────────────

const projectCache = new Map<string, ProjectIndex>();
const inFlightBuilds = new Map<string, Promise<ProjectIndex>>();

function evictStaleCacheEntries(): void {
  const now = Date.now();
  for (const [key, index] of projectCache) {
    if (now - index.scannedAt > CACHE_TTL_MS) {
      projectCache.delete(key);
    }
  }
  // Evict oldest if over max
  while (projectCache.size > CACHE_MAX_KEYS) {
    const oldest = [...projectCache.entries()].sort((a, b) => a[1].scannedAt - b[1].scannedAt)[0];
    if (oldest) projectCache.delete(oldest[0]);
  }
}

// ── File Discovery ──────────────────────────────────────────────────

async function discoverSourceFiles(
  cwd: string,
  includePattern: string | undefined,
): Promise<string[]> {
  const supportedExts = new Set(getSupportedExtensions());
  const results: string[] = [];
  let fileCount = 0;

  async function walk(dir: string): Promise<void> {
    if (fileCount >= MAX_SOURCE_FILES) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const subdirs: string[] = [];
    for (const entry of entries) {
      if (fileCount >= MAX_SOURCE_FILES) break;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          subdirs.push(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (supportedExts.has(ext)) {
          const relativePath = path.relative(cwd, path.join(dir, entry.name));

          // Apply include pattern if specified (simple glob prefix match)
          if (includePattern && !relativePath.startsWith(includePattern.replace("/**", "").replace("/*", ""))) {
            continue;
          }

          results.push(relativePath);
          fileCount++;
        }
      }
    }

    // Process subdirectories with limited concurrency
    const batches: string[][] = [];
    for (let i = 0; i < subdirs.length; i += SCAN_CONCURRENCY) {
      batches.push(subdirs.slice(i, i + SCAN_CONCURRENCY));
    }
    for (const batch of batches) {
      await Promise.all(batch.map(walk));
    }
  }

  await walk(cwd);
  return results;
}

// ── Parsing ─────────────────────────────────────────────────────────

function makeFunctionId(filePath: string, name: string, line: number): string {
  return `${filePath}::${name}:${line}`;
}

interface ParsedFile {
  filePath: string;
  language: string;
  functions: ExtractedFunction[];
}

/** Lazily initialized web-tree-sitter Parser class. */
let ParserClass: typeof import("web-tree-sitter").Parser | null = null;

async function getParserClass() {
  if (!ParserClass) {
    const mod = await import("web-tree-sitter");
    ParserClass = mod.Parser;
    await ParserClass.init();
  }
  return ParserClass;
}

async function parseFile(
  cwd: string,
  relativePath: string,
  handler: LanguageHandler,
): Promise<ParsedFile | null> {
  const absolutePath = path.join(cwd, relativePath);
  let source: string;
  try {
    source = await fs.readFile(absolutePath, "utf-8");
  } catch {
    return null;
  }

  const Parser = await getParserClass();
  const parser = new Parser();
  parser.setLanguage(handler.grammar);
  const tree = parser.parse(source);
  if (!tree) return null;

  return {
    filePath: relativePath,
    language: handler.languageName,
    functions: handler.extractFunctions(tree.rootNode),
  };
}

// ── Index Building ──────────────────────────────────────────────────

async function buildProjectIndex(
  cwd: string,
  includePattern: string | undefined,
): Promise<ProjectIndex> {
  const files = await discoverSourceFiles(cwd, includePattern);
  const truncated = files.length >= MAX_SOURCE_FILES;

  // Parse all files
  const parsedFiles: ParsedFile[] = [];
  const batchSize = SCAN_CONCURRENCY;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (f) => {
        const ext = path.extname(f);
        const handler = await getHandlerForExtension(ext);
        if (!handler) return null;
        return parseFile(cwd, f, handler);
      }),
    );
    for (const r of results) {
      if (r) parsedFiles.push(r);
    }
  }

  // Build function index
  const functions = new Map<string, FunctionIndex>();
  const nameToIds = new Map<string, string[]>();

  for (const file of parsedFiles) {
    for (const func of file.functions) {
      const id = makeFunctionId(file.filePath, func.name, func.startLine);
      const entry: FunctionIndex = {
        id,
        name: func.name,
        filePath: file.filePath,
        lineNumber: func.startLine,
        language: file.language,
        kind: func.kind,
        calls: [],
        calledBy: [],
        rawCallNames: func.callNames,
        degree: 0,
      };
      functions.set(id, entry);

      // Index by simple name for resolution
      const simpleName = func.name.includes(".") ? func.name.split(".").pop()! : func.name;
      const existing = nameToIds.get(simpleName) ?? [];
      existing.push(id);
      nameToIds.set(simpleName, existing);

      // Also index by full qualified name
      if (func.name.includes(".")) {
        const full = nameToIds.get(func.name) ?? [];
        full.push(id);
        nameToIds.set(func.name, full);
      }
    }
  }

  // Resolve calls → build adjacency
  for (const [, func] of functions) {
    for (const callName of func.rawCallNames) {
      const targetIds = nameToIds.get(callName);
      if (!targetIds) continue;

      for (const targetId of targetIds) {
        if (targetId === func.id) continue; // skip self-calls
        if (!func.calls.includes(targetId)) {
          func.calls.push(targetId);
        }
        const target = functions.get(targetId);
        if (target && !target.calledBy.includes(func.id)) {
          target.calledBy.push(func.id);
        }
      }
    }

    // Update degree
    func.degree = func.calls.length + func.calledBy.length;
  }

  return {
    scannedAt: Date.now(),
    functions,
    nameToIds,
    analyzedFiles: parsedFiles.length,
    truncated,
  };
}

async function getOrBuildIndex(
  cwd: string,
  includePattern: string | undefined,
): Promise<ProjectIndex> {
  evictStaleCacheEntries();

  const cacheKey = `${cwd}:${includePattern ?? "*"}`;
  const cached = projectCache.get(cacheKey);
  if (cached && Date.now() - cached.scannedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Deduplicate in-flight builds
  const inflight = inFlightBuilds.get(cacheKey);
  if (inflight) return inflight;

  const buildPromise = buildProjectIndex(cwd, includePattern).then((index) => {
    projectCache.set(cacheKey, index);
    inFlightBuilds.delete(cacheKey);
    return index;
  });
  inFlightBuilds.set(cacheKey, buildPromise);
  return buildPromise;
}

// ── Subgraph Extraction ─────────────────────────────────────────────

function extractSubgraph(
  index: ProjectIndex,
  focusId: string,
  depth: number,
): { nodes: FunctionIndex[]; truncated: boolean } {
  const visited = new Set<string>();
  const queue: Array<{ id: string; level: number }> = [{ id: focusId, level: 0 }];
  visited.add(focusId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.level >= depth) continue;
    if (visited.size >= MAX_SUBGRAPH_NODES) break;

    const func = index.functions.get(current.id);
    if (!func) continue;

    for (const neighborId of [...func.calls, ...func.calledBy]) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, level: current.level + 1 });
      if (visited.size >= MAX_SUBGRAPH_NODES) break;
    }
  }

  const nodes: FunctionIndex[] = [];
  for (const id of visited) {
    const func = index.functions.get(id);
    if (func) nodes.push(func);
  }

  return { nodes, truncated: visited.size >= MAX_SUBGRAPH_NODES };
}

function getOverviewNodes(index: ProjectIndex): FunctionIndex[] {
  const sorted = [...index.functions.values()]
    .filter((f) => f.degree > 0)
    .sort((a, b) => b.degree - a.degree);
  return sorted.slice(0, MAX_OVERVIEW_NODES);
}

// ── Convert to contract types ───────────────────────────────────────

function toFunctionNode(func: FunctionIndex, visibleIds: Set<string>): CodeGraphFunctionNode {
  return {
    id: func.id,
    name: func.name,
    filePath: func.filePath,
    lineNumber: func.lineNumber,
    language: func.language,
    kind: func.kind,
    // Only include edges to nodes that are in the visible subgraph
    calls: func.calls.filter((id) => visibleIds.has(id)),
    calledBy: func.calledBy.filter((id) => visibleIds.has(id)),
  } as CodeGraphFunctionNode;
}

// ── Fuzzy search scoring ────────────────────────────────────────────

function scoreSubsequenceMatch(value: string, query: string): number | null {
  if (!query) return 0;
  const lowerValue = value.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let queryIndex = 0;
  let firstMatchIndex = -1;
  let previousMatchIndex = -1;
  let gapPenalty = 0;

  for (let valueIndex = 0; valueIndex < lowerValue.length; valueIndex++) {
    if (lowerValue[valueIndex] !== lowerQuery[queryIndex]) continue;

    if (firstMatchIndex === -1) firstMatchIndex = valueIndex;
    if (previousMatchIndex !== -1) gapPenalty += valueIndex - previousMatchIndex - 1;

    previousMatchIndex = valueIndex;
    queryIndex++;
    if (queryIndex === lowerQuery.length) {
      const spanPenalty = valueIndex - firstMatchIndex + 1 - lowerQuery.length;
      const lengthPenalty = Math.min(64, lowerValue.length - lowerQuery.length);
      return firstMatchIndex * 2 + gapPenalty * 3 + spanPenalty + lengthPenalty;
    }
  }
  return null;
}

// ── Service Implementation ──────────────────────────────────────────

const makeCodeGraphAnalyzer = Effect.gen(function* () {
  const analyze = Effect.fnUntraced(function* (input: CodeGraphAnalyzeInput) {
    const index = yield* Effect.tryPromise({
      try: () => getOrBuildIndex(input.cwd, input.focusFunctionId ? undefined : input.includePattern),
      catch: (cause) =>
        new CodeGraphAnalyzerError({
          operation: "analyze",
          detail: `Failed to build project index: ${String(cause)}`,
          cause: cause instanceof Error ? cause : undefined,
        }),
    });

    let nodes: FunctionIndex[];
    let truncated = index.truncated;
    let focusId: string | undefined;

    if (input.focusFunctionId) {
      // Subgraph centered on the focus function
      const result = extractSubgraph(index, input.focusFunctionId, input.depth);
      nodes = result.nodes;
      truncated = truncated || result.truncated;
      focusId = input.focusFunctionId;
    } else if (input.depth === 0) {
      // Overview mode: return most-connected functions
      nodes = getOverviewNodes(index);
    } else {
      // No focus, positive depth: return overview
      nodes = getOverviewNodes(index);
    }

    const visibleIds = new Set(nodes.map((n) => n.id));
    const functions = nodes.map((n) => toFunctionNode(n, visibleIds));

    return {
      functions,
      focusId,
      truncated,
      analyzedFiles: index.analyzedFiles,
    } as CodeGraphAnalyzeResult;
  });

  const searchFunctions = Effect.fnUntraced(function* (input: CodeGraphSearchFunctionsInput) {
    const index = yield* Effect.tryPromise({
      try: () => getOrBuildIndex(input.cwd, undefined),
      catch: (cause) =>
        new CodeGraphAnalyzerError({
          operation: "searchFunctions",
          detail: `Failed to build project index: ${String(cause)}`,
          cause: cause instanceof Error ? cause : undefined,
        }),
    });

    const query = input.query.trim().toLowerCase();
    const scored: Array<{ func: FunctionIndex; score: number }> = [];

    for (const [, func] of index.functions) {
      // Score against function name
      const nameScore = scoreSubsequenceMatch(func.name, query);
      if (nameScore !== null) {
        scored.push({ func, score: nameScore });
        continue;
      }
      // Also try matching against filePath::name
      const fullScore = scoreSubsequenceMatch(`${func.filePath}::${func.name}`, query);
      if (fullScore !== null) {
        scored.push({ func, score: fullScore + 100 }); // Penalize path matches slightly
      }
    }

    scored.sort((a, b) => a.score - b.score);
    const limited = scored.slice(0, input.limit);

    return {
      functions: limited.map(({ func }) => ({
        id: func.id,
        name: func.name,
        filePath: func.filePath,
        lineNumber: func.lineNumber,
        language: func.language,
        kind: func.kind,
      })),
      truncated: scored.length > input.limit,
    } as CodeGraphSearchFunctionsResult;
  });

  return { analyze, searchFunctions } satisfies CodeGraphAnalyzerShape;
});

export const CodeGraphAnalyzerLive = Layer.effect(CodeGraphAnalyzer, makeCodeGraphAnalyzer);
