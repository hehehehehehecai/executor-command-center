import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SupabaseConnectedPanelReader } from "./supabase-connected-panel-reader";

const userId = "11111111-1111-4111-8111-111111111111";
const foreignUserId = "99999999-9999-4999-8999-999999999999";
const projectId = "22222222-2222-4222-8222-222222222222";
const selectionId = "33333333-3333-4333-8333-333333333333";
const installationRowId = "44444444-4444-4444-8444-444444444444";

type QueryResult = { readonly data: unknown; readonly error: unknown };

function clientFixture(input: {
  readonly projectRows?: unknown;
  readonly projectError?: unknown;
  readonly tableRows?: Readonly<Record<string, unknown>>;
}) {
  const calls: Array<{
    table: string;
    filters: Array<[string, string, unknown]>;
    limit: number | null;
    order: string | null;
  }> = [];

  return {
    calls,
    client: {
      from(table: string) {
        return {
          select() {
            const call = {
              table,
              filters: [] as Array<[string, string, unknown]>,
              limit: null as number | null,
              order: null as string | null,
            };
            calls.push(call);
            const query = {
              eq(column: string, value: unknown) {
                call.filters.push(["eq", column, value]);
                return query;
              },
              neq(column: string, value: unknown) {
                call.filters.push(["neq", column, value]);
                return query;
              },
              order(column: string) {
                call.order = column;
                return query;
              },
              limit(value: number) {
                call.limit = value;
                return query;
              },
              then<TResult1 = QueryResult, TResult2 = never>(
                onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
              ) {
                const result: QueryResult = table === "projects"
                  ? { data: input.projectRows ?? [], error: input.projectError ?? null }
                  : { data: input.tableRows?.[table] ?? [], error: null };
                return Promise.resolve(result).then(onfulfilled, onrejected);
              },
            };
            return query;
          },
        };
      },
    },
  };
}

function ownedProject(owner = userId) {
  return {
    id: projectId,
    user_id: userId,
    core_goal: "Ship the safe beta",
    current_stage_goal: "Verify connected panels",
    status: "polishing",
    current_blocker: null,
    updated_at: "2026-08-29T05:00:00.000Z",
    selected_repositories: {
      id: selectionId,
      user_id: owner,
      full_name: "hecaitest1/executor-stage6-staging-fixture",
      owner_login: "hecaitest1",
      name: "executor-stage6-staging-fixture",
      visibility: "private",
      default_branch: "main",
      github_installations: {
        id: installationRowId,
        user_id: owner,
        installation_id: 157171025,
        status: "active",
      },
    },
  };
}

describe("SupabaseConnectedPanelReader", () => {
  it("reads only the verified user's owned project and project-scoped facts", async () => {
    const fixture = clientFixture({
      projectRows: [ownedProject()],
      tableRows: {
        github_commits: [{
          project_id: projectId,
          github_object_id: "a".repeat(40),
          source_updated_at: "2026-08-29T04:00:00.000Z",
          source_version: "a".repeat(40),
          message: "STAGE6-FIXTURE commit",
          authored_at: "2026-08-29T03:59:00.000Z",
          committed_at: "2026-08-29T04:00:00.000Z",
          author_login: "hecaitest1",
        }],
        github_issues: [{
          project_id: projectId,
          github_object_id: "501",
          source_updated_at: "2026-08-29T04:30:00.000Z",
          source_version: "2026-08-29T04:30:00.000Z",
          issue_number: 1,
          title: "STAGE6-FIXTURE issue",
          state: "closed",
          author_login: "hecaitest1",
          closed_at: "2026-08-29T04:30:00.000Z",
        }],
        sync_runs: [{
          id: "55555555-5555-4555-8555-555555555555",
          project_id: projectId,
          trigger_source: "manual",
          status: "completed",
          queued_at: "2026-08-29T04:40:00.000Z",
          started_at: "2026-08-29T04:40:01.000Z",
          finished_at: "2026-08-29T04:40:02.000Z",
          error_code: null,
        }],
        project_briefs: [{
          id: "66666666-6666-4666-8666-666666666666",
          project_id: projectId,
          status: "completed",
          created_at: "2026-08-29T04:50:00.000Z",
          completed_at: "2026-08-29T04:50:03.000Z",
          error_code: null,
        }],
      },
    });
    const reader = new SupabaseConnectedPanelReader(fixture.client as never);

    const result = await reader.read({ userId, projectId });

    expect(result?.project).toMatchObject({
      id: projectId,
      name: "executor-stage6-staging-fixture",
      repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
      status: "polishing",
    });
    expect(result?.activities).toHaveLength(2);
    expect(result?.syncRuns).toHaveLength(1);
    expect(result?.briefs).toHaveLength(1);
    expect(fixture.calls[0]).toMatchObject({
      table: "projects",
      filters: [
        ["eq", "user_id", userId],
        ["neq", "status", "archived"],
        ["eq", "id", projectId],
      ],
      limit: 1,
      order: "updated_at",
    });
    for (const call of fixture.calls.slice(1)) {
      expect(call.filters).toContainEqual(["eq", "project_id", projectId]);
    }
  });

  it("returns not found without probing project facts when no owned project exists", async () => {
    const fixture = clientFixture({ projectRows: [] });
    const reader = new SupabaseConnectedPanelReader(fixture.client as never);

    await expect(reader.read({ userId, projectId })).resolves.toBeNull();
    expect(fixture.calls.map(({ table }) => table)).toEqual(["projects"]);
  });

  it("fails closed when nested ownership does not match the verified user", async () => {
    const fixture = clientFixture({ projectRows: [ownedProject(foreignUserId)] });
    const reader = new SupabaseConnectedPanelReader(fixture.client as never);

    await expect(reader.read({ userId, projectId })).rejects.toThrow(
      "connected_panel_read_failed",
    );
    expect(fixture.calls.map(({ table }) => table)).toEqual(["projects"]);
  });

  it("normalizes storage failures without exposing provider details", async () => {
    const fixture = clientFixture({
      projectError: new Error("SQL private table stack and token"),
    });
    const reader = new SupabaseConnectedPanelReader(fixture.client as never);

    await expect(reader.read({ userId, projectId })).rejects.toThrow(
      "connected_panel_read_failed",
    );
  });
});
