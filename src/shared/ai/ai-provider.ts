import type { StructuredGenerationRequest } from "./structured-generation-request";
import type { StructuredGenerationResult } from "./structured-generation-result";

export interface AIProvider {
  /** Provider-neutral structured generation boundary; implementations own transport and parsing. */
  generateStructured<T>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>>;
}
