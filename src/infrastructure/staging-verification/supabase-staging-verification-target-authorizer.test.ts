import { describe, expect, it } from "vitest";

import { SupabaseStagingVerificationTargetAuthorizer } from "./supabase-staging-verification-target-authorizer";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const selectionId = "33333333-3333-4333-8333-333333333333";
const installationRowId = "44444444-4444-4444-8444-444444444444";
const expected = {
  projectId,
  installationId: 157171025,
  repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
};

type Row = Record<string, unknown>;

function client(rows: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        limit() {
          const data = (rows[table] ?? []).filter((row) =>
            filters.every(([column, value]) => row[column] === value),
          ).slice(0, 1);
          return Promise.resolve({ data, error: null });
        },
      };
      return query;
    },
  };
}

function fixture(overrides: Partial<Record<string, Row[]>> = {}) {
  return new SupabaseStagingVerificationTargetAuthorizer(client({
    projects: [{ id: projectId, user_id: userId, selected_repository_id: selectionId }],
    selected_repositories: [{
      id: selectionId,
      user_id: userId,
      github_installation_id: installationRowId,
      github_repository_id: 1348250652,
      full_name: expected.repositoryFullName,
    }],
    github_installations: [{
      id: installationRowId,
      user_id: userId,
      installation_id: expected.installationId,
      status: "active",
      suspended_at: null,
      revoked_at: null,
    }],
    ...overrides,
  }) as never);
}

describe("SupabaseStagingVerificationTargetAuthorizer", () => {
  it("returns only the exact owned active target", async () => {
    await expect(fixture().assertTarget({ userId, expected })).resolves.toEqual({
      ...expected,
      repositoryId: 1348250652,
    });
  });

  it.each([
    ["wrong user", { projects: [] }],
    ["wrong repository", { selected_repositories: [] }],
    ["suspended", { github_installations: [{ id: installationRowId, user_id: userId, installation_id: expected.installationId, status: "suspended", suspended_at: "2026-08-31T00:00:00.000Z", revoked_at: null }] }],
    ["revoked", { github_installations: [{ id: installationRowId, user_id: userId, installation_id: expected.installationId, status: "revoked", suspended_at: null, revoked_at: "2026-08-31T00:00:00.000Z" }] }],
  ])("fails closed for %s", async (_name, rows) => {
    await expect(fixture(rows).assertTarget({ userId, expected }))
      .rejects.toThrow("staging_verification_forbidden");
  });

  it("normalizes storage failures without leaking details", async () => {
    const broken = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          limit() { return Promise.resolve({ data: null, error: { message: "private sql" } }); },
        };
      },
    };
    await expect(new SupabaseStagingVerificationTargetAuthorizer(broken as never).assertTarget({ userId, expected }))
      .rejects.toThrow("staging_verification_forbidden");
  });
});
