import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";
import { contextFixture, type ContextFixture } from "./project-context-fixture";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseFirstSyncStore } from "@/infrastructure/synchronization/supabase-first-sync-store";
import { SupabaseReconciliationStore } from "@/infrastructure/synchronization/supabase-reconciliation-store";
import { ExecuteFirstRepositorySync, StartFirstRepositorySync } from "@/application/synchronization/first-sync-use-cases";
import type { BackgroundJob } from "@/domain/jobs/background-job";
import * as selectionRoute from "@/app/api/github/repository-selections/route";
import * as projectRoute from "@/app/api/projects/from-repository/route";
import * as startRoute from "@/app/api/projects/[projectId]/first-sync/route";
import * as statusRoute from "@/app/api/projects/[projectId]/sync-status/route";
import { GET as projectsGET } from "@/app/api/projects/route";

const synthetic = vi.hoisted(() => ({ jar: new Map<string, string>(), jobs: [] as unknown[], failDispatch: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [...synthetic.jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) synthetic.jar.set(name, value); else synthetic.jar.delete(name); } }) }));
// Only the external queue transport is replaced; all route composition, Auth,
// ownership, selection, creation, request coalescing and storage remain real.
vi.mock("inngest", () => ({ Inngest: class { async send(event: { data: unknown }) { if (synthetic.failDispatch) throw new Error("synthetic_queue_unavailable"); synthetic.jobs.push(event.data); return { ids: ["synthetic-local-provider"] }; } } }));

