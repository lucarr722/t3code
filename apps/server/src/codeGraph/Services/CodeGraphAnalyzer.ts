import {
  type CodeGraphAnalyzeInput,
  type CodeGraphAnalyzeResult,
  type CodeGraphSearchFunctionsInput,
  type CodeGraphSearchFunctionsResult,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type { CodeGraphAnalyzerError } from "../Errors.ts";

export interface CodeGraphAnalyzerShape {
  readonly analyze: (
    input: CodeGraphAnalyzeInput,
  ) => Effect.Effect<CodeGraphAnalyzeResult, CodeGraphAnalyzerError>;

  readonly searchFunctions: (
    input: CodeGraphSearchFunctionsInput,
  ) => Effect.Effect<CodeGraphSearchFunctionsResult, CodeGraphAnalyzerError>;
}

export class CodeGraphAnalyzer extends ServiceMap.Service<CodeGraphAnalyzer, CodeGraphAnalyzerShape>()(
  "t3/codeGraph/Services/CodeGraphAnalyzer",
) {}
