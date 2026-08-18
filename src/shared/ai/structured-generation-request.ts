import { structuredGenerationRequestContractVersion } from "./contracts";

export const structuredGenerationSchemaNameMaxLength = 128 as const;
export const structuredGenerationMaxOutputTokens = 32_768 as const;

export const structuredGenerationRequestErrorCodes = [
  "request_invalid",
  "system_prompt_required",
  "user_prompt_required",
  "schema_name_invalid",
  "max_output_tokens_invalid",
] as const;
export type StructuredGenerationRequestErrorCode =
  (typeof structuredGenerationRequestErrorCodes)[number];

export interface StructuredGenerationRequest {
  readonly contractVersion: typeof structuredGenerationRequestContractVersion;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schemaName: string;
  readonly maxOutputTokens: number;
}

export class StructuredGenerationRequestError extends Error {
  readonly name = "StructuredGenerationRequestError";

  constructor(readonly code: StructuredGenerationRequestErrorCode) {
    super(code);
  }
}

function invalid(code: StructuredGenerationRequestErrorCode): never {
  throw new StructuredGenerationRequestError(code);
}

export function createStructuredGenerationRequest(
  input: unknown,
): StructuredGenerationRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid("request_invalid");
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  if (typeof candidate.systemPrompt !== "string") {
    return invalid("system_prompt_required");
  }
  const systemPrompt = candidate.systemPrompt.trim();
  if (systemPrompt === "") return invalid("system_prompt_required");

  if (typeof candidate.userPrompt !== "string") {
    return invalid("user_prompt_required");
  }
  const userPrompt = candidate.userPrompt.trim();
  if (userPrompt === "") return invalid("user_prompt_required");

  if (typeof candidate.schemaName !== "string") {
    return invalid("schema_name_invalid");
  }
  const schemaName = candidate.schemaName.trim();
  if (
    schemaName.length > structuredGenerationSchemaNameMaxLength
    || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(schemaName)
  ) {
    return invalid("schema_name_invalid");
  }

  if (
    typeof candidate.maxOutputTokens !== "number"
    || !Number.isInteger(candidate.maxOutputTokens)
    || candidate.maxOutputTokens <= 0
    || candidate.maxOutputTokens > structuredGenerationMaxOutputTokens
  ) {
    return invalid("max_output_tokens_invalid");
  }

  return {
    contractVersion: structuredGenerationRequestContractVersion,
    systemPrompt,
    userPrompt,
    schemaName,
    maxOutputTokens: candidate.maxOutputTokens,
  };
}
