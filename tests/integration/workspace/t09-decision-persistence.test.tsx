import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseDecisionRecordStore } from "@/infrastructure/decision-records/supabase-decision-record-store";
import { POST, GET } from "@/app/api/projects/[projectId]/decisions/route";
import DecisionArchivePage from "@/app/decision-archive/page";
import { fixtureEvent, registeredWorkspaceFixture, workspaceConfiguration, workspaceSql, type WorkspaceFixture } from "./workspace-fixture";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";

const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [...jar.values].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) jar.values.set(name, value); else jar.values.delete(name); }, get: (name: string) => jar.values.has(name) ? { value: jar.values.get(name)! } : undefined }) }));
const origin = "http://127.0.0.1:3000";

describe("T09 fixed native manual decision persistence", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let a: WorkspaceFixture, b: WorkspaceFixture;
  let legacyProjects: string;
  const realFetch = globalThis.fetch;
  const idempotencyKey = randomUUID();
  let recordId: string;
  const command = { idempotencyKey, decision: "保留 T09 本人项目手动记录", confirmationReason: "本人明确选择并说明原因", alternatives: ["替代方案一", "替代方案二"], references: (["commit", "pull_request", "issue", "document"] as const).map(kind => ({ id: `t09-${kind}`, kind, label: `T09 ${kind} 依据`, originalUrl: `https://example.invalid/t09/${kind}` })), revisitCondition: "项目条件改变时重新审视" };
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: { getAll: () => [...jar.values].map(([name, value]) => ({ name, value })), set: (name, value) => { if (value) jar.values.set(name, value); else jar.values.delete(name); } }, responseHeaders: new Headers() });
  const store = () => new SupabaseDecisionRecordStore(server() as never);
  async function login(identity: WorkspaceFixture) {
    jar.values.clear();
    const result = await server().auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (result.error || result.data.user?.id !== identity.userId) throw new Error("t09_native_login_failed");
  }
  function request(project: string, body: unknown = command, headers: Record<string, string> = {}) {
    return new Request(`${origin}/api/projects/${project}/decisions`, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  }
  const post = (project: string, body: unknown = command, headers: Record<string, string> = {}) => POST(request(project, body, headers), { params: Promise.resolve({ projectId: project }) });
  const readOnlySql = (statement: string) => workspaceSql(statement).split(/\r?\n/).filter(line => line !== "BEGIN" && line !== "COMMIT").join("\n");
  const count = () => Number(readOnlySql(`BEGIN READ ONLY; SELECT count(*) FROM public.decision_records WHERE user_id='${a.userId}' AND project_id='${a.projectId}'; COMMIT;`));
  const oldProjects = () => workspaceSql(`BEGIN READ ONLY; SELECT coalesce(json_agg(to_jsonb(project) ORDER BY project.id),'[]'::json) FROM public.projects project WHERE id NOT IN ('${a.projectId}','${b.projectId}'); COMMIT;`);
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubEnv("APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configuration.apiUrl); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configuration.anonKey);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", configuration.serviceRoleKey);
    vi.stubEnv("DECISION_RECORD_WRITES_ENABLED", "1"); vi.stubEnv("CONNECTED_PANEL_E2E", undefined); vi.stubEnv("WORKSPACE_PREVIEW_E2E", undefined);
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(configuration.apiUrl).origin) throw new Error("t09_external_network_forbidden");
      return realFetch(input, init);
    });
    a = registeredWorkspaceFixture(configuration, "t09-decision-native-A"); b = registeredWorkspaceFixture(configuration, "t09-decision-native-B");
    legacyProjects = oldProjects(); await a.seed(); await b.seed();
    for (const identity of [a, b]) {
      const owner = `t09-${identity.userId.replaceAll("-", "")}`;
      fixtureEvent("t09_native_profile_registered", { userId: identity.userId, projectId: identity.projectId, owner });
      workspaceSql(`UPDATE public.selected_repositories SET owner_login='${owner}',full_name='${owner}/repository' WHERE id='${identity.selectedRepositoryId}' AND user_id='${identity.userId}'; UPDATE public.projects SET core_goal=null,current_stage_goal=null,status=null WHERE id='${identity.projectId}' AND user_id='${identity.userId}';`);
    }
    await login(a);
  }, 120_000);
  beforeEach(() => verifyIsolatedDatabase());
  afterAll(async () => {
    try { if (a && b && legacyProjects !== undefined) expect(oldProjects()).toBe(legacyProjects); }
    finally { try { await a?.cleanup(); } finally { try { await b?.cleanup(); } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); } } }
  }, 120_000);

  it("stores the complete authored record with server-owned identity/time and nullable old project context", async () => {
    const [response, concurrent] = await Promise.all([post(a.projectId), post(a.projectId)]);
    expect(response.status).toBe(200); expect(concurrent.status).toBe(200);
    const { record } = await response.json(); recordId = record.id;
    expect((await concurrent.json()).record.id).toBe(recordId);
    expect(record).toMatchObject({ ...command, userId: a.userId, projectId: a.projectId, confirmedBy: a.userId, version: 1, createdVia: "manual", sourceCandidateId: null });
    expect(Number.isFinite(Date.parse(record.confirmedAt))).toBe(true); expect(count()).toBe(1);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    fixtureEvent("t09_native_saved", { userId: a.userId, projectId: a.projectId, recordId, idempotencyKey, version: record.version, confirmedAt: record.confirmedAt, createdVia: record.createdVia });
  });
  it("returns the same record for a duplicate key and rejects different content without an extra row", async () => {
    const repeated = await post(a.projectId); expect(repeated.status).toBe(200); expect((await repeated.json()).record.id).toBe(recordId);
    const conflict = await post(a.projectId, { ...command, decision: "不同内容" }); expect(conflict.status).toBe(409); expect(count()).toBe(1);
  });
  it("reads the same real record after fresh queries, sign-out and password re-login", async () => {
    const first = await store().read({ userId: a.userId, projectId: a.projectId });
    const second = await store().read({ userId: a.userId, projectId: a.projectId });
    expect(first).toMatchObject({ kind: "ready", records: [{ record: { id: recordId, references: command.references } }] }); expect(second).toEqual(first);
    await server().auth.signOut(); jar.values.clear(); await login(a);
    expect(await store().read({ userId: a.userId, projectId: a.projectId })).toEqual(first);
    fixtureEvent("t09_native_query_relogin_read", { recordId, userId: a.userId, projectId: a.projectId, sameRecord: true, actualBrowserJourney: false });
  });
  it("rejects anonymous and foreign-account access through real Auth and RLS", async () => {
    jar.values.clear(); expect((await post(a.projectId)).status).toBe(401);
    await login(b);
    try { expect((await post(a.projectId)).status).toBe(403); expect(await store().read({ userId: b.userId, projectId: a.projectId })).toMatchObject({ kind: "ready", records: [] }); }
    finally { await login(a); }
    expect(count()).toBe(1);
  });
  it("rejects cross-project writes from the owner of another project", async () => {
    expect((await post(b.projectId)).status).toBe(403); expect(count()).toBe(1);
    expect(await store().read({ userId: a.userId, projectId: b.projectId })).toMatchObject({ kind: "ready", records: [] });
  });
  it("keeps GET, cross-site requests and forged server metadata from writing", async () => {
    const get = await GET(new Request(`${origin}/api/projects/${a.projectId}/decisions`), { params: Promise.resolve({ projectId: a.projectId }) });
    expect(get.status).toBe(405);
    expect((await post(a.projectId, command, { origin: "https://foreign.invalid" })).status).toBe(403);
    expect((await post(a.projectId, { ...command, confirmedBy: b.userId, confirmedAt: "2000-01-01T00:00:00Z" })).status).toBe(400);
    expect(count()).toBe(1);
  });
  it("denies both reads and writes after installation revocation without exposing stored content", async () => {
    workspaceSql(`UPDATE public.github_installations SET status='revoked',revoked_at=now() WHERE id='${a.installationId}' AND user_id='${a.userId}';`);
    try {
      expect((await post(a.projectId)).status).toBe(403);
      expect(await store().read({ userId: a.userId, projectId: a.projectId })).toMatchObject({ kind: "ready", records: [] });
      vi.stubEnv("DECISION_RECORD_WRITES_ENABLED", "0");
      const html = renderToStaticMarkup(await DecisionArchivePage({ searchParams: Promise.resolve({ project: a.projectId }) }));
      expect(html).not.toContain(command.decision); expect(html).not.toContain("保存决策记录");
    } finally { workspaceSql(`UPDATE public.github_installations SET status='active',revoked_at=null WHERE id='${a.installationId}' AND user_id='${a.userId}';`); vi.stubEnv("DECISION_RECORD_WRITES_ENABLED", "1"); }
  });
  it("keeps historical records readable with saving disabled and ignores Connected GET preview inputs", async () => {
    vi.stubEnv("DECISION_RECORD_WRITES_ENABLED", "0");
    try {
      expect((await post(a.projectId)).status).toBe(404);
      const direct = await server().rpc("create_manual_decision_record", { p_actor_user_id: a.userId, p_project_id: a.projectId, p_idempotency_key: randomUUID(), p_decision: "不能绕过关闭开关", p_confirmation_reason: "直连不应写入", p_alternatives: [], p_references: [], p_revisit_condition: null });
      expect(direct.error?.code).toBe("42501");
      const html = renderToStaticMarkup(await DecisionArchivePage({ searchParams: Promise.resolve({ project: a.projectId, action: "manual", decision: "GET 不应创建记录", reason: "不写入" }) }));
      expect(html).toContain(command.decision); expect(html).not.toContain("GET 不应创建记录"); expect(html).not.toContain("保存决策记录");
      expect(count()).toBe(1);
    } finally { vi.stubEnv("DECISION_RECORD_WRITES_ENABLED", "1"); }
  });
  it("grants authenticated reads only and keeps insertion, confirmation metadata, update and delete private", () => {
    const privileges = JSON.parse(readOnlySql("BEGIN READ ONLY; SELECT json_build_object('authRead',has_table_privilege('authenticated','public.decision_records','SELECT'),'anonRead',has_table_privilege('anon','public.decision_records','SELECT'),'actorInsert',has_column_privilege('authenticated','public.decision_records','confirmed_by','INSERT'),'timeInsert',has_column_privilege('authenticated','public.decision_records','confirmed_at','INSERT'),'userInsert',has_column_privilege('authenticated','public.decision_records','user_id','INSERT'),'contentInsert',has_column_privilege('authenticated','public.decision_records','decision','INSERT'),'update',has_table_privilege('authenticated','public.decision_records','UPDATE'),'delete',has_table_privilege('authenticated','public.decision_records','DELETE'),'invoker',(SELECT NOT prosecdef FROM pg_proc WHERE oid='public.create_manual_decision_record(uuid,uuid,uuid,text,text,text[],jsonb,text)'::regprocedure)); COMMIT;"));
    expect(privileges).toEqual({ authRead: true, anonRead: false, actorInsert: false, timeInsert: false, userInsert: false, contentInsert: false, update: false, delete: false, invoker: true });
  });
});
