// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  aiProviderContractVersion,
  structuredGenerationOutcomeContractVersion,
  structuredGenerationRequestContractVersion,
  structuredGenerationResultContractVersion,
} from "@/shared/ai/contracts";
import { createStructuredGenerationRequest } from "@/shared/ai/structured-generation-request";

import {
  DeepSeekAdapterConfigurationError,
  DeepSeekStructuredGenerationAdapter,
  deepSeekAdapterMaximumTimeoutMs,
  deepSeekStructuredGenerationAdapterContractVersion,
  type DeepSeekAdapterTimer,
} from "./deepseek-structured-generation-adapter";

const syntheticApiKey = "synthetic-deepseek-key";
const syntheticSystemPrompt = "Return only one JSON object.";
const syntheticUserPrompt = "Describe synthetic project alpha as JSON.";

const request = createStructuredGenerationRequest({
  systemPrompt: syntheticSystemPrompt,
  userPrompt: syntheticUserPrompt,
  schemaName: "SyntheticBriefV1",
  maxOutputTokens: 512,
});

function providerResponse(
  content: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return new Response(
    JSON.stringify({
      id: "request-synthetic-1",
      model: "deepseek-synthetic-response-model",
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 17, completion_tokens: 23 },
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function createManualTimer() {
  let timeoutCallback: (() => void) | undefined;
  const timer: DeepSeekAdapterTimer = {
    set: vi.fn((callback) => {
      timeoutCallback = callback;
      return "synthetic-timeout-handle";
    }),
    clear: vi.fn(),
  };

  return {
    timer,
    fire() {
      if (!timeoutCallback) throw new Error("synthetic_timer_not_set");
      timeoutCallback();
    },
  };
}

function createAdapter(
  fetcher: typeof fetch,
  overrides: Partial<
    ConstructorParameters<typeof DeepSeekStructuredGenerationAdapter>[0]
  > = {},
) {
  return new DeepSeekStructuredGenerationAdapter({
    apiKey: syntheticApiKey,
    model: "deepseek-synthetic-config-model",
    timeoutMs: 1_000,
    fetcher,
    clock: { now: () => 10 },
    ...overrides,
  });
}

describe("deepseek-structured-generation-adapter.v1 pre-run freeze", () => {
  it("[phase5-C01] freezes the adapter and unchanged shared contract versions", () => {
    expect(deepSeekStructuredGenerationAdapterContractVersion).toBe(
      "deepseek-structured-generation-adapter.v1",
    );
    expect(aiProviderContractVersion).toBe("ai-provider.v1");
    expect(structuredGenerationRequestContractVersion).toBe(
      "structured-generation-request.v1",
    );
    expect(structuredGenerationResultContractVersion).toBe(
      "structured-generation-result.v1",
    );
    expect(structuredGenerationOutcomeContractVersion).toBe(
      "structured-generation-outcome.v1",
    );
  });

  it("[phase5-C02] validates configuration without echoing a secret", () => {
    const invalidConfigurations = [
      { apiKey: "", model: "deepseek", timeoutMs: 1_000 },
      { apiKey: "secret-that-must-not-leak", model: "", timeoutMs: 1_000 },
      { apiKey: "secret-that-must-not-leak", model: "deepseek", timeoutMs: 0 },
      { apiKey: "secret-that-must-not-leak", model: "deepseek", timeoutMs: 1.5 },
      {
        apiKey: "secret-that-must-not-leak",
        model: "deepseek",
        timeoutMs: deepSeekAdapterMaximumTimeoutMs + 1,
      },
      {
        apiKey: "secret-that-must-not-leak",
        baseUrl: "https://example.invalid",
        model: "deepseek",
        timeoutMs: 1_000,
      },
    ];

    for (const configuration of invalidConfigurations) {
      expect(() => new DeepSeekStructuredGenerationAdapter(configuration)).toThrow(
        DeepSeekAdapterConfigurationError,
      );
      try {
        new DeepSeekStructuredGenerationAdapter(configuration);
      } catch (error) {
        expect(String(error)).toContain("deepseek_adapter_configuration_invalid");
        expect(String(error)).not.toContain("secret-that-must-not-leak");
      }
    }
  });
});

describe("Target A: transport and outcome mapping", () => {
  it("[phase5-A01] sends exactly one non-streaming JSON Output request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse('{"summary":"synthetic"}'));
    const adapter = createAdapter(fetcher, {
      baseUrl: "https://api.deepseek.com///",
    });

    await expect(adapter.generateStructured(request)).resolves.toMatchObject({
      status: "completed",
      value: { summary: "synthetic" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: `Bearer ${syntheticApiKey}`,
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "deepseek-synthetic-config-model",
      messages: [
        { role: "system", content: syntheticSystemPrompt },
        { role: "user", content: syntheticUserPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 512,
      stream: false,
    });
    expect(String(init?.body)).not.toMatch(
      /SyntheticBriefV1|schemaName|tools|reasoning_content/,
    );
  });

  it.each([null, "", "   \n\t"])(
    "[phase5-A02] maps empty content %j to empty_output",
    async (content) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(providerResponse(content));

      await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
        status: "empty_output",
        failureCode: "empty_output",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("[phase5-A03] maps non-empty invalid JSON to parse_failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse("{invalid-json"));

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      status: "parse_failure",
      failureCode: "invalid_json",
    });
  });

  it.each([
    {},
    { choices: [] },
    { choices: [{}] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: 42 } }] },
  ])("[phase5-A04] rejects invalid provider envelope %#", async (payload) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      status: "provider_failure",
      reasonCode: "unknown",
      retryable: false,
      httpStatus: 200,
    });
  });

  it("[phase5-A05] treats malformed 2xx response JSON as invalid provider envelope", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{", { status: 200 }));

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      status: "provider_failure",
      reasonCode: "unknown",
      retryable: false,
      httpStatus: 200,
    });
  });

  it.each([
    [401, "authentication_failed", false],
    [403, "authentication_failed", false],
    [429, "rate_limited", true],
    [400, "request_rejected", false],
    [404, "request_rejected", false],
    [409, "request_rejected", false],
    [422, "request_rejected", false],
    [500, "unavailable", true],
    [503, "unavailable", true],
    [302, "unknown", false],
  ] as const)(
    "[phase5-A06] maps HTTP %i to %s",
    async (status, reasonCode, retryable) => {
      const response = new Response("raw-sensitive-provider-body", { status });
      const json = vi.spyOn(response, "json");
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);

      await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
        status: "provider_failure",
        reasonCode,
        retryable,
        httpStatus: status,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(json).not.toHaveBeenCalled();
    },
  );

  it("[phase5-A07] maps a network rejection to retryable unavailable", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("raw-sensitive-network-error"));

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      status: "provider_failure",
      reasonCode: "unavailable",
      retryable: true,
      httpStatus: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("[phase5-A08] aborts on timeout, returns once, and clears the timer", async () => {
    const manual = createManualTimer();
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("synthetic abort", "AbortError"));
        });
      });
    });
    const adapter = createAdapter(fetcher, { timer: manual.timer });

    const pending = adapter.generateStructured(request);
    manual.fire();

    await expect(pending).resolves.toMatchObject({
      status: "provider_failure",
      reasonCode: "timeout",
      retryable: true,
      httpStatus: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(manual.timer.clear).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      caseId: "phase5-A09-success",
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(providerResponse('{"ok":true}')),
      expectedStatus: "completed",
    },
    {
      caseId: "phase5-A09-network-failure",
      fetcher: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("synthetic network rejection")),
      expectedStatus: "provider_failure",
    },
  ])("[$caseId] clears the timer after every settled transport", async ({
    fetcher,
    expectedStatus,
  }) => {
    const manual = createManualTimer();
    const result = await createAdapter(fetcher, {
      timer: manual.timer,
    }).generateStructured(request);

    expect(result.status).toBe(expectedStatus);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(manual.timer.clear).toHaveBeenCalledTimes(1);
  });

  it("[phase5-A10] maps an explicit AbortError to retryable timeout", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("synthetic abort", "AbortError"));

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      status: "provider_failure",
      reasonCode: "timeout",
      retryable: true,
      httpStatus: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Target B: provider-neutral metadata", () => {
  it("[phase5-B01] maps valid response metadata and injected monotonic latency", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse('{"ok":true}'));
    const now = vi.fn().mockReturnValueOnce(100.25).mockReturnValueOnce(127.75);

    await expect(
      createAdapter(fetcher, { clock: { now } }).generateStructured(request),
    ).resolves.toMatchObject({
      status: "completed",
      metadata: {
        provider: "deepseek",
        model: "deepseek-synthetic-response-model",
        requestId: "request-synthetic-1",
        inputTokens: 17,
        outputTokens: 23,
        latencyMs: 27.5,
      },
    });
  });

  it("[phase5-B02] uses null or configured fallbacks for missing metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse('{"ok":true}', {
        id: undefined,
        model: "  ",
        usage: undefined,
      }),
    );

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      metadata: {
        provider: "deepseek",
        model: "deepseek-synthetic-config-model",
        requestId: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs: 0,
      },
    });
  });

  it.each([
    { usage: { prompt_tokens: -1, completion_tokens: 1 }, expectedInput: null, expectedOutput: 1 },
    { usage: { prompt_tokens: 1.5, completion_tokens: 1 }, expectedInput: null, expectedOutput: 1 },
    {
      usage: { prompt_tokens: Number.MAX_SAFE_INTEGER + 1, completion_tokens: 1 },
      expectedInput: null,
      expectedOutput: 1,
    },
    {
      usage: { prompt_tokens: 1, completion_tokens: -1 },
      expectedInput: 1,
      expectedOutput: null,
    },
    {
      usage: { prompt_tokens: "17", completion_tokens: "23" },
      expectedInput: null,
      expectedOutput: null,
    },
  ])("[phase5-B03] rejects invalid token metadata %#", async ({
    usage,
    expectedInput,
    expectedOutput,
  }) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse('{"ok":true}', { usage }));

    const result = await createAdapter(fetcher).generateStructured(request);
    expect(result.metadata.inputTokens).toBe(expectedInput);
    expect(result.metadata.outputTokens).toBe(expectedOutput);
  });

  it("[phase5-B04] returns null for invalid clock readings", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse('{"ok":true}'));
    const now = vi.fn().mockReturnValueOnce(50).mockReturnValueOnce(40);

    const result = await createAdapter(fetcher, { clock: { now } }).generateStructured(request);
    expect(result.metadata.latencyMs).toBeNull();
  });
});

