import { describe, expect, it } from "vitest";
import type { AIProvider } from "./ai-provider";
import {
  createStructuredGenerationRequest,
  type StructuredGenerationRequest,
} from "./structured-generation-request";
import {
  completedStructuredGeneration,
  createStructuredGenerationMetadata,
  emptyStructuredGenerationOutput,
  matchStructuredGenerationResult,
  parseStructuredGenerationFailure,
  providerStructuredGenerationFailure,
  type StructuredGenerationResult,
} from "./structured-generation-result";

const request = createStructuredGenerationRequest({
  systemPrompt: "synthetic-system-prompt-never-echo",
  userPrompt: "synthetic-user-prompt-never-echo",
  schemaName: "synthetic.contract-v1",
  maxOutputTokens: 256,
});

const metadata = createStructuredGenerationMetadata({
  provider: "synthetic-provider",
  model: "synthetic-model",
  requestId: "synthetic-request-001",
  inputTokens: 12,
  outputTokens: 8,
  latencyMs: 25,
});

class DeterministicFakeProvider implements AIProvider {
  constructor(
    private readonly outcome: StructuredGenerationResult<{
      readonly summary: string;
    }>,
  ) {}

  async generateStructured<T>(
    requestInput: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    void requestInput;
    return this.outcome as StructuredGenerationResult<T>;
  }
}

const lineageCases = [
  {
    syntheticCaseId: "ai-provider-contract-provider-failure",
    contractVersion: "structured-generation-result.v1",
    requestFixtureId: "synthetic-request-001",
    fakeProviderOutcome: providerStructuredGenerationFailure({
      reasonCode: "timeout",
      httpStatus: null,
      metadata,
    }),
    expectedResultStatus: "provider_failure",
  },
  {
    syntheticCaseId: "ai-provider-contract-empty-output",
    contractVersion: "structured-generation-result.v1",
    requestFixtureId: "synthetic-request-001",
    fakeProviderOutcome: emptyStructuredGenerationOutput(metadata),
    expectedResultStatus: "empty_output",
  },
  {
    syntheticCaseId: "ai-provider-contract-parse-failure",
    contractVersion: "structured-generation-result.v1",
    requestFixtureId: "synthetic-request-001",
    fakeProviderOutcome: parseStructuredGenerationFailure(metadata),
    expectedResultStatus: "parse_failure",
  },
  {
    syntheticCaseId: "ai-provider-contract-completed",
    contractVersion: "structured-generation-result.v1",
    requestFixtureId: "synthetic-request-001",
    fakeProviderOutcome: completedStructuredGeneration(
      { summary: "synthetic parsed JSON value" },
      metadata,
    ),
    expectedResultStatus: "completed",
  },
] as const;

describe("StructuredGenerationResult", () => {
  it.each([
    ["authentication_failed", false],
    ["rate_limited", true],
    ["request_rejected", false],
    ["timeout", true],
    ["unavailable", true],
    ["unknown", false],
  ] as const)(
    "binds provider failure reason %s to retryable=%s",
    (reasonCode, retryable) => {
      const result = providerStructuredGenerationFailure({
        reasonCode,
        httpStatus: reasonCode === "rate_limited" ? 429 : null,
        metadata,
      });

      expect({
        status: result.status,
        failureCode: result.failureCode,
        reasonCode: result.reasonCode,
        retryable: result.retryable,
      }).toEqual({
        status: "provider_failure",
        failureCode: "provider_failure",
        reasonCode,
        retryable,
      });
    },
  );

  it("represents empty output independently from provider and parse failures", () => {
    expect(emptyStructuredGenerationOutput(metadata)).toEqual({
      contractVersion: "structured-generation-result.v1",
      status: "empty_output",
      failureCode: "empty_output",
      metadata,
    });
  });

  it("represents invalid JSON without claiming a later schema failure", () => {
    expect(parseStructuredGenerationFailure(metadata)).toEqual({
      contractVersion: "structured-generation-result.v1",
      status: "parse_failure",
      failureCode: "invalid_json",
      metadata,
    });
  });

  it("completed carries only a parsed generic value and provider-neutral metadata", () => {
    expect(completedStructuredGeneration(
      { summary: "synthetic parsed JSON value", references: ["ref-001"] },
      metadata,
    )).toEqual({
      contractVersion: "structured-generation-result.v1",
      status: "completed",
      value: {
        summary: "synthetic parsed JSON value",
        references: ["ref-001"],
      },
      metadata,
    });
  });

  it("uses explicit null for every unavailable provider-neutral metadata field", () => {
    expect(createStructuredGenerationMetadata()).toEqual({
      provider: null,
      model: null,
      requestId: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
    });
  });

  it("allow-lists metadata and drops prompt, secret and raw response fields", () => {
    const unsafeInput = {
      provider: "synthetic-provider",
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      apiKey: "synthetic-api-key-never-echo",
      authorization: "Bearer synthetic-secret",
      rawResponse: "synthetic complete private response",
    };

    expect(createStructuredGenerationMetadata(unsafeInput)).toEqual({
      provider: "synthetic-provider",
      model: null,
      requestId: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
    });
  });

  it.each(lineageCases)(
    "$syntheticCaseId follows the frozen request → fake provider → exact status lineage",
    async ({ fakeProviderOutcome, expectedResultStatus }) => {
      const provider = new DeterministicFakeProvider(fakeProviderOutcome);
      const result = await provider.generateStructured(request);

      expect(result.status).toBe(expectedResultStatus);
    },
  );

  it("a deterministic fake provider executes with networking disabled", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network access is forbidden in AIProvider contract tests");
    }) as typeof fetch;
    try {
      const provider = new DeterministicFakeProvider(
        completedStructuredGeneration({ summary: "offline" }),
      );
      await expect(provider.generateStructured(request)).resolves.toMatchObject({
        status: "completed",
        value: { summary: "offline" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("public failure results do not echo prompts, secrets or complete raw output", () => {
    const result = providerStructuredGenerationFailure({
      reasonCode: "authentication_failed",
      httpStatus: 401,
      metadata: createStructuredGenerationMetadata({
        provider: "synthetic-provider",
      }),
    });

    expect(JSON.stringify(result)).toBe(
      '{"contractVersion":"structured-generation-result.v1","status":"provider_failure","failureCode":"provider_failure","reasonCode":"authentication_failed","retryable":false,"httpStatus":401,"metadata":{"provider":"synthetic-provider","model":null,"requestId":null,"inputTokens":null,"outputTokens":null,"latencyMs":null}}',
    );
  });

  it.each(lineageCases)(
    "$syntheticCaseId is exhaustively handled by exact status",
    ({ fakeProviderOutcome, expectedResultStatus }) => {
      const handled = matchStructuredGenerationResult(fakeProviderOutcome, {
        provider_failure: () => "provider_failure",
        empty_output: () => "empty_output",
        parse_failure: () => "parse_failure",
        completed: () => "completed",
      });

      expect(handled).toBe(expectedResultStatus);
    },
  );
});
