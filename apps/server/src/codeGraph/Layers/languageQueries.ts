/**
 * Tree-sitter language grammars and AST node extraction logic per language.
 *
 * Uses web-tree-sitter (WASM) for Bun compatibility.
 *
 * Each language defines how to:
 * 1. Find function/method definitions
 * 2. Find call expressions within a function body
 * 3. Parse import statements for cross-file resolution
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// web-tree-sitter 0.24.x: CJS default export is the Parser class.
// Parser.Language is available only after Parser.init().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLanguage = any;

export type FunctionKind = "function" | "method" | "arrow" | "constructor" | "class";

export interface ExtractedFunction {
  name: string;
  kind: FunctionKind;
  startLine: number;
  endLine: number;
  /** Raw call names found inside this function body. */
  callNames: string[];
}

export interface ExtractedImport {
  /** The local name this import is bound to (e.g. "bar" from "from foo import bar"). */
  localName: string;
  /** The module/file path being imported. */
  modulePath: string;
  /** The original exported name if different from localName (e.g. aliases). */
  originalName: string | null;
}

export interface LanguageHandler {
  grammar: TSLanguage;
  extensions: string[];
  languageName: string;
  extractFunctions(rootNode: TSNode): ExtractedFunction[];
  extractImports(rootNode: TSNode): ExtractedImport[];
}

// ── Helpers ─────────────────────────────────────────────────────────

function collectNodesByType(node: TSNode, types: string[]): TSNode[] {
  const results: TSNode[] = [];
  const stack: TSNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (types.includes(current.type)) {
      results.push(current);
    }
    for (let i = current.childCount - 1; i >= 0; i--) {
      const child = current.child(i);
      if (child) stack.push(child);
    }
  }
  return results;
}

function getChildByField(node: TSNode, field: string): TSNode | null {
  return node.childForFieldName(field);
}

function extractCallNamesFromBody(bodyNode: TSNode | null, callNodeType: string): string[] {
  if (!bodyNode) return [];
  const calls = collectNodesByType(bodyNode, [callNodeType]);
  const names: string[] = [];
  for (const call of calls) {
    const funcNode = call.childForFieldName("function");
    if (!funcNode) continue;

    if (funcNode.type === "identifier") {
      names.push(funcNode.text);
    } else if (funcNode.type === "attribute" || funcNode.type === "member_expression") {
      // e.g. self.method() or obj.method()
      const attr =
        funcNode.childForFieldName("attribute") ?? funcNode.childForFieldName("property");
      if (attr) names.push(attr.text);
    }
  }
  return names;
}

// ── Extraction logic (shared between languages) ─────────────────────

function makePythonExtractors() {
  return {
    extractFunctions(rootNode: TSNode): ExtractedFunction[] {
      const results: ExtractedFunction[] = [];
      const classDefs = collectNodesByType(rootNode, ["class_definition"]);
      const allFuncDefs = collectNodesByType(rootNode, ["function_definition"]);

      const methodNodes = new Set<number>();
      for (const cls of classDefs) {
        const className = getChildByField(cls, "name")?.text ?? "UnknownClass";
        const body = getChildByField(cls, "body");
        if (!body) continue;

        for (const child of body.children) {
          if (child.type === "function_definition") {
            const methodName = getChildByField(child, "name")?.text ?? "unknown";
            const methodBody = getChildByField(child, "body");
            methodNodes.add(child.id);
            results.push({
              name: `${className}.${methodName}`,
              kind: methodName === "__init__" ? "constructor" : "method",
              startLine: child.startPosition.row,
              endLine: child.endPosition.row,
              callNames: extractCallNamesFromBody(methodBody, "call"),
            });
          }
        }

        results.push({
          name: className,
          kind: "class",
          startLine: cls.startPosition.row,
          endLine: cls.endPosition.row,
          callNames: [],
        });
      }

      for (const func of allFuncDefs) {
        if (methodNodes.has(func.id)) continue;
        const funcName = getChildByField(func, "name")?.text ?? "unknown";
        const funcBody = getChildByField(func, "body");
        results.push({
          name: funcName,
          kind: "function",
          startLine: func.startPosition.row,
          endLine: func.endPosition.row,
          callNames: extractCallNamesFromBody(funcBody, "call"),
        });
      }

      return results;
    },

    extractImports(rootNode: TSNode): ExtractedImport[] {
      const results: ExtractedImport[] = [];

      for (const node of collectNodesByType(rootNode, ["import_statement"])) {
        for (const child of node.children) {
          if (child.type === "dotted_name") {
            results.push({ localName: child.text, modulePath: child.text, originalName: null });
          } else if (child.type === "aliased_import") {
            const name = getChildByField(child, "name")?.text ?? "";
            const alias = getChildByField(child, "alias")?.text ?? name;
            results.push({ localName: alias, modulePath: name, originalName: name });
          }
        }
      }

      for (const node of collectNodesByType(rootNode, ["import_from_statement"])) {
        const moduleName = getChildByField(node, "module_name")?.text ?? "";
        for (const child of node.children) {
          if (child.type === "dotted_name" && child !== node.childForFieldName("module_name")) {
            results.push({
              localName: child.text,
              modulePath: moduleName,
              originalName: child.text,
            });
          } else if (child.type === "aliased_import") {
            const name = getChildByField(child, "name")?.text ?? "";
            const alias = getChildByField(child, "alias")?.text ?? name;
            results.push({ localName: alias, modulePath: moduleName, originalName: name });
          }
        }
      }

      return results;
    },
  };
}

