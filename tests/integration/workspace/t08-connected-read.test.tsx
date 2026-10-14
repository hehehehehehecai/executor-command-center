import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseConnectedPanelReader } from "@/infrastructure/connected-panels/supabase-connected-panel-reader";
import { createCommandDeckProductionConnectedPort } from "@/app/connected-panel-dependencies";
import { SupabaseDecisionRecordStore } from "@/infrastructure/decision-records/supabase-decision-record-store";
import { mapMissionControlConnectedSource, mapDecisionArchiveConnectedSource } from "@/app/connected-panel-source-mappers";
import Home from "@/app/page";
import { fixtureEvent, registeredWorkspaceFixture, workspaceConfiguration, workspaceSql, type WorkspaceFixture } from "./workspace-fixture";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";

const cookies = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return { jar, get: (name: string) => jar.has(name) ? { value: jar.get(name)! } : undefined,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); } };
});
vi.mock("next/headers", () => ({ cookies: async () => cookies }));

describe("T08 fixed native owner/project read and home composition", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let a: WorkspaceFixture, b: WorkspaceFixture;
  const realFetch = globalThis.fetch;
  const paths: string[] = [];
  const at = "2026-10-09T08:00:00.000Z";
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: "http://127.0.0.1:3000", NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: cookies, responseHeaders: new Headers() });
  const reader = () => new SupabaseConnectedPanelReader(server() as never);
  async function login(identity: WorkspaceFixture) {
    cookies.jar.clear();
    const result = await server().auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (result.error || result.data.user?.id !== identity.userId) throw new Error("t08_native_login_failed");
  }
  function businessSnapshot() {
    return workspaceSql(`BEGIN READ ONLY; SELECT json_build_object('projects',(SELECT count(*) FROM public.projects),'issues',(SELECT count(*) FROM public.github_issues),'prs',(SELECT count(*) FROM public.github_pull_requests),'workflows',(SELECT count(*) FROM public.github_workflow_runs),'syncs',(SELECT count(*) FROM public.sync_runs),'briefs',(SELECT count(*) FROM public.project_briefs),'invocations',(SELECT count(*) FROM public.ai_invocations),'reservations',(SELECT count(*) FROM public.energy_reservations),'ledger',(SELECT count(*) FROM public.energy_ledger_entries)); COMMIT;`);
  }
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configuration.apiUrl); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configuration.anonKey);
    vi.stubEnv("CONNECTED_PANEL_E2E", undefined); vi.stubEnv("WORKSPACE_PREVIEW_E2E", undefined);
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(configuration.apiUrl).origin) throw new Error("t08_external_network_forbidden");
      if (url.pathname.startsWith("/rest/")) paths.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
      return realFetch(input, init);
    });
    a = registeredWorkspaceFixture(configuration, "t08-native-A"); b = registeredWorkspaceFixture(configuration, "t08-native-B");
    await a.seed(); await b.seed();
    for (const identity of [a, b]) {
      const owner = `t08-${identity.userId.replaceAll("-", "")}`;
      fixtureEvent("t08_repository_profile_registered", { userId: identity.userId, projectId: identity.projectId, selectedRepositoryId: identity.selectedRepositoryId, owner });
      workspaceSql(`UPDATE public.selected_repositories SET owner_login='${owner}',full_name='${owner}/repository' WHERE id='${identity.selectedRepositoryId}' AND user_id='${identity.userId}'; UPDATE public.projects SET core_goal=null,current_stage_goal=null,status=null WHERE id='${identity.projectId}' AND user_id='${identity.userId}';`);
    }
    const ids = { issueId: randomUUID(), prId: randomUUID(), workflowId: randomUUID(), syncA: randomUUID(), syncB: randomUUID() };
    fixtureEvent("t08_facts_registered_before_creation", { ...ids, userId: a.userId, projectId: a.projectId, otherProjectId: b.projectId });
    workspaceSql(`BEGIN;
      INSERT INTO public.github_issues(id,project_id,github_object_id,source_updated_at,source_version,issue_number,title,state) VALUES ('${ids.issueId}','${a.projectId}','501','${at}','t08-issue-v1',7,'T08 native owned Issue','open');
      INSERT INTO public.github_pull_requests(id,project_id,github_object_id,source_updated_at,source_version,pull_request_number,title,state,is_draft,head_sha,base_ref) VALUES ('${ids.prId}','${a.projectId}','502','${at}','t08-pr-v1',8,'T08 native owned PR','open',false,'${"a".repeat(40)}','main');
      INSERT INTO public.github_workflow_runs(id,project_id,github_object_id,source_updated_at,source_version,workflow_id,run_number,status,conclusion,event_name,head_sha) VALUES ('${ids.workflowId}','${a.projectId}','503','${at}','t08-workflow-v1','123',9,'completed','failure','push','${"a".repeat(40)}');
      INSERT INTO public.sync_runs(id,project_id,idempotency_key,trigger_source,status,queued_at,started_at,finished_at) VALUES ('${ids.syncA}','${a.projectId}','t08-${ids.syncA}','manual','completed','${at}','${at}','${at}'),('${ids.syncB}','${b.projectId}','t08-${ids.syncB}','manual','completed','${at}','${at}','${at}'); COMMIT;`);
    await login(a);
  }, 120_000);
  beforeEach(() => { verifyIsolatedDatabase(); });
  afterAll(async () => {
    try { await a?.cleanup(); } finally { try { await b?.cleanup(); } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); } }
  }, 120_000);
  it("reads real persisted Issue/PR/failure facts with source IDs, state and version", async () => {
    const data = await reader().read({ userId: a.userId, projectId: a.projectId });
    expect(data?.readContext).toMatchObject({ userId: a.userId, projectId: a.projectId, maximumRowsPerSource: 100 });
    expect(data?.project.status).toBeNull();
    const tasks = mapMissionControlConnectedSource(data!);
    expect(tasks.recordedTasks.map(task => task.taskType).sort()).toEqual(["issue", "pull_request", "workflow_failure"]);
    expect(tasks.recordedTasks.find(task => task.taskType === "issue")).toMatchObject({ id: "github_issue:501", sourceVersion: "t08-issue-v1", sourceState: "open" });
    expect(tasks.readState?.kind).toBe("ready");
  });
  it("loads the project snapshot and decision storage for all five home cards without automatic business writes", async () => {
    const before = businessSnapshot(); paths.length = 0;
    const port = await createCommandDeckProductionConnectedPort(a.projectId, a.userId);
    const overview = await port.load();
    expect(overview.cards["mission-control"]).toContain("开放 Issue 1 · PR 1 · 失败工作流 1");
    expect(overview.cards["decision-archive"]).toBe("只读存储返回 · 正式决策 0");
    expect(paths).toHaveLength(9);
    expect(paths.every(path => path.startsWith("GET "))).toBe(true);
    expect(businessSnapshot()).toBe(before);
    fixtureEvent("t08_home_native_read_annotation", { userId: a.userId, projectId: a.projectId, queryCount: paths.length, paths: [...paths], businessWrites: 0, cards: overview.cards, sourceState: overview.readState });
  });
  it("composes the actual formal Home page from native persisted data and nullable background", async () => {
    const before = businessSnapshot();
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ project: a.projectId }) }));
    expect(html).toContain("开放 Issue 1"); expect(html).toContain("非全量统计");
    expect(html).toContain("项目背景可稍后填写"); expect(html).toContain("只读存储返回 · 正式决策 0");
    expect(html).not.toContain(b.projectId); expect(html).not.toContain("完全虚构");
    expect(businessSnapshot()).toBe(before);
  });
  it("rejects both a foreign project and forged owner through real RLS", async () => {
    expect(await reader().read({ userId: a.userId, projectId: b.projectId })).toBeNull();
    expect(await reader().read({ userId: b.userId, projectId: b.projectId })).toBeNull();
  });
  it("switches to account B and distinguishes a real successful empty project", async () => {
    await login(b);
    try {
      const data = await reader().read({ userId: b.userId, projectId: b.projectId });
      expect(mapMissionControlConnectedSource(data!)).toMatchObject({ readState: { kind: "empty" }, recordedTasks: [] });
      expect(await reader().read({ userId: b.userId, projectId: a.projectId })).toBeNull();
      expect(JSON.stringify(data)).not.toContain("T08 native owned Issue");
    } finally { await login(a); }
  });
  it("distinguishes native empty decision storage from the compatible not-enabled mapper", async () => {
    const data = await reader().read({ userId: a.userId, projectId: a.projectId });
    expect(mapDecisionArchiveConnectedSource(data!)).toMatchObject({ readState: { kind: "not_enabled" }, records: [] });
    const persisted = await new SupabaseDecisionRecordStore(server() as never).read({ userId: a.userId, projectId: a.projectId });
    expect(mapDecisionArchiveConnectedSource(data!, persisted)).toMatchObject({ readState: { kind: "empty" }, candidates: [], records: [] });
    expect(workspaceSql("BEGIN READ ONLY; SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='decision_records'; COMMIT;")).toContain("1");
  });
});
