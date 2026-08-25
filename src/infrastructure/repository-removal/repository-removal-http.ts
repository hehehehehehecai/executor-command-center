import type {
  RepositoryRemovalCommand,
  RepositoryRemovalResult,
} from "@/domain/repository-removal/repository-removal";
import { parseRepositoryRemovalCommand } from "@/domain/repository-removal/repository-removal";

export const repositoryRemovalHttpContract = "repository-removal-http.v1" as const;
export const repositoryRemovalFailureContract =
  "repository-removal-failure.v1" as const;

const failureCodes = [
  "repository_removal_unauthenticated",
  "repository_removal_invalid_request",
  "repository_removal_confirmation_mismatch",
  "repository_removal_not_found",
  "repository_removal_conflict",
  "repository_removal_precondition_failed",
  "repository_removal_retryable_job_conflict",
  "repository_removal_configuration_missing",
  "repository_removal_storage_failed",
] as const;
const publicFailureCodes = new Set<string>(failureCodes);
const safeMessage = "Repository removal could not be completed.";
const maximumBodyBytes = 8_192;

function statusFor(code: string) {
  if (code === "repository_removal_unauthenticated") return 401;
  if (
    code === "repository_removal_invalid_request" ||
    code === "repository_removal_confirmation_mismatch"
  ) return 400;
  if (code === "repository_removal_not_found") return 404;
  if (code === "repository_removal_conflict") return 409;
  if (code === "repository_removal_precondition_failed") return 412;
  if (code === "repository_removal_retryable_job_conflict") return 423;
  return 503;
}

function secureHeaders(source?: Headers) {
  const headers = new Headers(source);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  const vary = new Set(
    (headers.get("vary") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  vary.add("Cookie");
  vary.add("Origin");
  headers.set("vary", [...vary].join(", "));
  return headers;
}

function failureResponse(
  error: unknown,
  responseHeaders?: Headers,
  onFailure?: (code: string, status: number) => void,
) {
  const candidate = error instanceof Error ? error.message : "";
  const code = publicFailureCodes.has(candidate)
    ? candidate
    : "repository_removal_storage_failed";
  const status = statusFor(code);
  onFailure?.(code, status);
  return Response.json(
    { error: { code, message: safeMessage } },
    { status, headers: secureHeaders(responseHeaders) },
  );
}

function assertOrigin(request: Request, appOrigin: string | undefined) {
  try {
    if (!appOrigin) throw new Error("missing");
    const parsed = new URL(appOrigin);
    if (
      parsed.origin !== appOrigin ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    ) {
      throw new Error("missing");
    }
    if (request.headers.get("origin") !== parsed.origin) {
      throw new Error("origin_forbidden");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "origin_forbidden") {
      throw error;
    }
    throw new Error("repository_removal_configuration_missing", {
      cause: error,
    });
  }
}

async function parseJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    throw new Error("repository_removal_invalid_request");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("repository_removal_invalid_request");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBodyBytes) {
        await reader.cancel("body_too_large");
        throw new Error("repository_removal_invalid_request");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    throw new Error("repository_removal_invalid_request", { cause: error });
  }
}

export async function handleRepositoryRemoval(input: {
  readonly request: Request;
  readonly routeProjectId: string;
  readonly appOrigin: string | undefined;
  readonly execute: (
    command: RepositoryRemovalCommand,
  ) => Promise<RepositoryRemovalResult>;
  readonly responseHeaders?: Headers;
  readonly onFailure?: (code: string, status: number) => void;
}) {
  try {
    assertOrigin(input.request, input.appOrigin);
    const contentType = input.request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      throw new Error("repository_removal_invalid_request");
    }

    const command = parseRepositoryRemovalCommand(await parseJson(input.request));
    if (command.projectId !== input.routeProjectId) {
      throw new Error("repository_removal_invalid_request");
    }

    return Response.json(
      { operation: await input.execute(command) },
      { status: 200, headers: secureHeaders(input.responseHeaders) },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "origin_forbidden") {
      const response = failureResponse(
        new Error("repository_removal_invalid_request"),
        input.responseHeaders,
        input.onFailure,
      );
      return new Response(response.body, {
        status: 403,
        headers: response.headers,
      });
    }
    return failureResponse(error, input.responseHeaders, input.onFailure);
  }
}
