import type { AuthorizedRepositoryList } from "@/domain/github-repository/authorized-github-repository";

export const githubRepositoryHttpContract =
  "github-repository-list-http.v1" as const;
export const githubRepositoryFailureContract =
  "github-repository-list-failure.v1" as const;

const publicFailureCodeOrder = [
  "unauthenticated",
  "github_installation_not_registered",
  "github_installation_suspended",
  "github_installation_revoked",
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
] as const;
const publicFailureCodes = new Set<string>(publicFailureCodeOrder);

const rateLimitCodes = new Set([
  "github_installation_token_rate_limited",
  "github_repository_list_rate_limited",
]);
const timeoutCodes = new Set([
  "github_installation_token_timeout",
  "github_repository_list_timeout",
]);

const safeMessage =
  "Authorized GitHub repositories could not be loaded.";

function publicFailureCode(error: unknown) {
  if (
    error instanceof Error &&
    publicFailureCodes.has(error.message)
  ) {
    return error.message;
  }

  return "github_repository_list_failed";
}

function statusForFailure(code: string) {
  if (code === "unauthenticated") return 401;
  if (
    code === "github_installation_not_registered" ||
    code === "github_installation_suspended" ||
    code === "github_installation_revoked"
  ) {
    return 409;
  }
  if (
    code === "github_installation_lookup_failed" ||
    code === "github_app_configuration_missing"
  ) {
    return 503;
  }
  if (rateLimitCodes.has(code)) return 429;
  if (timeoutCodes.has(code)) return 504;
  return 502;
}

type FailureStage =
  | "session"
  | "installation_query"
  | "token_create"
  | "repository_page"
  | "token_revoke"
  | "http";

const sensitiveFieldsForbidden = [
  "token",
  "app_jwt",
  "authorization",
  "repository.name",
  "repository.full_name",
  "owner.login",
  "raw_github_body",
] as const;

function stageForFailure(code: string): FailureStage {
  if (code === "unauthenticated") return "session";
  if (code === "github_installation_token_revoke_failed") {
    return "token_revoke";
  }
  if (
    code.startsWith("github_installation_token") ||
    code.startsWith("github_app")
  ) {
    return "token_create";
  }
  if (code.startsWith("github_repository")) return "repository_page";
  if (code.startsWith("github_installation")) {
    return "installation_query";
  }
  return "http";
}

export const githubRepositoryFailureDefinitions: Record<
  string,
  {
    readonly stage: FailureStage;
    readonly publicCode: string;
    readonly httpStatus: number;
    readonly retryable: boolean;
    readonly tokenCreated: boolean;
    readonly revocationAttempted: boolean;
    readonly partialDataReturned: false;
    readonly sensitiveFieldsForbidden: typeof sensitiveFieldsForbidden;
  }
> = Object.fromEntries(
  publicFailureCodeOrder.map((code) => {
    const httpStatus = statusForFailure(code);
    const stage = stageForFailure(code);
    const tokenCreated =
      stage === "repository_page" || stage === "token_revoke";

    return [
      code,
      {
        stage,
        publicCode: code,
        httpStatus,
        retryable:
          httpStatus === 429 ||
          httpStatus === 503 ||
          httpStatus === 504 ||
          code.endsWith("_unavailable") ||
          code === "github_repository_list_failed" ||
          code === "github_installation_token_revoke_failed",
        tokenCreated,
        revocationAttempted: tokenCreated,
        partialDataReturned: false,
        sensitiveFieldsForbidden,
      },
    ];
  }),
);

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "Cookie",
};

export async function handleGitHubRepositoryList(input: {
  readonly request: Request;
  readonly execute: () => Promise<AuthorizedRepositoryList>;
  readonly onFailure?: (code: string, status: number) => void;
}) {
  void input.request;

  try {
    const result = await input.execute();

    return Response.json(result, {
      status: 200,
      headers: privateHeaders,
    });
  } catch (error) {
    const code = publicFailureCode(error);
    const status = statusForFailure(code);
    input.onFailure?.(code, status);

    return Response.json(
      {
        error: {
          code,
          message: safeMessage,
        },
      },
      {
        status,
        headers: privateHeaders,
      },
    );
  }
}

type FailureRecordInput = {
  readonly failureId: string;
  readonly requestId: string;
  readonly stage:
    FailureStage;
  readonly failureCode: string;
  readonly sessionValid: boolean | null;
  readonly installationFound: boolean | null;
  readonly installationStatus:
    | "active"
    | "suspended"
    | "revoked"
    | null;
  readonly tokenCreated: boolean;
  readonly tokenUsed: boolean;
  readonly revocationAttempted: boolean;
  readonly tokenRevoked: boolean | null;
  readonly pageNumber: number | null;
  readonly expectedTotalCount: number | null;
  readonly observedTotalCount: number | null;
  readonly repositoriesCollected: number;
  readonly httpStatus: number;
};

export function createGitHubRepositoryFailureRecord(
  input: FailureRecordInput,
) {
  return {
    contract_version: githubRepositoryFailureContract,
    phase: "phase_4",
    failure_id: input.failureId,
    request_id: input.requestId,
    stage: input.stage,
    failure_code: input.failureCode,
    session_valid: input.sessionValid,
    installation_found: input.installationFound,
    installation_status: input.installationStatus,
    token_created: input.tokenCreated,
    token_used: input.tokenUsed,
    revocation_attempted: input.revocationAttempted,
    token_revoked: input.tokenRevoked,
    page_number: input.pageNumber,
    expected_total_count: input.expectedTotalCount,
    observed_total_count: input.observedTotalCount,
    repositories_collected: input.repositoriesCollected,
    partial_data_returned: false,
    http_status: input.httpStatus,
    safe_message: safeMessage,
    sensitive_marker_found: false,
  } as const;
}
