import {
  providerFailureRetryability,
  structuredGenerationResultContractVersion,
  type ProviderFailureReasonCode,
} from "./contracts";

export interface StructuredGenerationMetadata {
  readonly provider: string | null;
  readonly model: string | null;
  readonly requestId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number | null;
}

export function createStructuredGenerationMetadata(
  input: Partial<StructuredGenerationMetadata> = {},
): StructuredGenerationMetadata {
  return {
    provider: input.provider ?? null,
    model: input.model ?? null,
    requestId: input.requestId ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    latencyMs: input.latencyMs ?? null,
  };
}

interface StructuredGenerationResultBase {
  readonly contractVersion: typeof structuredGenerationResultContractVersion;
  readonly metadata: StructuredGenerationMetadata;
}

export type ProviderFailureResultFor<
  Reason extends ProviderFailureReasonCode,
> = StructuredGenerationResultBase & {
  readonly status: "provider_failure";
  readonly failureCode: "provider_failure";
  readonly reasonCode: Reason;
  readonly retryable: (typeof providerFailureRetryability)[Reason];
  readonly httpStatus: number | null;
};

export type ProviderFailureResult = {
  [Reason in ProviderFailureReasonCode]: ProviderFailureResultFor<Reason>;
}[ProviderFailureReasonCode];

export interface EmptyOutputResult extends StructuredGenerationResultBase {
  readonly status: "empty_output";
  readonly failureCode: "empty_output";
}

export interface ParseFailureResult extends StructuredGenerationResultBase {
  /** Non-empty provider text was not valid JSON; no business schema was evaluated. */
  readonly status: "parse_failure";
  readonly failureCode: "invalid_json";
}

export interface CompletedStructuredGenerationResult<T>
  extends StructuredGenerationResultBase {
  /** JSON parsing succeeded; schema, evidence and user visibility remain unverified. */
  readonly status: "completed";
  readonly value: T;
}

export type StructuredGenerationResult<T> =
  | ProviderFailureResult
  | EmptyOutputResult
  | ParseFailureResult
  | CompletedStructuredGenerationResult<T>;

export function providerStructuredGenerationFailure<
  Reason extends ProviderFailureReasonCode,
>(input: {
  readonly reasonCode: Reason;
  readonly httpStatus?: number | null;
  readonly metadata?: Partial<StructuredGenerationMetadata>;
}): ProviderFailureResultFor<Reason> {
  return {
    contractVersion: structuredGenerationResultContractVersion,
    status: "provider_failure",
    failureCode: "provider_failure",
    reasonCode: input.reasonCode,
    retryable: providerFailureRetryability[input.reasonCode],
    httpStatus: input.httpStatus ?? null,
    metadata: createStructuredGenerationMetadata(input.metadata),
  };
}

export function emptyStructuredGenerationOutput(
  metadata?: Partial<StructuredGenerationMetadata>,
): EmptyOutputResult {
  return {
    contractVersion: structuredGenerationResultContractVersion,
    status: "empty_output",
    failureCode: "empty_output",
    metadata: createStructuredGenerationMetadata(metadata),
  };
}

export function parseStructuredGenerationFailure(
  metadata?: Partial<StructuredGenerationMetadata>,
): ParseFailureResult {
  return {
    contractVersion: structuredGenerationResultContractVersion,
    status: "parse_failure",
    failureCode: "invalid_json",
    metadata: createStructuredGenerationMetadata(metadata),
  };
}

export function completedStructuredGeneration<T>(
  value: T,
  metadata?: Partial<StructuredGenerationMetadata>,
): CompletedStructuredGenerationResult<T> {
  return {
    contractVersion: structuredGenerationResultContractVersion,
    status: "completed",
    value,
    metadata: createStructuredGenerationMetadata(metadata),
  };
}

export interface StructuredGenerationResultHandlers<T, Handled> {
  readonly provider_failure: (result: ProviderFailureResult) => Handled;
  readonly empty_output: (result: EmptyOutputResult) => Handled;
  readonly parse_failure: (result: ParseFailureResult) => Handled;
  readonly completed: (
    result: CompletedStructuredGenerationResult<T>,
  ) => Handled;
}

function unreachableOutcome(result: never): never {
  void result;
  throw new Error("structured_generation_outcome_unhandled");
}

export function matchStructuredGenerationResult<T, Handled>(
  result: StructuredGenerationResult<T>,
  handlers: StructuredGenerationResultHandlers<T, Handled>,
): Handled {
  switch (result.status) {
    case "provider_failure":
      return handlers.provider_failure(result);
    case "empty_output":
      return handlers.empty_output(result);
    case "parse_failure":
      return handlers.parse_failure(result);
    case "completed":
      return handlers.completed(result);
    default:
      return unreachableOutcome(result);
  }
}