describe("T04 本地真实 Auth/RLS/HTTP/幂等接力", () => {
  const origin = "http://127.0.0.1:3000";
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let a: ContextFixture, b: ContextFixture, store: SupabaseFirstSyncStore;
  let projectId: string, historicalProjectId: string, selectedId: string;
  let repositoryId: number;
  let failure: "none" | "partial" | "failed" = "none";
  const cases = ["selection-create", "concurrent-unknown", "worker-partial-failed-completed", "historical-dispatch-recovery", "http-isolation", "authorization-archive"];
  let caseId = "setup";
  let actorUserId: string | null = null;
  const step = (name: string, values: Record<string, unknown>) => fixtureEvent("t04_step", { caseId, sourceCaseId: "t04-local-handoff-v1", lineage: a?.runId ?? null, actorUserId, step: name, ...values });
  const begin = (id: string) => { caseId = id; step("case_started", {}); };
  async function observed(stepName: string, response: Response, values: Record<string, unknown>) {
    const safeResponse: unknown = await response.clone().json().catch(() => null);
    step(stepName, { ...values, responseStatus: response.status, cacheControl: response.headers.get("cache-control"), safeResponse });
    return response;
  }
  const cookieStore = { getAll: () => [...synthetic.jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) synthetic.jar.set(name, value); else synthetic.jar.delete(name); } };
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore, responseHeaders: new Headers() });
  async function login(identity: ContextFixture) { synthetic.jar.clear(); const r = await server().auth.signInWithPassword({ email: identity.email, password: identity.password }); expect(r.error).toBeNull(); expect(r.data.user?.id).toBe(identity.userId); actorUserId = identity.userId; step("verified_login", { userId: identity.userId }); }
  const request = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => { step("http_request", { path, method, body: body ?? null, origin: headers.origin ?? origin, fetchSite: headers["sec-fetch-site"] ?? "same-origin" }); return new Request(`${origin}${path}`, { method, headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); };
  const context = (id: string) => ({ params: Promise.resolve({ projectId: id }) });
  const create = async (id: string) => observed("project_response", await projectRoute.POST(request("/api/projects/from-repository", "POST", { selectedRepositoryId: id })), { selectedRepositoryId: id });
  const start = async (id: string, requestId = "onboarding") => observed("start_response", await startRoute.POST(request(`/api/projects/${id}/first-sync`, "POST", { requestId }), context(id)), { projectId: id, requestId });
  const readResponse = async (id: string) => observed("status_response", await statusRoute.GET(request(`/api/projects/${id}/sync-status`), context(id)), { projectId: id });
  async function read(id: string) { const r = await readResponse(id); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toContain("no-store"); return (await r.json()).sync; }
  function counts(id: string) { return JSON.parse(workspaceSql(`SELECT json_build_object('projects',(SELECT count(*) FROM public.projects WHERE id='${id}'),'runs',(SELECT count(*) FROM public.sync_runs WHERE project_id='${id}'),'dispatches',(SELECT count(*) FROM public.project_sync_dispatches WHERE project_id='${id}'));`)); }
  async function work(job: BackgroundJob) {
    const worker = new ExecuteFirstRepositorySync({ runs: store, contexts: store, writer: store, clock: { now: () => new Date() },
      tokens: { issue: async () => { if (failure === "failed") throw new Error("github_activity_authorization_revoked"); return { token: "synthetic-offline-only", expiresAt: new Date(Date.now() + 600_000).toISOString() }; } },
      reader: { listCommits: async () => { expect((await read(job.projectId)).state).toBe("running"); if (failure === "partial") throw new Error("github_activity_timeout"); return []; }, listIssues: async () => [], listPullRequests: async () => [], listReleases: async () => [], listWorkflowRuns: async () => [], listChecks: async () => [] },
    });
    step("worker_started", { projectId: job.projectId, syncRunId: job.syncRunId, job, syntheticFailure: failure });
    const result = await worker.execute({ job });
    step("worker_result", { projectId: job.projectId, syncRunId: job.syncRunId, result });
    return result;
  }
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === configuration.apiUrl) { verifyIsolatedDatabase(); return realFetch(input, init); }
      if (url.origin === "https://api.github.com") {
        if (/\/app\/installations\/\d+\/access_tokens$/.test(url.pathname)) return Response.json({ token: "synthetic-offline-token", expires_at: new Date(Date.now() + 600_000).toISOString(), permissions: { contents: "read", metadata: "read", issues: "read", pull_requests: "read", actions: "read" }, repository_selection: "selected" }, { status: 201 });
        if (url.pathname === "/installation/repositories") return Response.json({ total_count: 1, repository_selection: "selected", repositories: [{ id: repositoryId, name: "new-repository", full_name: "synthetic-t04/new-repository", owner: { login: "synthetic-t04" }, private: true, fork: false, archived: false, disabled: false, visibility: "private", default_branch: "main" }] });
        if (url.pathname === "/installation/token" && init?.method === "DELETE") return new Response(null, { status: 204 });
      }
      throw new Error("t04_external_network_forbidden");
    });
    for (const [key, value] of Object.entries({ APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey, SUPABASE_SERVICE_ROLE_KEY: configuration.serviceRoleKey, INNGEST_EVENT_KEY: "synthetic-local-only", GITHUB_APP_ID: "917004", GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey, GITHUB_REST_API_VERSION: "2026-03-10" })) vi.stubEnv(key, value);
    vi.stubEnv("GITHUB_APP_SLUG", "synthetic-local-t04");
    vi.stubEnv("INNGEST_SIGNING_KEY", "synthetic-local-signing-only");
    a = contextFixture(configuration, "t04-handoff-A"); b = contextFixture(configuration, "t04-handoff-B");
    repositoryId = Number.parseInt(a.userId.replaceAll("-", "").slice(0, 12), 16);
    fixtureEvent("t04_cases_registered_before_creation", { cases, sourceCaseId: "t04-local-handoff-v1", lineage: a.runId, userId: a.userId, repositoryId, generatedSelection: { owner: a.userId, repositoryId }, generatedRuns: { parentUserId: a.userId, mechanism: "actual_request_project_sync_record_on_receipt" }, exposure: "development-fixture", externalProviders: "offline" });
    await a.seed(); await b.seed();
    const owner = `t04-${a.userId.replaceAll("-", "")}`;
    workspaceSql(`UPDATE public.selected_repositories SET owner_login='${owner}',full_name='${owner}/repository' WHERE id='${a.selectedRepositoryId}' AND user_id='${a.userId}';`);
    store = new SupabaseFirstSyncStore({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
    await login(a);
  }, 180_000);
  afterAll(async () => {
    const failures: unknown[] = [];
    if (selectedId) { try { workspaceSql(`DELETE FROM public.selected_repositories WHERE id='${selectedId}' AND user_id='${a.userId}' AND github_repository_id=${repositoryId};`); } catch (e) { failures.push(e); } }
    for (const f of [a, b]) if (f) { try { await f.cleanup(); } catch (e) { failures.push(e); } }
    fixtureEvent("t04_network_and_cleanup", { cases, queueCalls: synthetic.jobs.length, externalNetworkRequests: 0, cleanupFailures: failures.length });
    synthetic.jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    if (failures.length) throw new AggregateError(failures);
  }, 180_000);

  it("真实选库写入→默认关闭→本地开启→null 建项，不输入背景", async () => {
    begin("selection-create");
    const selected = await selectionRoute.POST(request("/api/github/repository-selections", "POST", { repositoryId })); expect(selected.status).toBe(200);
    expect((await selected.json()).selectedRepository.repositoryId).toBe(repositoryId);
    const mapping = (await (await projectsGET()).json()).projects.find((p: { repository: { repositoryId: number } }) => p.repository.repositoryId === repositoryId);
    selectedId = mapping.repository.id; fixtureEvent("t04_selection_observed", { userId: a.userId, repositoryId, selectedRepositoryId: selectedId });
    fixtureEvent("t04_generated_project_registered", { userId: a.userId, selectedRepositoryId: selectedId, repositoryId, mechanism: "server_random_uuid_recorded_on_response" });
    vi.stubEnv("PROJECT_CONTEXT_WRITES_ENABLED", ""); expect((await create(selectedId)).status).toBe(404);
    vi.stubEnv("PROJECT_CONTEXT_WRITES_ENABLED", "1");
    const response = await create(selectedId); expect(response.status).toBe(200);
    const payload = await response.json(); projectId = payload.project.id;
    fixtureEvent("t04_project_observed", { userId: a.userId, selectedRepositoryId: selectedId, repositoryId, projectId });
    expect(payload.project.context).toEqual({ coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null }); expect((await read(projectId)).state).toBe("not_started");
  }, 180_000);
  it("并发、不同请求键及响应丢失重读只产生一项目、一run、一派发", async () => {
    begin("concurrent-unknown");
    const creations = await Promise.all([create(selectedId), create(selectedId)]);
    for (const r of creations) expect((await r.json()).project.id).toBe(projectId);
    const receipts = await Promise.all([start(projectId), start(projectId, "double-click"), start(projectId, "refresh")]);
    const runIds: string[] = [];
    for (const response of receipts) { expect([200, 202]).toContain(response.status); runIds.push((await response.json()).syncRunId); }
    expect(new Set(runIds).size).toBe(1); expect(synthetic.jobs).toHaveLength(1);
    fixtureEvent("t04_run_observed", { caseId: "concurrent-unknown", projectId, runIds, counts: counts(projectId) });
    expect(counts(projectId)).toEqual({ projects: 1, runs: 1, dispatches: 1 });
    // Treat the preceding response as lost: read actual storage, then safely replay.
    expect((await read(projectId)).state).toBe("queued");
    expect((await (await start(projectId)).json()).syncRunId).toBe(runIds[0]); expect(synthetic.jobs).toHaveLength(1);
  }, 180_000);
  it("真实 worker 部分→失败→合法新尝试完成，状态读和存储一致", async () => {
    begin("worker-partial-failed-completed");
    failure = "partial"; expect((await work(synthetic.jobs[0] as BackgroundJob)).status).toBe("partial");
    let view = await read(projectId); expect(view.state).toBe("partial");
    expect((await start(projectId, view.retryRequestId)).status).toBe(202);
    failure = "failed"; expect((await work(synthetic.jobs.at(-1) as BackgroundJob)).status).toBe("failed");
    view = await read(projectId); expect(view.state).toBe("failed"); expect(view.retryRequestId).toBe(`retry-${view.syncRunId}`);
    expect((await start(projectId, view.retryRequestId)).status).toBe(202);
    failure = "none"; const result = await work(synthetic.jobs.at(-1) as BackgroundJob); expect(result.status).toBe("completed");
    view = await read(projectId); expect(view.state).toBe("completed"); expect(view.finishedAt).not.toBeNull(); expect(view.retryRequestId).toBeNull();
    expect(counts(projectId)).toEqual({ projects: 1, runs: 3, dispatches: 3 });
    fixtureEvent("t04_worker_outcomes", { caseId: "worker-partial-failed-completed", projectId, statuses: ["running", "partial", "failed", "completed"], result, view, counts: counts(projectId) });
  }, 180_000);
  it("历史已选仓库独立建项；派发失败保存项目，租约后恢复同run不污染另一仓库", async () => {
    begin("historical-dispatch-recovery");
    historicalProjectId = (await (await create(a.selectedRepositoryId)).json()).project.id; a.observe(historicalProjectId);
    workspaceSql(`UPDATE public.projects SET core_goal='合成既有目标',current_blocker='合成个人记录' WHERE id='${historicalProjectId}' AND user_id='${a.userId}';`);
    synthetic.failDispatch = true; expect((await start(historicalProjectId)).status).toBe(503);
    let view = await read(historicalProjectId); expect(view.state).toBe("dispatch_pending"); const originalRun = view.syncRunId;
    expect((await start(historicalProjectId)).status).toBe(200); expect((await read(projectId)).state).toBe("completed");
    synthetic.failDispatch = false;
    const recover = new StartFirstRepositorySync({ contexts: store, runs: store, requests: new SupabaseReconciliationStore({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey }), clock: { now: () => new Date(Date.now() + 61_000) }, dispatcher: { dispatch: async job => { synthetic.jobs.push(job); return { providerJobId: "synthetic-recovered" }; } } });
    const recovered = await recover.execute({ projectId: historicalProjectId, requestId: view.retryRequestId });
    step("lease_recovery_response", { projectId: historicalProjectId, requestId: view.retryRequestId, receipt: recovered, clock: "local-injected-plus-61s" });
    expect(recovered.syncRunId).toBe(originalRun);
    expect((await work(synthetic.jobs.at(-1) as BackgroundJob)).status).toBe("completed");
    view = await read(historicalProjectId); expect(view.state).toBe("completed"); expect(counts(historicalProjectId)).toEqual({ projects: 1, runs: 1, dispatches: 1 });
    expect((await (await create(a.selectedRepositoryId)).json()).project.context).toMatchObject({ coreGoal: "合成既有目标", currentBlocker: "合成个人记录", status: null });
    fixtureEvent("t04_dispatch_recovery", { caseId: "historical-dispatch-recovery", projectId: historicalProjectId, originalRun, view, counts: counts(historicalProjectId), clock: "local-injected-plus-61s" });
  }, 180_000);
  it("真实路由的方法、strict body、跨站、A/B、失效会话与私有缓存边界", async () => {
    begin("http-isolation");
    for (const [method, expected] of [["GET", 405], ["PUT", 405], ["DELETE", 405]] as const) {
      const response = await startRoute[method](request(`/api/projects/${projectId}/first-sync`, method), context(projectId)); expect(response.status).toBe(expected); expect(response.headers.get("cache-control")).toContain("private");
    }
    expect((await startRoute.POST(request(`/api/projects/${projectId}/first-sync`, "POST", { requestId: "forged", userId: b.userId }), context(projectId))).status).toBe(400);
    expect((await startRoute.POST(request(`/api/projects/${projectId}/first-sync`, "POST", { requestId: "forged" }, { "sec-fetch-site": "cross-site" }), context(projectId))).status).toBe(403);
    expect((await statusRoute.GET(request(`/api/projects/${projectId}/sync-status`, "GET", undefined, { origin: "https://foreign.invalid" }), context(projectId))).status).toBe(403);
    expect((await statusRoute.POST(request(`/api/projects/${projectId}/sync-status`, "POST"), context(projectId))).status).toBe(405);
    await login(b);
    for (const r of [await create(selectedId), await start(projectId), await readResponse(projectId)]) { expect(r.status).toBe(404); expect(r.headers.get("cache-control")).toContain("no-store"); expect(await r.text()).not.toContain(a.userId); }
    synthetic.jar.clear(); actorUserId = null; expect((await start(projectId)).status).toBe(401); expect((await readResponse(projectId)).status).toBe(401); await login(a);
  }, 180_000);
  it("暂停／撤权清空运行信息并拒绝写，归档不能复活", async () => {
    begin("authorization-archive");
    for (const state of ["suspended", "revoked"]) {
      workspaceSql(`UPDATE public.github_installations SET status='${state}',suspended_at=${state === "suspended" ? "now()" : "null"},revoked_at=${state === "revoked" ? "now()" : "null"} WHERE id='${a.installationId}' AND user_id='${a.userId}';`);
      expect(await read(projectId)).toMatchObject({ state, syncRunId: null, retryRequestId: null, finishedAt: null }); expect((await start(projectId)).status).toBe(409);
    }
    workspaceSql(`UPDATE public.github_installations SET status='active',suspended_at=null,revoked_at=null WHERE id='${a.installationId}' AND user_id='${a.userId}'; UPDATE public.projects SET status='archived' WHERE id='${historicalProjectId}' AND user_id='${a.userId}';`);
    expect((await readResponse(historicalProjectId)).status).toBe(404); expect((await start(historicalProjectId)).status).toBe(404);
    expect(counts(historicalProjectId)).toEqual({ projects: 1, runs: 1, dispatches: 1 });
  }, 180_000);
});
