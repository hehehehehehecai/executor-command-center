import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";
import { z } from "zod";

export const githubRepositorySelectionHttpContract =
  "github-repository-selection-http.v1" as const;
export const githubRepositorySelectionFailureContract =
  "github-repository-selection-failure.v1" as const;
export const sameOriginMutationContract =
  "same-origin-mutation.v1" as const;

const safeMessage =
  "GitHub repository selection could not be completed.";

export const githubRepositorySelectionPublicFailureCodes = [
  "unauthenticated",
  "github_repository_selection_invalid_request",
  "origin_forbidden",
  "github_installation_not_registered",
  "github_installation_suspended",
  "github_installation_revoked",
  "github_repository_not_authorized",
  "github_installation_lookup_failed",
  "github_app_configuration_missing",
  "github_app_authentication_failed",
  "github_installation_token_unauthorized",
  "github_installation_token_forbidden",
  "github_installation_token_not_found",
  "github_installation_token_rate_limited",
  "github_installation_token_timeout",
  "github_installation_token_invalid_response",
  "github_installation_token_unavailable",
  "github_installation_token_revoke_failed",
  "github_repository_list_unauthorized",
  "github_repository_list_forbidden",
  "github_repository_list_rate_limited",
  "github_repository_list_timeout",
  "github_repository_list_invalid_response",
  "github_repository_list_unavailable",
  "github_repository_list_failed",
  "github_repository_pagination_inconsistent",
  "github_repository_pagination_limit_exceeded",
  "github_repository_selection_storage_failed",
  "github_repository_selection_lookup_failed",
  "github_repository_deselection_failed",
] as const;

export const githubRepositorySelectionPhase6FailureContract =
  "github-repository-selection-failure.v2" as const;
export const githubRepositorySelectionPhase6PublicFailureCodes = [
  ...githubRepositorySelectionPublicFailureCodes,
  "github_repository_selection_active_project_conflict",
] as const;

const publicFailureCodes = new Set<string>(
  githubRepositorySelectionPhase6PublicFailureCodes,
);

const rateLimitCodes = new Set([
  "github_installation_token_rate_limited",
  "github_repository_list_rate_limited",
]);

const timeoutCodes = new Set([
  "github_installation_token_timeout",
  "github_repository_list_timeout",
]);

const postBodySchema = z
  .object({
    repositoryId: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

type FailureHandler = (code: string, status: number) => void;

function statusForFailure(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "github_repository_selection_invalid_request") return 400;
  if (code === "origin_forbidden") return 403;
  if (
    code === "github_installation_not_registered" ||
    code === "github_installation_suspended" ||
    code === "github_installation_revoked" ||
    code === "github_repository_not_authorized" ||
    code === "github_repository_selection_active_project_conflict"
  ) {
    return 409;
  }
  if (rateLimitCodes.has(code)) return 429;
  if (timeoutCodes.has(code)) return 504;
  if (
    code === "github_installation_lookup_failed" ||
    code === "github_app_configuration_missing" ||
    code === "github_repository_selection_storage_failed" ||
    code === "github_repository_selection_lookup_failed" ||
    code === "github_repository_deselection_failed"
  ) {
    return 503;
  }
  return 502;
}

function failureCode(error: unknown, fallback: string): string {
  if (
    error instanceof Error &&
    publicFailureCodes.has(error.message)
  ) {
    return error.message;
  }

  return fallback;
}

function copyHeadersPreservingCookies(
  source: Headers | undefined,
  target: Headers,
) {
  if (!source) return;

  source.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") {
      target.set(name, value);
    }
  });

  for (const cookie of source.getSetCookie()) {
    target.append("set-cookie", cookie);
  }
}

