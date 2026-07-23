import type { CompleteGitHubSignInResult } from "@/application/auth/complete-github-sign-in";
import type { StartGitHubSignInResult } from "@/application/auth/start-github-sign-in";

type StartExecutor = (input: {
  trustedOrigin: string;
  returnTo: string | null;
}) => Promise<StartGitHubSignInResult>;

type CompleteExecutor = (input: {
  code: string | null;
  providerError: string | null;
  returnTo: string | null;
}) => Promise<CompleteGitHubSignInResult>;

function redirect(location: string | URL) {
  return new Response(null, {
    status: 303,
    headers: { location: location.toString() },
  });
}

export async function handleGitHubOAuthStart(input: {
  readonly request: Request;
  readonly execute: StartExecutor;
  readonly trustedOrigin: string;
  readonly onFailure?: (code: string) => void;
}) {
  const requestUrl = new URL(input.request.url);
  const result = await input.execute({
    trustedOrigin: input.trustedOrigin,
    returnTo: requestUrl.searchParams.get("returnTo"),
  });

  if (result.kind === "failure") {
    input.onFailure?.(result.code);
    return redirect(new URL("/auth/error", input.trustedOrigin));
  }

  return redirect(result.providerUrl);
}

export async function handleGitHubOAuthCallback(input: {
  readonly request: Request;
  readonly execute: CompleteExecutor;
  readonly trustedOrigin: string;
  readonly onFailure?: (code: string) => void;
}) {
  const requestUrl = new URL(input.request.url);
  const result = await input.execute({
    code: requestUrl.searchParams.get("code"),
    providerError: requestUrl.searchParams.get("error"),
    returnTo: requestUrl.searchParams.get("returnTo"),
  });

  if (result.kind === "failure") input.onFailure?.(result.code);
  return redirect(new URL(result.redirectTo, input.trustedOrigin));
}
