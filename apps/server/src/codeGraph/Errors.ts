import { Schema } from "effect";

export class CodeGraphAnalyzerError extends Schema.TaggedErrorClass<CodeGraphAnalyzerError>()(
  "CodeGraphAnalyzerError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Code graph analysis failed in ${this.operation}: ${this.detail}`;
  }
}
