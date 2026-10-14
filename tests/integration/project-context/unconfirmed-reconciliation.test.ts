import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contextFixture, type ContextFixture } from "./project-context-fixture";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";
import { SupabaseProjectContextWriter } from "@/infrastructure/project-calibration/supabase-project-context-writer";
import { SupabaseReconciliationStore } from "@/infrastructure/synchronization/supabase-reconciliation-store";
import { SupabaseFirstSyncStore } from "@/infrastructure/synchronization/supabase-first-sync-store";
import { ProjectSyncRequestCoordinator, RunDailyRepositoryReconciliation } from "@/application/synchronization/reconciliation-use-cases";
import { ExecuteProjectSynchronization } from "@/application/synchronization/project-sync-use-cases";
import type { BackgroundJob } from "@/domain/jobs/background-job";
import { projectStatuses } from "@/domain/project-calibration/project-calibration";

describe("T05 真实 SQL 到应用每日对账与既有同步链", () => {
  const definitions = [
    { status: null, installation: "active" },
    ...projectStatuses.map(status => ({ status, installation: "active" })),
    { status: null, installation: "suspended" },
    { status: null, installation: "revoked" },
  ] as const;
  const fixtures: { identity: ContextFixture; projectId: string; status: typeof projectStatuses[number] | null; installation: string }[] = [];
  const registered: ContextFixture[] = [];
  const jobs: BackgroundJob[] = [];
  const remoteProjectIds: string[] = [];
  const realFetch = globalThis.fetch;
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let store: SupabaseReconciliationStore;
  const scheduledAt = new Date().toISOString();
  let networkCount = 0;
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(configuration.apiUrl).origin) throw new Error("t05_reconciliation_external_network_forbidden");
      verifyIsolatedDatabase(); networkCount += 1;
      return realFetch(input, init);
    });
    const options = { supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey };
    const writer = new SupabaseProjectContextWriter(options);
    store = new SupabaseReconciliationStore(options);
    for (const definition of definitions) {
      const identity = contextFixture(configuration, `t05-reconciliation-${definition.status ?? "null"}-${definition.installation}`);
      registered.push(identity); await identity.seed();
      const owner = `t05-${identity.userId.replaceAll("-", "")}`;
      fixtureEvent("t05_reconciliation_case_registered", { userId: identity.userId, selectedRepositoryId: identity.selectedRepositoryId, installationId: identity.installationId, ...definition, repositoryFullName: `${owner}/repository` });
      workspaceSql(`UPDATE public.selected_repositories SET owner_login='${owner}',full_name='${owner}/repository' WHERE id='${identity.selectedRepositoryId}' AND user_id='${identity.userId}';`);
      const projectId = (await writer.create({ userId: identity.userId, selectedRepositoryId: identity.selectedRepositoryId })).id;
      identity.observe(projectId);
      if (definition.status !== null) await writer.patch({ userId: identity.userId, projectId, changes: { status: definition.status } });
      if (definition.installation !== "active") workspaceSql(`UPDATE public.github_installations SET status='${definition.installation}',${definition.installation === "suspended" ? "suspended_at" : "revoked_at"}=now() WHERE id='${identity.installationId}' AND user_id='${identity.userId}';`);
      fixtures.push({ identity, projectId, ...definition });
    }
  }, 180_000);
  afterAll(async () => {
    const failures: unknown[] = [];
    for (const identity of registered) { try { await identity.cleanup(); } catch (error) { failures.push(error); } }
    fixtureEvent("t05_reconciliation_cleanup", { registeredUsers: registered.map(row => row.userId), failures: failures.length, networkCount, externalNetworkRequests: 0 });
    vi.unstubAllGlobals();
    if (failures.length) throw new AggregateError(failures, "t05_reconciliation_cleanup_failed");
  }, 180_000);

  it("真实 RPC 精确返回 null 与原三个活跃状态，应用阻止暂停撤权并只派发四个项目", async () => {
    const expected = fixtures.filter(row => row.status === null || ["in_planning", "in_development", "polishing"].includes(row.status));
    const eligible = await store.listEligible({ snapshotSince: new Date(Date.parse(scheduledAt) - 90 * 86_400_000).toISOString() });
    expect(eligible.map(row => row.projectId).sort()).toEqual(expected.map(row => row.projectId).sort());
    for (const project of eligible) expect(Object.keys(project.localFacts).sort()).toEqual(["commit", "issue", "pull_request", "release", "repository", "workflow_run"]);
    const coordinator = new ProjectSyncRequestCoordinator({ store, dispatcher: { dispatch: async job => {
      jobs.push(job);
      fixtureEvent("t05_reconciliation_job_observed", { projectId: job.projectId, syncRunId: job.syncRunId, requestIdentity: job.idempotencyKey });
      return { providerJobId: `t05-synthetic-${job.syncRunId}` };
    } } });
    const runner = new RunDailyRepositoryReconciliation({ projects: store, coordinator, reader: { readMinimalFacts: async project => {
      remoteProjectIds.push(project.projectId);
      return { ...project.localFacts, commit: "f".repeat(64) };
    } } });
    const result = await runner.execute({ scheduledAt });
    const active = expected.filter(row => row.installation === "active").map(row => row.projectId).sort();
    expect(active).toHaveLength(4);
    expect(remoteProjectIds.toSorted()).toEqual(active);
    expect(jobs.map(job => job.projectId).sort()).toEqual(active);
    expect(result.projects.filter(row => row.syncResult === "accepted").map(row => row.projectId).sort()).toEqual(active);
    for (const fixture of expected.filter(row => row.installation !== "active")) expect(result.projects.find(row => row.projectId === fixture.projectId)?.decision).toBe(fixture.installation === "revoked" ? "authorization_revoked" : "blocked");
    const repeat = await runner.execute({ scheduledAt });
    expect(jobs).toHaveLength(4);
    expect(repeat.projects.filter(row => row.syncResult === "duplicate").map(row => row.projectId).sort()).toEqual(active);
    const nullFixture = fixtures[0];
    const foreign = await store.request({ projectId: nullFixture.projectId, actorUserId: fixtures[1].identity.userId, triggerSource: "manual", requestIdentity: `t05-foreign-${randomUUID()}`, requestedAt: scheduledAt });
    expect(foreign.outcome).toBe("forbidden");
    fixtureEvent("t05_reconciliation_exact_set_pass", { expectedIds: expected.map(row => row.projectId).sort(), activeIds: active, jobs: jobs.map(job => ({ projectId: job.projectId, syncRunId: job.syncRunId })), repeatDispatches: 0, foreignRequest: foreign.outcome });
  }, 180_000);

  it("null 项目经原对账同步链写入六类快照并幂等重放", async () => {
    const fixture = fixtures[0];
    const job = jobs.find(row => row.projectId === fixture.projectId);
    expect(job).toBeDefined();
    const persistence = new SupabaseFirstSyncStore({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
    const readAt = new Date().toISOString();
    let remoteReads = 0;
    const empty = async () => { remoteReads += 1; return []; };
    fixtureEvent("t05_reconciliation_commit_registered", { userId: fixture.identity.userId, projectId: fixture.projectId, githubObjectId: "e".repeat(40), sourceVersion: "e".repeat(40), serverGeneratedIds: "parent_project_snapshot_upsert" });
    const executor = new ExecuteProjectSynchronization({
      runs: persistence, contexts: persistence, writer: persistence, clock: { now: () => new Date(readAt) },
      tokens: { issue: async () => ({ token: "synthetic-not-a-github-token", expiresAt: new Date(Date.parse(readAt) + 3_600_000).toISOString() }) },
      metadata: { read: async ({ context }) => { remoteReads += 1; const repository = context.repository; return { githubObjectId: repository.githubObjectId, repositoryFullName: repository.fullName, sourceUpdatedAt: readAt, sourceVersion: "c".repeat(64), defaultBranch: repository.defaultBranch, visibility: repository.visibility, isPrivate: repository.isPrivate, isFork: repository.isFork, isArchived: repository.isArchived, isDisabled: repository.isDisabled }; } },
      reader: {
        listCommits: async ({ repository }) => { remoteReads += 1; return [{ objectType: "commit", githubObjectId: "e".repeat(40), repositoryFullName: `${repository.owner}/${repository.name}`, sourceUpdatedAt: readAt, sourceVersion: "e".repeat(40), message: "Synthetic reconciliation change", authoredAt: readAt, committedAt: readAt, authorLogin: repository.owner }]; },
        listIssues: empty, listPullRequests: empty, listReleases: empty, listWorkflowRuns: empty, listChecks: empty,
      },
    });
    const result = await executor.execute({ job });
    expect(result).toMatchObject({ status: "completed", errorCode: null, replayed: false });
    expect(result.groups.map(row => row.groupName)).toEqual(["repository", "commit", "issue", "pull_request", "release", "workflow_run"]);
    expect(result.groups.every(row => row.rejected === 0)).toBe(true);
    const reads = remoteReads;
    expect(await executor.execute({ job })).toMatchObject({ status: "completed", replayed: true, groups: [] });
    expect(remoteReads).toBe(reads);
    expect(workspaceSql(`SELECT count(*) FROM public.github_commits WHERE project_id='${fixture.projectId}' AND github_object_id='${"e".repeat(40)}';`)).toBe("1");
    expect(workspaceSql(`SELECT (core_goal IS NULL AND current_stage_goal IS NULL AND status IS NULL)::text FROM public.projects WHERE id='${fixture.projectId}';`)).toBe("true");
    fixtureEvent("t05_reconciliation_pipeline_pass", { userId: fixture.identity.userId, projectId: fixture.projectId, syncRunId: job!.syncRunId, groupReceipts: result.groups, remoteSyntheticReads: reads, duplicateRemoteReads: 0, backgroundUnchanged: true });
  }, 180_000);
});
