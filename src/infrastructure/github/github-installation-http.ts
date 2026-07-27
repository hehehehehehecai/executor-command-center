import { safeReturnTo } from "@/application/auth/safe-return-to";

type StartExecutor = (input: {
  returnTo: string | null;
}) => Promise<{ installationUrl: string }>;

type SetupExecutor = (input: {
  rawState: string | null;
  installationId: string | null;
}) => Promise<{
  redirectTo: string;
  installationStatus: "active" | "suspended";
  installationRecordId: string;
}>;

const stableFailureCodes = new Set([
  "unauthenticated",
  "github_app_configuration_missing",
  "installation_state_generation_failed",
  "installation_state_persistence_failed",
  "installation_state_missing",
  "installation_state_invalid",
  "installation_state_expired",
  "installation_state_replayed",
  "installation_state_wrong_user",
  "installation_id_invalid",
  "github_installation_not_found",
  "github_app_authentication_failed",
  "github_api_forbidden",
  "github_api_rate_limited",
  "github_api_timeout",
  "github_api_invalid_response",
  "github_api_unavailable",
  "installation_account_mismatch",
  "unsupported_installation_account_type",
  "installation_app_mismatch",
  "installation_id_mismatch",
  "current_github_identity_missing",
  "github_installation_already_bound",
  "installation_persistence_failed",
]);

function failureCode(error: unknown) {
  if (
    error instanceof Error &&
    stableFailureCodes.has(error.message)
  ) {
    return error.message;
  }

  return "github_installation_registration_failed";
}

type FailureRecordInput = {
  readonly failureId: string;
  readonly stage: "installation_start" | "installation_setup";
  readonly requestId: string;
  readonly failureCode: string;
  readonly installationIdPresent: boolean;
  readonly stateValid: boolean | null;
  readonly sessionValid: boolean | null;
  readonly githubApiCalled: boolean | null;
  readonly accountType: string | null;
  readonly ownershipMatch: boolean | null;
  readonly installationPersisted: boolean | null;
};

export function createGitHubInstallationFailureRecord(
  input: FailureRecordInput,
) {
  return {
    contract_version: "github-installation-registration.v1",
    failure_id: input.failureId,
    phase: "phase_3",
    stage: input.stage,
    request_id: input.requestId,
    failure_code: input.failureCode,
    installation_id_present: input.installationIdPresent,
    state_valid: input.stateValid,
    session_valid: input.sessionValid,
    github_api_called: input.githubApiCalled,
    account_type: input.accountType,
    ownership_match: input.ownershipMatch,
    installation_persisted: input.installationPersisted,
    safe_message: "GitHub App installation registration failed.",
    sensitive_fields_redacted: true,
  } as const;
}

function redirect(location: string | URL) {
  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location: location.toString(),
    },
  });
}

export async function handleGitHubInstallationStart(input: {
  readonly request: Request;
  readonly trustedOrigin: string;
  readonly execute: StartExecutor;
  readonly onFailure?: (code: string) => void;
}) {
  try {
    const requestUrl = new URL(input.request.url);
    const result = await input.execute({
      returnTo: requestUrl.searchParams.get("returnTo"),
    });

    return redirect(result.installationUrl);
  } catch (error) {
    input.onFailure?.(failureCode(error));
    return redirect(new URL("/auth/error", input.trustedOrigin));
  }
}

export async function handleGitHubInstallationSetup(input: {
  readonly request: Request;
  readonly trustedOrigin: string;
  readonly execute: SetupExecutor;
  readonly onFailure?: (code: string) => void;
}) {
  try {
    const requestUrl = new URL(input.request.url);
    const result = await input.execute({
      rawState: requestUrl.searchParams.get("state"),
      installationId: requestUrl.searchParams.get("installation_id"),
    });

    return redirect(
      new URL(safeReturnTo(result.redirectTo), input.trustedOrigin),
    );
  } catch (error) {
    input.onFailure?.(failureCode(error));
    return redirect(
      new URL(
        "/onboarding?installation=configuration_failed",
        input.trustedOrigin,
      ),
    );
  }
}
