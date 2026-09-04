export const aiProviderContractVersion = "ai-provider.v1" as const;
export const structuredGenerationRequestContractVersion =
  "structured-generation-request.v1" as const;
export const structuredGenerationResultContractVersion =
  "structured-generation-result.v1" as const;
export const structuredGenerationOutcomeContractVersion =
  "structured-generation-outcome.v1" as const;

export const structuredGenerationStatuses = [
  "provider_failure",
  "empty_output",
  "parse_failure",
  "completed",
] as const;
export type StructuredGenerationStatus =
  (typeof structuredGenerationStatuses)[number];

export const providerFailureRetryability = {
  authentication_failed: false,
  rate_limited: true,
  request_rejected: false,
  timeout: true,
  unavailable: true,
  unknown: false,
} as const;
export type ProviderFailureReasonCode =
  keyof typeof providerFailureRetryability;

export const structuredGenerationPubliclyForbiddenFields = [
  "systemPrompt",
  "userPrompt",
  "apiKey",
  "authorization",
  "rawResponse",
] as const;
