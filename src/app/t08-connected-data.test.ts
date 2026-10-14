import { describe, expect, it } from "vitest";
import { SupabaseConnectedPanelReader } from "@/infrastructure/connected-panels/supabase-connected-panel-reader";
import { mapDecisionArchiveConnectedSource, mapMissionControlConnectedSource, mapFlightLogConnectedSource } from "./connected-panel-source-mappers";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const foreign = "99999999-9999-4999-8999-999999999999";
const at = "2026-10-09T08:00:00.000Z";
function project(status = "active") {
  return { id: projectId, user_id: userId, core_goal: null, current_stage_goal: null, status: null, current_blocker: null, updated_at: at,
    selected_repositories: { id: "33333333-3333-4333-8333-333333333333", user_id: userId, full_name: "owner/repo", owner_login: "owner", name: "repo", visibility: "private", default_branch: "main",
      github_installations: { id: "44444444-4444-4444-8444-444444444444", user_id: userId, installation_id: 1, status } } };
}
function client(rows: Record<string, unknown[]> = {}, failed?: string) {
  const calls: string[] = [];
  return { calls, client: { from(table: string) { return { select() {
    calls.push(table);
    const query = { eq: () => query, or: () => query, order: () => query, limit: () => query,
      then: (resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: table === failed ? new Error("provider secret") : null }).then(resolve, reject) };
    return query;
  } }; } } };
}
async function read(rows: Record<string, unknown[]> = {}) {
  const fixture = client({ projects: [project()], ...rows });
  return (await new SupabaseConnectedPanelReader(fixture.client as never).read({ userId, projectId }))!;
}
const issue = { project_id: projectId, github_object_id: "501", source_updated_at: at, source_version: "version-one", issue_number: 7, title: "Owned issue", state: "open", author_login: "owner", closed_at: null };
const sync = { id: "55555555-5555-4555-8555-555555555555", project_id: projectId, trigger_source: "manual", status: "completed", queued_at: at, started_at: at, finished_at: at, error_code: null };

describe("T08 owned read boundary and genuine states", () => {
  it("binds the selected owner/project/repository/installation and recent read scope", async () => {
    const data = await read({ github_issues: [issue] });
    expect(data).toMatchObject({ readContext: { userId, projectId, repositoryId: "33333333-3333-4333-8333-333333333333", installationId: "44444444-4444-4444-8444-444444444444", installationStatus: "active", maximumRowsPerSource: 100 } });
    expect(data.project.status).toBeNull();
  });
  it("rejects a returned project different from the requested project", async () => {
    const fixture = client({ projects: [{ ...project(), id: foreign }] });
    await expect(new SupabaseConnectedPanelReader(fixture.client as never).read({ userId, projectId })).rejects.toThrow("connected_panel_read_failed");
    expect(fixture.calls).toEqual(["projects"]);
  });
  it.each(["github_issues", "sync_runs", "project_briefs"])("rejects foreign returned fact %s", async table => {
    const row = table === "github_issues" ? issue : table === "sync_runs" ? sync : { id: sync.id, project_id: projectId, status: "completed", created_at: at, completed_at: at, error_code: null };
    await expect(read({ [table]: [{ ...row, project_id: foreign }] })).rejects.toThrow("connected_panel_read_failed");
  });
  it("distinguishes not synced from a successful empty synchronized query", async () => {
    const before = mapMissionControlConnectedSource(await read());
    const after = mapMissionControlConnectedSource(await read({ sync_runs: [sync] }));
    expect(before).toMatchObject({ readState: { kind: "not_synced" } });
    expect(after).toMatchObject({ readState: { kind: "empty" } });
  });
  it.each(["revoked", "suspended"])("retains authorization guidance for %s instead of claiming successful empty", async status => {
    const data = await read({ projects: [project(status)] });
    expect(mapFlightLogConnectedSource(data)).toMatchObject({ readState: { kind: "authorization_revoked" } });
  });
  it("keeps storage failure a failure rather than an empty read", async () => {
    const fixture = client({ projects: [project()] }, "github_issues");
    await expect(new SupabaseConnectedPanelReader(fixture.client as never).read({ userId, projectId })).rejects.toThrow("connected_panel_read_failed");
  });
  it("keeps sync failure distinct from never synchronized", async () => {
    const data = await read({ sync_runs: [{ ...sync, status: "failed", error_code: "github_activity_unavailable" }] });
    expect(mapFlightLogConnectedSource(data)).toMatchObject({ readState: { kind: "sync_failed" } });
  });
  it("filters mission facts before bounding and retains occurred time, source state and version", async () => {
    const data = await read({ github_issues: [issue] });
    const recent = Array.from({ length: 100 }, (_, i) => ({ ...data.activities[0]!, sourceKind: "github_commit" as const, sourceId: `commit-${i}`, occurredAt: "2026-10-09T09:00:00.000Z", facts: {} }));
    const source = mapMissionControlConnectedSource({ ...data, activities: [...recent, ...data.activities] });
    expect(source.recordedTasks).toHaveLength(1);
    expect(source.recordedTasks[0]).toMatchObject({ id: "github_issue:501", occurredAt: at, sourceVersion: "version-one", sourceState: "open" });
    expect(source.suggestions).toEqual([]);
  });
  it("reports decision persistence not enabled instead of claiming a successful zero", async () => {
    expect(mapDecisionArchiveConnectedSource(await read())).toMatchObject({ readState: { kind: "not_enabled" } });
  });
  it("maps an actual owned read-only decision-port nonempty result without creating candidates", async () => {
    const data = await read();
    const record = { id: "decision-1", decision: "Use verified facts", confirmationReason: "User chose this", alternatives: [], references: [], status: "active" as const, revisitCondition: null, createdVia: "manual" as const, confirmedBy: "owner", confirmedAt: at, sourceCandidateId: null };
    const result = { kind: "ready" as const, userId, projectId, records: [{ userId, projectId, record }] };
    const source = mapDecisionArchiveConnectedSource(data, result);
    expect(source.records).toEqual([record]);
    expect(source.candidates).toEqual([]);
    expect(source).toMatchObject({ readState: { kind: "ready" } });
  });
  it.each(["owner", "project", "row-owner", "row-project"])("rejects decision read-port mismatch %s", async field => {
    const data = await read();
    const result = { kind: "ready" as const, userId: field === "owner" ? foreign : userId, projectId: field === "project" ? foreign : projectId, records: [{ userId: field === "row-owner" ? foreign : userId, projectId: field === "row-project" ? foreign : projectId, record: {} }] };
    expect(() => mapDecisionArchiveConnectedSource(data, result as never)).toThrow("connected_panel_read_failed");
  });
});
