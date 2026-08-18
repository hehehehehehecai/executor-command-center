import { describe, expect, it } from "vitest";
import {
  aiProviderContractVersion,
  providerFailureRetryability,
  structuredGenerationOutcomeContractVersion,
  structuredGenerationPubliclyForbiddenFields,
  structuredGenerationRequestContractVersion,
  structuredGenerationResultContractVersion,
  structuredGenerationStatuses,
} from "./contracts";

describe("AI provider contract freeze", () => {
  it("freezes the four reviewed contract versions without a latest alias", () => {
    expect({
      aiProvider: aiProviderContractVersion,
      request: structuredGenerationRequestContractVersion,
      result: structuredGenerationResultContractVersion,
      outcome: structuredGenerationOutcomeContractVersion,
    }).toEqual({
      aiProvider: "ai-provider.v1",
      request: "structured-generation-request.v1",
      result: "structured-generation-result.v1",
      outcome: "structured-generation-outcome.v1",
    });
  });

  it("freezes the exact case-sensitive result alignment keys", () => {
    expect(structuredGenerationStatuses).toEqual([
      "provider_failure",
      "empty_output",
      "parse_failure",
      "completed",
    ]);
  });

  it("freezes provider failure retryability by stable reason code", () => {
    expect(providerFailureRetryability).toEqual({
      authentication_failed: false,
      rate_limited: true,
      request_rejected: false,
      timeout: true,
      unavailable: true,
      unknown: false,
    });
  });

  it("freezes fields that public result and error objects must never echo", () => {
    expect(structuredGenerationPubliclyForbiddenFields).toEqual([
      "systemPrompt",
      "userPrompt",
      "apiKey",
      "authorization",
      "rawResponse",
    ]);
  });
});
