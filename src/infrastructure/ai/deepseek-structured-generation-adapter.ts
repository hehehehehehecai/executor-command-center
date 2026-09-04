import type { AIProvider } from "@/shared/ai/ai-provider";
import type { ProviderFailureReasonCode } from "@/shared/ai/contracts";
import type { StructuredGenerationRequest } from "@/shared/ai/structured-generation-request";
import {
  completedStructuredGeneration,
  emptyStructuredGenerationOutput,
  parseStructuredGenerationFailure,
  providerStructuredGenerationFailure,
  type StructuredGenerationMetadata,
  type StructuredGenerationResult,
} from "@/shared/ai/structured-generation-result";

export const deepSeekStructuredGenerationAdapterContractVersion =
  "deepseek-structured-generation-adapter.v1" as const;
export const deepSeekDefaultBaseUrl = "https://api.deepseek.com" as const;
export const deepSeekAdapterMaximumTimeoutMs = 120_000 as const;

export interface DeepSeekAdapterClock {
  readonly now: () => number;
}

export interface DeepSeekAdapterTimer {
  readonly set: (callback: () => void, timeoutMs: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

export interface DeepSeekStructuredGenerationAdapterConfiguration {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly fetcher?: typeof fetch;
  readonly clock?: DeepSeekAdapterClock;
  readonly timer?: DeepSeekAdapterTimer;
}

export class DeepSeekAdapterConfigurationError extends Error {
  readonly name = "DeepSeekAdapterConfigurationError";
  readonly code = "deepseek_adapter_configuration_invalid" as const;

  constructor() {
    super("deepseek_adapter_configuration_invalid");
  }
}

type ProviderOperation =
  | { readonly kind: "http_failure"; readonly status: number }
  | { readonly kind: "invalid_envelope"; readonly status: number }
  | {
      readonly kind: "provider_payload";
      readonly status: number;
      readonly payload: unknown;
    };

const defaultClock: DeepSeekAdapterClock = {
  now: () => globalThis.performance.now(),
};

const defaultTimer: DeepSeekAdapterTimer = {
  set: (callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs),
  clear: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function invalidConfiguration(): never {
  throw new DeepSeekAdapterConfigurationError();
}

function normalizeBaseUrl(value: string | undefined) {
  const normalized = (value ?? deepSeekDefaultBaseUrl)
    .trim()
    .replace(/\/+$/u, "");
  if (normalized !== deepSeekDefaultBaseUrl) invalidConfiguration();
  return normalized;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNonemptyString(
  value: unknown,
  maximumLength: number,
  forbiddenValues: readonly string[],
) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    forbiddenValues.includes(normalized)
  ) {
    return null;
  }
  return normalized;
}

function safeTokenCount(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function readClock(clock: DeepSeekAdapterClock) {
  try {
    const value = clock.now();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function calculateLatency(start: number | null, end: number | null) {
  if (start === null || end === null) return null;
  const latency = end - start;
  return Number.isFinite(latency) && latency >= 0 ? latency : null;
}

function isAbortOrTimeout(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return (
    isRecord(error) &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function failureForHttpStatus(
  status: number,
  metadata: Partial<StructuredGenerationMetadata>,
) {
  if (status === 401 || status === 403) {
    return providerStructuredGenerationFailure({
      reasonCode: "authentication_failed",
      httpStatus: status,
      metadata,
    });
  }
  if (status === 429) {
    return providerStructuredGenerationFailure({
      reasonCode: "rate_limited",
      httpStatus: status,
      metadata,
    });
  }
  if (status >= 400 && status < 500) {
    return providerStructuredGenerationFailure({
      reasonCode: "request_rejected",
      httpStatus: status,
      metadata,
    });
  }
  if (status >= 500 && status < 600) {
    return providerStructuredGenerationFailure({
      reasonCode: "unavailable",
      httpStatus: status,
      metadata,
    });
  }
  return providerStructuredGenerationFailure({
    reasonCode: "unknown",
    httpStatus: status,
    metadata,
  });
}

function failureForTransport(
  reasonCode: Extract<
    ProviderFailureReasonCode,
    "timeout" | "unavailable"
  >,
  metadata: Partial<StructuredGenerationMetadata>,
) {
  return providerStructuredGenerationFailure({
    reasonCode,
    httpStatus: null,
    metadata,
  });
}

export class DeepSeekStructuredGenerationAdapter implements AIProvider {
  private readonly apiKey: string;
  private readonly baseUrl: typeof deepSeekDefaultBaseUrl;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly clock: DeepSeekAdapterClock;
  private readonly timer: DeepSeekAdapterTimer;

  constructor(
    configuration: DeepSeekStructuredGenerationAdapterConfiguration,
  ) {
    if (
      typeof configuration.apiKey !== "string" ||
      configuration.apiKey.trim().length === 0 ||
      typeof configuration.model !== "string" ||
      configuration.model.trim().length === 0 ||
      !Number.isInteger(configuration.timeoutMs) ||
      configuration.timeoutMs <= 0 ||
      configuration.timeoutMs > deepSeekAdapterMaximumTimeoutMs
    ) {
      invalidConfiguration();
    }

    this.apiKey = configuration.apiKey.trim();
    this.baseUrl = normalizeBaseUrl(configuration.baseUrl);
    this.model = configuration.model.trim();
    this.timeoutMs = configuration.timeoutMs;
    this.fetcher = configuration.fetcher ?? globalThis.fetch;
    this.clock = configuration.clock ?? defaultClock;
    this.timer = configuration.timer ?? defaultTimer;
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    const startedAt = readClock(this.clock);
    const controller = new AbortController();
    let didTimeout = false;
    let timerHandle: unknown;

    const providerOperation = this.performProviderOperation(
      request,
      controller.signal,
    );
    const timeoutOperation = new Promise<never>((_resolve, reject) => {
      timerHandle = this.timer.set(() => {
        didTimeout = true;
        controller.abort();
        reject(new DOMException("deepseek_adapter_timeout", "TimeoutError"));
      }, this.timeoutMs);
    });

    try {
      const operation = await Promise.race([
        providerOperation,
        timeoutOperation,
      ]);
      const latencyMs = calculateLatency(startedAt, readClock(this.clock));
      const baseMetadata = {
        provider: "deepseek",
        model: this.model,
        requestId: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
      } as const;

      if (operation.kind === "http_failure") {
        return failureForHttpStatus(operation.status, baseMetadata);
      }
      if (operation.kind === "invalid_envelope") {
        return providerStructuredGenerationFailure({
          reasonCode: "unknown",
          httpStatus: operation.status,
          metadata: baseMetadata,
        });
      }

      return this.mapProviderPayload<T>(
        operation.payload,
        operation.status,
        latencyMs,
        request,
      );
    } catch (error) {
      const latencyMs = calculateLatency(startedAt, readClock(this.clock));
      const metadata = {
        provider: "deepseek",
        model: this.model,
        requestId: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
      } as const;
      return failureForTransport(
        didTimeout || isAbortOrTimeout(error) ? "timeout" : "unavailable",
        metadata,
      );
    } finally {
      this.timer.clear(timerHandle);
    }
  }

  private async performProviderOperation(
    request: StructuredGenerationRequest,
    signal: AbortSignal,
  ): Promise<ProviderOperation> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: request.maxOutputTokens,
        stream: false,
      }),
      signal,
    });

    if (!response.ok) {
      return { kind: "http_failure", status: response.status };
    }

    try {
      return {
        kind: "provider_payload",
        status: response.status,
        payload: await response.json(),
      };
    } catch (error) {
      if (isAbortOrTimeout(error)) throw error;
      return { kind: "invalid_envelope", status: response.status };
    }
  }

  private mapProviderPayload<T>(
    payload: unknown,
    httpStatus: number,
    latencyMs: number | null,
    request: StructuredGenerationRequest,
  ): StructuredGenerationResult<T> {
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      return this.invalidEnvelope(httpStatus, latencyMs);
    }
    const firstChoice = payload.choices[0];
    if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
      return this.invalidEnvelope(httpStatus, latencyMs);
    }
    const content = firstChoice.message.content;
    if (content !== null && typeof content !== "string") {
      return this.invalidEnvelope(httpStatus, latencyMs);
    }

    const forbiddenMetadataValues = [
      this.apiKey,
      request.systemPrompt,
      request.userPrompt,
    ];
    const responseModel = safeNonemptyString(
      payload.model,
      256,
      forbiddenMetadataValues,
    );
    const usage = isRecord(payload.usage) ? payload.usage : {};
    const metadata = {
      provider: "deepseek",
      model: responseModel ?? this.model,
      requestId: safeNonemptyString(
        payload.id,
        256,
        forbiddenMetadataValues,
      ),
      inputTokens: safeTokenCount(usage.prompt_tokens),
      outputTokens: safeTokenCount(usage.completion_tokens),
      latencyMs,
    } as const;

    if (content === null || content.trim().length === 0) {
      return emptyStructuredGenerationOutput(metadata);
    }

    try {
      return completedStructuredGeneration(JSON.parse(content) as T, metadata);
    } catch {
      return parseStructuredGenerationFailure(metadata);
    }
  }

  private invalidEnvelope(
    httpStatus: number,
    latencyMs: number | null,
  ) {
    return providerStructuredGenerationFailure({
      reasonCode: "unknown",
      httpStatus,
      metadata: {
        provider: "deepseek",
        model: this.model,
        requestId: null,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
      },
    });
  }
}
