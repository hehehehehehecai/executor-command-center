import type { AuthFailureCode } from "./complete-github-sign-in";

export const authLogRedactionContractVersion =
  "auth-log-redaction.v1" as const;

type AuthFailureLogInput = {
  readonly failureId: string;
  readonly requestId: string;
  readonly failureCode: AuthFailureCode;
  readonly oauthStage: string;
  readonly sessionCreated: boolean;
  readonly identityPersisted: boolean;
  readonly redirectTarget: string;
  readonly unsafeContext?: unknown;
};

export function createAuthFailureLog(input: AuthFailureLogInput) {
  return {
    contractVersion: authLogRedactionContractVersion,
    failureId: input.failureId,
    requestId: input.requestId,
    phase: "phase_2" as const,
    failureCode: input.failureCode,
    failureCategory: "authentication" as const,
    oauthStage: input.oauthStage,
    provider: "github" as const,
    safeMessage: "GitHub sign-in could not be completed.",
    sessionCreated: input.sessionCreated,
    identityPersisted: input.identityPersisted,
    redirectTarget: input.redirectTarget,
    sensitiveFieldsRedacted: true,
  };
}
