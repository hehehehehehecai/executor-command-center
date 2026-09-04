import { describe, expect, it, vi } from "vitest";

import { SupabaseProjectBriefAuthorizationGate } from "./supabase-project-brief-authorization-gate";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const selectionId = "33333333-3333-4333-8333-333333333333";
const installationId = "44444444-4444-4444-8444-444444444444";

type Result = { readonly data: unknown; readonly error: unknown };
class Query implements PromiseLike<Result> {
  constructor(private readonly result: Result) {}
  select() { return this; }
  eq() { return this; }
  limit() { return this; }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) { return Promise.resolve(this.result).then(onfulfilled, onrejected); }
}

function gate(status: "active" | "suspended" | "revoked") {
  const results: Result[] = [
    { data: [{ id: projectId, user_id: actorUserId, selected_repository_id: selectionId }], error: null },
    { data: [{ id: selectionId, user_id: actorUserId, github_installation_id: installationId }], error: null },
    { data: [{ id: installationId, user_id: actorUserId, status }], error: null },
  ];
  const from = vi.fn<(table: string) => Query>(() => new Query(results.shift()!));
  return { subject: new SupabaseProjectBriefAuthorizationGate({ from }), from };
}

describe("SupabaseProjectBriefAuthorizationGate", () => {
  it("accepts only an active installation bound through the owned project", async () => {
    const fixture = gate("active");
    await expect(fixture.subject.assertActive({ actorUserId, projectId })).resolves.toBeUndefined();
    expect(fixture.from.mock.calls.map(([table]) => table)).toEqual([
      "projects", "selected_repositories", "github_installations",
    ]);
  });

  it.each(["suspended", "revoked"] as const)(
    "fails closed for %s before an AI provider boundary",
    async (status) => {
      const fixture = gate(status);
      await expect(fixture.subject.assertActive({ actorUserId, projectId }))
        .rejects.toThrow("project_brief_authorization_failed");
    },
  );

  it("does not disclose whether a malformed or invisible project exists", async () => {
    const from = vi.fn<(table: string) => Query>(
      () => new Query({ data: [], error: null }),
    );
    const subject = new SupabaseProjectBriefAuthorizationGate({ from });
    await expect(subject.assertActive({ actorUserId, projectId }))
      .rejects.toThrow("project_brief_authorization_failed");
    await expect(subject.assertActive({ actorUserId: "bad", projectId }))
      .rejects.toThrow("project_brief_authorization_failed");
  });
});