function makeTsJsExtractors() {
  return {
    extractFunctions(rootNode: TSNode): ExtractedFunction[] {
      const results: ExtractedFunction[] = [];

      const classDefs = collectNodesByType(rootNode, ["class_declaration"]);
      const methodNodes = new Set<number>();
      for (const cls of classDefs) {
        const className = getChildByField(cls, "name")?.text ?? "UnknownClass";
        const body = getChildByField(cls, "body");
        if (!body) continue;

        for (const child of body.children) {
          if (child.type === "method_definition") {
            const methodName = getChildByField(child, "name")?.text ?? "unknown";
            const methodBody = getChildByField(child, "body");
            methodNodes.add(child.id);
            results.push({
              name: `${className}.${methodName}`,
              kind: methodName === "constructor" ? "constructor" : "method",
              startLine: child.startPosition.row,
              endLine: child.endPosition.row,
              callNames: extractCallNamesFromBody(methodBody, "call_expression"),
            });
          }
        }

        results.push({
          name: className,
          kind: "class",
          startLine: cls.startPosition.row,
          endLine: cls.endPosition.row,
          callNames: [],
        });
      }

      for (const func of collectNodesByType(rootNode, ["function_declaration"])) {
        const funcName = getChildByField(func, "name")?.text ?? "unknown";
        const funcBody = getChildByField(func, "body");
        results.push({
          name: funcName,
          kind: "function",
          startLine: func.startPosition.row,
          endLine: func.endPosition.row,
          callNames: extractCallNamesFromBody(funcBody, "call_expression"),
        });
      }

      for (const decl of collectNodesByType(rootNode, ["lexical_declaration"])) {
        for (const declarator of collectNodesByType(decl, ["variable_declarator"])) {
          const nameNode = getChildByField(declarator, "name");
          const valueNode = getChildByField(declarator, "value");
          if (nameNode && valueNode?.type === "arrow_function") {
            const arrowBody = getChildByField(valueNode, "body");
            results.push({
              name: nameNode.text,
              kind: "arrow",
              startLine: declarator.startPosition.row,
              endLine: declarator.endPosition.row,
              callNames: extractCallNamesFromBody(arrowBody, "call_expression"),
            });
          }
        }
      }

      return results;
    },

    extractImports(rootNode: TSNode): ExtractedImport[] {
      const results: ExtractedImport[] = [];

      for (const node of collectNodesByType(rootNode, ["import_statement"])) {
        const source = getChildByField(node, "source")?.text?.replace(/['"]/g, "") ?? "";
        const clause = node.children.find((c: TSNode) => c.type === "import_clause");
        if (!clause) continue;

        for (const child of clause.children) {
          if (child.type === "identifier") {
            results.push({ localName: child.text, modulePath: source, originalName: "default" });
          } else if (child.type === "named_imports") {
            for (const spec of child.children) {
              if (spec.type === "import_specifier") {
                const name = getChildByField(spec, "name")?.text ?? "";
                const alias = getChildByField(spec, "alias")?.text ?? name;
                results.push({ localName: alias, modulePath: source, originalName: name });
              }
            }
          }
        }
      }

      return results;
    },
  };
}

// ── WASM grammar loading ────────────────────────────────────────────

function resolveWasmPath(grammarName: string): string {
  const { join, dirname } = require("node:path");
  return join(
    dirname(require.resolve("tree-sitter-wasms/package.json")),
    "out",
    `tree-sitter-${grammarName}.wasm`,
  );
}

let _handlersPromise: Promise<LanguageHandler[]> | null = null;

export async function getLanguageHandlers(): Promise<LanguageHandler[]> {
  if (!_handlersPromise) {
    _handlersPromise = loadLanguageHandlers();
  }
  return _handlersPromise;
}

async function loadLanguageHandlers(): Promise<LanguageHandler[]> {
  // web-tree-sitter 0.24.x: resolve the Parser constructor from whatever shape the module exports.
  const mod = await import("web-tree-sitter");
  const candidate = (mod as any).default ?? mod;
  const Parser = typeof candidate === "function" ? candidate : (candidate as any).default;
  if (typeof Parser !== "function") {
    throw new Error("[codeGraph] Failed to resolve Parser from web-tree-sitter");
  }
  await Parser.init();

  const Language = Parser.Language;
  const [pythonLang, tsLang, jsLang] = await Promise.all([
    Language.load(resolveWasmPath("python")),
    Language.load(resolveWasmPath("typescript")),
    Language.load(resolveWasmPath("javascript")),
  ]);

  const pyExtractors = makePythonExtractors();
  const tsExtractors = makeTsJsExtractors();

  return [
    {
      grammar: pythonLang,
      extensions: [".py"],
      languageName: "python",
      ...pyExtractors,
    },
    {
      grammar: tsLang,
      extensions: [".ts", ".tsx"],
      languageName: "typescript",
      ...tsExtractors,
    },
    {
      grammar: jsLang,
      extensions: [".js", ".jsx"],
      languageName: "javascript",
      ...tsExtractors,
    },
  ];
}

let _extensionMapPromise: Promise<Map<string, LanguageHandler>> | null = null;

async function getExtensionMap(): Promise<Map<string, LanguageHandler>> {
  if (!_extensionMapPromise) {
    _extensionMapPromise = getLanguageHandlers().then((handlers) => {
      const map = new Map<string, LanguageHandler>();
      for (const handler of handlers) {
        for (const ext of handler.extensions) {
          map.set(ext, handler);
        }
      }
      return map;
    });
  }
  return _extensionMapPromise;
}

export async function getHandlerForExtension(ext: string): Promise<LanguageHandler | null> {
  const map = await getExtensionMap();
  return map.get(ext) ?? null;
}

export function getSupportedExtensions(): string[] {
  return [".py", ".ts", ".tsx", ".js", ".jsx"];
}
