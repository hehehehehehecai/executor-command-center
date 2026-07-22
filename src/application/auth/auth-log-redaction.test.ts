import { describe, expect, it } from "vitest";

import { createAuthFailureLog } from "./auth-log-redaction";

describe("auth-log-redaction.v1", () => {
  it("keeps only the frozen safe fields", () => {
    const record = createAuthFailureLog({
      failureId: "failure-fixture-1",
      requestId: "request-fixture-1",
      failureCode: "callback_exchange_failed",
      oauthStage: "callback_exchange",
      sessionCreated: false,
      identityPersisted: false,
      redirectTarget: "/auth/error",
      unsafeContext: {
        code: "synthetic-callback-code",
        access_token: "not-a-real-token",
        refresh_token: "not-a-real-token",
        provider_token: "not-a-real-token",
        cookie: "fixture-cookie",
        authorization: "Bearer not-a-real-token",
        service_role_key: "fixture-only",
      },
    });

    expect(record).toEqual({
      contractVersion: "auth-log-redaction.v1",
      failureId: "failure-fixture-1",
      requestId: "request-fixture-1",
      phase: "phase_2",
      failureCode: "callback_exchange_failed",
      failureCategory: "authentication",
      oauthStage: "callback_exchange",
      provider: "github",
      safeMessage: "GitHub sign-in could not be completed.",
      sessionCreated: false,
      identityPersisted: false,
      redirectTarget: "/auth/error",
      sensitiveFieldsRedacted: true,
    });
    expect(JSON.stringify(record)).not.toMatch(
      /synthetic-callback-code|not-a-real-token|fixture-cookie|service_role/i,
    );
  });
});