describe("Target C: secrets and phase boundaries", () => {
  it.each([
    new Response("raw-body-with-secret-that-must-not-leak", { status: 500 }),
    new Response("{raw-body-with-secret-that-must-not-leak", { status: 200 }),
    new Response(JSON.stringify({ forged: "raw-body-with-secret-that-must-not-leak" }), {
      status: 200,
    }),
  ])("[phase5-C03] never exposes non-completed raw bodies or prompts", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = await createAdapter(fetcher).generateStructured(request);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(syntheticApiKey);
    expect(serialized).not.toContain(syntheticSystemPrompt);
    expect(serialized).not.toContain(syntheticUserPrompt);
    expect(serialized).not.toContain("raw-body-with-secret-that-must-not-leak");
  });

  it("[phase5-C04] parse success does not invoke Brief Schema or Evidence validation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse('{"notAProjectBrief":true}'));

    await expect(createAdapter(fetcher).generateStructured(request)).resolves.toMatchObject({
      status: "completed",
      value: { notAProjectBrief: true },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("[phase5-C05] ignores provider reasoning_content instead of exposing it", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      providerResponse('{"safe":"visible"}', {
        choices: [
          {
            message: {
              content: '{"safe":"visible"}',
              reasoning_content: "private-provider-reasoning",
            },
          },
        ],
      }),
    );

    const result = await createAdapter(fetcher).generateStructured(request);
    expect(result).toMatchObject({
      status: "completed",
      value: { safe: "visible" },
    });
    expect(JSON.stringify(result)).not.toContain("private-provider-reasoning");
  });
});