function secureHeaders(
  mutation: boolean,
  responseHeaders?: Headers,
): Headers {
  const headers = new Headers();
  copyHeadersPreservingCookies(responseHeaders, headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");

  const varyTokens = (headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set(varyTokens.map((value) => value.toLowerCase()));

  if (!seen.has("cookie")) varyTokens.push("Cookie");
  if (mutation && !seen.has("origin")) varyTokens.push("Origin");
  headers.set("vary", varyTokens.join(", "));
  return headers;
}

function successJson(
  body: unknown,
  mutation: boolean,
  responseHeaders?: Headers,
): Response {
  return Response.json(body, {
    status: 200,
    headers: secureHeaders(mutation, responseHeaders),
  });
}

function failureResponse(
  error: unknown,
  fallback: string,
  mutation: boolean,
  responseHeaders?: Headers,
  onFailure?: FailureHandler,
): Response {
  const code = failureCode(error, fallback);
  const status = statusForFailure(code);
  onFailure?.(code, status);
  return Response.json(
    {
      error: {
        code,
        message: safeMessage,
      },
    },
    {
      status,
      headers: secureHeaders(mutation, responseHeaders),
    },
  );
}

export function parseMutationOrigin(
  value: string | undefined,
  nodeEnvironment = process.env.NODE_ENV,
): string {
  try {
    if (!value) throw new Error("missing");
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin === "null" ||
      (nodeEnvironment === "production" && parsed.protocol !== "https:") ||
      value !== parsed.origin
    ) {
      throw new Error("invalid");
    }
    return parsed.origin;
  } catch (error) {
    throw new Error(
      "github_repository_selection_configuration_missing",
      { cause: error },
    );
  }
}

function assertMutationOrigin(
  request: Request,
  appOrigin: string | undefined,
) {
  const allowedOrigin = parseMutationOrigin(appOrigin);
  if (request.headers.get("origin") !== allowedOrigin) {
    throw new Error("origin_forbidden");
  }
}

export async function handleSelectedRepositoryList(input: {
  readonly execute: () => Promise<
    readonly SelectedGitHubRepository[]
  >;
  readonly responseHeaders?: Headers;
  readonly onFailure?: FailureHandler;
}): Promise<Response> {
  try {
    const selectedRepositories = await input.execute();
    return successJson(
      { selectedRepositories },
      false,
      input.responseHeaders,
    );
  } catch (error) {
    return failureResponse(
      error,
      "github_repository_selection_lookup_failed",
      false,
      input.responseHeaders,
      input.onFailure,
    );
  }
}

export async function handleRepositorySelection(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly execute: (
    repositoryId: number,
  ) => Promise<SelectedGitHubRepository>;
  readonly responseHeaders?: Headers;
  readonly onFailure?: FailureHandler;
}): Promise<Response> {
  try {
    assertMutationOrigin(input.request, input.appOrigin);

    const contentType =
      input.request.headers.get("content-type")?.split(";")[0]?.trim();
    if (contentType?.toLowerCase() !== "application/json") {
      throw new Error("github_repository_selection_invalid_request");
    }

    let rawBody: unknown;
    try {
      rawBody = await input.request.json();
    } catch (error) {
      throw new Error(
        "github_repository_selection_invalid_request",
        { cause: error },
      );
    }

    const body = postBodySchema.safeParse(rawBody);
    if (!body.success) {
      throw new Error("github_repository_selection_invalid_request");
    }

    const selectedRepository = await input.execute(
      body.data.repositoryId,
    );
    return successJson(
      {
        selectionState: "selected",
        selectedRepository,
      },
      true,
      input.responseHeaders,
    );
  } catch (error) {
    return failureResponse(
      error,
      "github_repository_selection_storage_failed",
      true,
      input.responseHeaders,
      input.onFailure,
    );
  }
}

function parseRepositoryId(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("github_repository_selection_invalid_request");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("github_repository_selection_invalid_request");
  }
  return parsed;
}

export async function handleRepositoryDeselection(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly repositoryId: string | (() => Promise<string>);
  readonly execute: (repositoryId: number) => Promise<void>;
  readonly responseHeaders?: Headers;
  readonly onFailure?: FailureHandler;
}): Promise<Response> {
  try {
    assertMutationOrigin(input.request, input.appOrigin);
    const rawRepositoryId =
      typeof input.repositoryId === "string"
        ? input.repositoryId
        : await input.repositoryId();
    const repositoryId = parseRepositoryId(rawRepositoryId);
    await input.execute(repositoryId);
    return new Response(null, {
      status: 204,
      headers: secureHeaders(true, input.responseHeaders),
    });
  } catch (error) {
    return failureResponse(
      error,
      "github_repository_deselection_failed",
      true,
      input.responseHeaders,
      input.onFailure,
    );
  }
}
