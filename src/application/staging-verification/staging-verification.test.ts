import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  ConsumeStagingVerificationTicket,
  CreateStagingVerificationTicket,
  assertStagingVerificationEnvironment,
  stagingVerificationContract,
  type StagingVerificationOperation,
  type StagingVerificationStateRepository,
} from "./staging-verification";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const caseId = "phase8-13-case-001";
const operation: StagingVerificationOperation = "webhook-replay";

function repository() {
  const rows = new Map<string, {
    userId: string;
    returnTo: string;
    expiresAt: string;
    consumed: boolean;
  }>();
  const state: StagingVerificationStateRepository = {
    async create(input) {
      rows.set(input.stateHash, { ...input, consumed: false });
      return { stateRecordId: "33333333-3333-4333-8333-333333333333" };
    },
    async consume(input) {
      const row = rows.get(input.stateHash);
      if (!row) throw new Error("staging_verification_token_invalid");
      if (row.userId !== input.userId) throw new Error("staging_verification_token_wrong_user");
      if (row.expiresAt <= "2026-08-29T12:04:59.000Z") {
        throw new Error("staging_verification_token_expired");
      }
      if (row.consumed) throw new Error("staging_verification_token_replayed");
      row.consumed = true;
      return { returnTo: row.returnTo };
    },
  };
  return { state, rows };
}

describe("staging verification environment", () => {
  const valid = {
    STAGING_VERIFICATION_ENABLED: "1",
    STAGING_VERIFICATION_PROJECT_ID: projectId,
    STAGING_VERIFICATION_INSTALLATION_ID: "157171025",
    STAGING_VERIFICATION_REPOSITORY: "hecaitest1/executor-stage6-staging-fixture",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
  } as const;

  it("accepts only the explicit preview staging branch contract", () => {
    expect(assertStagingVerificationEnvironment(valid)).toEqual({
      projectId,
      installationId: 157171025,
      repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
    });
  });

  it.each([
    ["disabled", { STAGING_VERIFICATION_ENABLED: "0" }],
    ["production", { VERCEL_ENV: "production" }],
    ["wrong branch", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["missing project", { STAGING_VERIFICATION_PROJECT_ID: undefined }],
    ["bad installation", { STAGING_VERIFICATION_INSTALLATION_ID: "0" }],
    ["bad repository", { STAGING_VERIFICATION_REPOSITORY: "fixture" }],
  ])("fails closed for %s", (_name, override) => {
    expect(() => assertStagingVerificationEnvironment({ ...valid, ...override }))
      .toThrow("staging_verification_unavailable");
  });
});

describe("staging verification single-use ticket", () => {
  it("stores only a SHA-256 digest and consumes the exact user/project/case/operation once", async () => {
    const fixture = repository();
    const randomBytes = vi.fn(() => new Uint8Array(32).fill(7));
    const issuer = new CreateStagingVerificationTicket(fixture.state, {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      randomBytes,
    });
    const issued = await issuer.execute({ userId, projectId, caseId, operation });

    expect(issued.contractVersion).toBe(stagingVerificationContract);
    expect(issued.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = createHash("sha256").update(issued.rawToken, "utf8").digest("hex");
    expect([...fixture.rows.keys()]).toEqual([digest]);
    expect(JSON.stringify([...fixture.rows.values()])).not.toContain(issued.rawToken);

    const consumer = new ConsumeStagingVerificationTicket(fixture.state);
    await expect(consumer.execute({
      userId,
      projectId,
      caseId,
      operation,
      rawToken: issued.rawToken,
    })).resolves.toMatchObject({ caseId, operation, projectId });
    await expect(consumer.execute({
      userId,
      projectId,
      caseId,
      operation,
      rawToken: issued.rawToken,
    })).rejects.toThrow("staging_verification_token_replayed");
  });

  it.each([
    ["wrong project", { projectId: "44444444-4444-4444-8444-444444444444" }],
    ["wrong case", { caseId: "phase8-13-case-002" }],
    ["wrong operation", { operation: "reconciliation" as const }],
  ])("rejects %s without accepting a loosely related ticket", async (_name, override) => {
    const fixture = repository();
    const issuer = new CreateStagingVerificationTicket(fixture.state, {
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      randomBytes: () => new Uint8Array(32).fill(9),
    });
    const issued = await issuer.execute({ userId, projectId, caseId, operation });
    await expect(new ConsumeStagingVerificationTicket(fixture.state).execute({
      userId,
      projectId,
      caseId,
      operation,
      rawToken: issued.rawToken,
      ...override,
    })).rejects.toThrow("staging_verification_token_binding_mismatch");
  });

  it("rejects malformed and wrong-user tokens without exposing their value", async () => {
    const fixture = repository();
    const consumer = new ConsumeStagingVerificationTicket(fixture.state);
    await expect(consumer.execute({
      userId,
      projectId,
      caseId,
      operation,
      rawToken: "not-a-token",
    })).rejects.toThrow("staging_verification_token_invalid");
  });
});
