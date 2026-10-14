import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readIsolatedStatus } from "../../../scripts/isolated-test-target.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "../../../src/infrastructure/auth/supabase-server-client";
import * as creationRoute from "../../../src/app/api/projects/from-repository/route";
import * as contextRoute from "../../../src/app/api/projects/[projectId]/context/route";
import { SupabaseProjectContextWriter } from "../../../src/infrastructure/project-calibration/supabase-project-context-writer";
import { SupabaseProjectCalibrationWriter } from "../../../src/infrastructure/project-calibration/supabase-project-calibration-storage";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { contextFixture, holdSqlLock, type ContextFixture } from "./project-context-fixture";

const cookies = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return { jar, getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); } };
});
vi.mock("next/headers", () => ({ cookies: async () => cookies }));

describe("T03 真实 SDK、路由与数据库并发", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  const fixtures: ContextFixture[] = [];
  let a: ContextFixture, b: ContextFixture;
  let projectId: string;
  let writer: SupabaseProjectContextWriter;
  const origin = "http://127.0.0.1:3000";
  const destinations = new Set<string>();
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: cookies, responseHeaders: new Headers() });
  async function login(identity: ContextFixture) {
    cookies.jar.clear();
    const result = await server().auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (result.error || !result.data.session) throw new Error("context_fixture_login_failed");
    return result.data.session;
  }
  async function seed(label: string) { const fixture = contextFixture(configuration, label); fixtures.push(fixture); await fixture.seed(); return fixture; }
  function request(path: string, method: string, body?: unknown) { return new Request(`${origin}${path}`, { method, headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  const create = (selectedRepositoryId: string = a.selectedRepositoryId) => creationRoute.POST(request("/api/projects/from-repository", "POST", { selectedRepositoryId }));
  const patch = (changes: unknown, id = projectId) => contextRoute.PATCH(request(`/api/projects/${id}/context`, "PATCH", changes), { params: Promise.resolve({ projectId: id }) });
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubEnv("APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configuration.apiUrl); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configuration.anonKey); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", configuration.serviceRoleKey);
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== configuration.apiUrl) throw new Error("context_external_network_forbidden");
      destinations.add(url.origin + url.pathname);
      return realFetch(input, init);
    });
    a = await seed("route-A"); b = await seed("route-B");
    writer = new SupabaseProjectContextWriter({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
  }, 120_000);
  afterAll(async () => {
    const failures: unknown[] = [];
    for (const fixture of fixtures) { try { await fixture.cleanup(); } catch (error) { failures.push(error); } }
    fixtureEvent("t03_network_summary", { destinations: [...destinations], externalCalls: 0, synchronizationOrModelCalls: [...destinations].filter(value => /synchron|inngest|deepseek|openai/.test(value)).length });
    cookies.jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    if (failures.length) throw new AggregateError(failures, "context_fixture_cleanup_failed");
  }, 120_000);

  it("默认关闭，外部参数无法打开；正确方法与缓存头完整", async () => {
    vi.stubEnv("PROJECT_CONTEXT_WRITES_ENABLED", "");
    expect((await create()).status).toBe(404);
    const bypass = await creationRoute.POST(request("/api/projects/from-repository?PROJECT_CONTEXT_WRITES_ENABLED=1", "POST", { selectedRepositoryId: a.selectedRepositoryId, PROJECT_CONTEXT_WRITES_ENABLED: "1" }));
    expect(bypass.status).toBe(404);
    const response = await creationRoute.GET(request("/api/projects/from-repository", "GET"));
    expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toMatch(/Cookie/i); expect(response.headers.get("vary")).toMatch(/Origin/i);
    vi.stubEnv("PROJECT_CONTEXT_WRITES_ENABLED", "1");
    expect((await create()).status).toBe(401);
  });
  it("创建空背景、重复创建与逐项 PATCH 保持真实 null 和缺失语义", async () => {
    await login(a);
    const response = await create(); expect(response.status).toBe(200);
    const body = await response.json(); projectId = body.project.id; a.observe(projectId);
    expect(body.project).toMatchObject({ contractVersion: "project-context.v1", context: { coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null }, completeness: { complete: false }, syncPreparation: { state: "ready", requested: false } });
    expect(await (await create()).json()).toEqual(body);
    expect(await (await create(a.selectedRepositoryId.toUpperCase())).json()).toEqual(body);
    expect((await patch({ currentBlocker: null }, projectId.toUpperCase())).status).toBe(200);
    expect((await (await patch({ coreGoal: "明确的目标", currentStageGoal: "当前阶段", status: "in_development" })).json()).project.completeness.complete).toBe(true);
    const cleared = await (await patch({ coreGoal: null })).json();
    expect(cleared.project.context).toEqual({ coreGoal: null, currentStageGoal: "当前阶段", status: "in_development", currentBlocker: null });
    expect((await patch({ userId: b.userId })).status).toBe(400);
  }, 120_000);
  it("A/B 真实会话隔离，匿名不可直接执行受限 RPC", async () => {
    await login(b);
    for (const response of [await create(a.selectedRepositoryId), await patch({ coreGoal: "forbidden" }, projectId)]) {
      expect(response.status).toBe(404); const text = await response.text(); expect(text).not.toContain(a.userId); expect(text).not.toContain(projectId);
    }
    const anon = createClient(configuration.apiUrl, configuration.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await anon.rpc("create_project_from_repository", { p_actor_user_id: a.userId, p_selected_repository_id: a.selectedRepositoryId });
    expect(result.error).not.toBeNull();
  }, 120_000);
  it("真实 Auth 拒绝被篡改的 JWT，不到达写入 RPC", async () => {
    const session = await login(a);
    const cookie = cookies.getAll().find(value => /-auth-token(?:\.\d+)?$/.test(value.name));
    if (!cookie) throw new Error("context_cookie_missing");
    const parts = session.access_token.split("."); parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
    cookies.jar.clear(); cookies.jar.set(cookie.name.replace(/\.\d+$/, ""), "base64-" + Buffer.from(JSON.stringify({ ...session, access_token: parts.join(".") })).toString("base64url"));
    expect((await create()).status).toBe(401);
    await login(a);
  }, 120_000);
  it("16 个真实并发创建只产生一个活动项目", async () => {
    const fixture = await seed("concurrent-create");
    const results = await Promise.all(Array.from({ length: 16 }, () => writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId })));
    const ids = [...new Set(results.map(result => result.id))]; expect(ids).toHaveLength(1); fixture.observe(ids[0]);
    expect(workspaceSql(`select count(*) from public.projects where selected_repository_id='${fixture.selectedRepositoryId}' and status is distinct from 'archived'`)).toBe("1");
    fixtureEvent("t03_concurrent_create_verified", { ...fixture, password: undefined, email: undefined, contenders: 16, projectIds: ids });
  }, 120_000);
  it("过期但签名正确的本地 JWT 被真实 Auth 拒绝", async () => {
    const session = await login(a);
    const cookie = cookies.getAll().find(value => /-auth-token(?:\.\d+)?$/.test(value.name));
    const secret = /^JWT_SECRET="(.*?)"$/m.exec(readIsolatedStatus().stdout)?.[1];
    if (!cookie || !secret) throw new Error("context_expiry_fixture_missing");
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ ...claims, iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 })).toString("base64url");
    const signed = `${header}.${payload}`;
    const token = `${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
    cookies.jar.clear(); cookies.jar.set(cookie.name.replace(/\.\d+$/, ""), "base64-" + Buffer.from(JSON.stringify({ ...session, access_token: token, expires_at: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"));
    expect((await create()).status).toBe(401);
    await login(a);
  }, 120_000);
  it.each(["removing", "removed", "account_pending"])("锁等待后重新检查生命周期 %s", async state => {
    const fixture = await seed(`lifecycle-${state}`);
    const created = await writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId }); fixture.observe(created.id);
    const lock = await holdSqlLock(`select id from public.github_installations where id='${fixture.installationId}' for update`);
    let released = false;
    const outcome = writer.patch({ userId: fixture.userId, projectId: created.id, changes: { currentStageGoal: "不能覆盖" } }).then(() => "unexpected_success", error => (error as Error).message);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 10 && !waiting; attempt++) { await new Promise(resolve => setTimeout(resolve, 50)); waiting = Number(workspaceSql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%patch_project_context%'")) > 0; }
      expect(waiting).toBe(true); released = true;
      await lock.finish(state === "account_pending"
        ? `select public.request_account_deletion('${fixture.userId}','t03-pending','DELETE ACCOUNT ${fixture.userId}'); COMMIT;`
        : `update public.projects set repository_data_state='${state}',repository_removed_at=${state === "removed" ? "now()" : "null"} where id='${created.id}'; COMMIT;`);
      expect(await outcome).toBe(state === "account_pending" ? "project_context_account_unavailable" : "project_context_repository_unavailable");
      expect(workspaceSql(`select current_stage_goal is null from public.projects where id='${created.id}'`)).toBe("t");
      fixtureEvent("t03_lifecycle_lock_verified", { userId: fixture.userId, projectId: created.id, state, blockedBeforeCommit: true, rejectedAfterCommit: true });
    } finally { if (!released) await lock.finish(); await outcome; }
  }, 120_000);
  it("旧完整保存与空背景创建竞争仍共享同一项目，完整内容不被清空", async () => {
    const fixture = await seed("legacy-create-race");
    const legacy = new SupabaseProjectCalibrationWriter({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
    const [created, saved] = await Promise.all([
      writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId }),
      legacy.save({ userId: fixture.userId, command: { selectedRepositoryId: fixture.selectedRepositoryId, coreGoal: "旧完整目标", currentStageGoal: "旧完整阶段", status: "in_development", currentBlocker: null } }),
    ]);
    fixture.observe(created.id); expect(created.id).toBe(saved.calibration.id);
    const reread = await writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId });
    expect(reread.context).toEqual({ coreGoal: "旧完整目标", currentStageGoal: "旧完整阶段", status: "in_development", currentBlocker: null });
    await writer.patch({ userId: fixture.userId, projectId: created.id, changes: { currentStageGoal: "本次只更新阶段" } });
    const refreshed = await writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId });
    expect(refreshed.context).toEqual({ coreGoal: "旧完整目标", currentStageGoal: "本次只更新阶段", status: "in_development", currentBlocker: null });
  }, 120_000);
  it("账户生命周期锁被占用时快速冲突，释放后可安全重试", async () => {
    const fixture = await seed("account-lock");
    const lock = await holdSqlLock(`select user_id from public.account_deletion_operations where user_id='${fixture.userId}' for update`);
    try { await expect(writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId })).rejects.toThrow("project_context_conflict"); }
    finally { await lock.finish(); }
    const created = await writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId }); fixture.observe(created.id);
  }, 120_000);
  it("取消选择与创建竞争只有一个允许的结果，不留下失去父记录的项目", async () => {
    const fixture = await seed("deselection-race");
    const repositoryId = Number(workspaceSql(`select github_repository_id from public.selected_repositories where id='${fixture.selectedRepositoryId}'`));
    const service = createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const [created, removed] = await Promise.all([
      writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId }).then(value => ({ value, error: null }), error => ({ value: null, error: (error as Error).message })),
      service.rpc("remove_selected_github_repository", { p_user_id: fixture.userId, p_github_repository_id: repositoryId }),
    ]);
    if (created.value) {
      fixture.observe(created.value.id); expect(removed.error?.message).toBe("github_repository_selection_active_project_conflict");
      expect(workspaceSql(`select count(*) from public.projects where id='${created.value.id}'`)).toBe("1");
    } else { expect(created.error).toBe("project_context_not_found"); expect(removed.error).toBeNull(); }
    fixtureEvent("t03_deselection_race_verified", { userId: fixture.userId, outcome: created.value ? "creation_won" : "deselection_won" });
  }, 120_000);
  it("等待期间被归档的项目在醒来后拒绝 PATCH", async () => {
    const fixture = await seed("archive-lock");
    const created = await writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId }); fixture.observe(created.id);
    const lock = await holdSqlLock(`select id from public.github_installations where id='${fixture.installationId}' for update`);
    let released = false;
    const outcome = writer.patch({ userId: fixture.userId, projectId: created.id, changes: { coreGoal: "不能覆盖" } }).then(() => "unexpected_success", error => (error as Error).message);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 10 && !waiting; attempt++) { await new Promise(resolve => setTimeout(resolve, 50)); waiting = Number(workspaceSql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%patch_project_context%'")) > 0; }
      expect(waiting).toBe(true); released = true;
      await lock.finish(`update public.projects set status='archived' where id='${created.id}'; COMMIT;`);
      expect(await outcome).toBe("project_context_archived");
      expect(workspaceSql(`select core_goal is null from public.projects where id='${created.id}'`)).toBe("t");
    } finally { if (!released) await lock.finish(); await outcome; }
  }, 120_000);
  it.each(["suspended", "revoked"])("等待安装锁后重读 %s，拒绝写入", async status => {
    const fixture = await seed(`lock-${status}`);
    const lock = await holdSqlLock(`select id from public.github_installations where id='${fixture.installationId}' for update`);
    let settled = false, released = false;
    const result = writer.create({ userId: fixture.userId, selectedRepositoryId: fixture.selectedRepositoryId }).then(value => ({ value }), error => ({ error: (error as Error).message })).finally(() => { settled = true; });
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 10 && !waiting; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        waiting = Number(workspaceSql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%create_project_from_repository%'")) > 0;
      }
      expect(waiting).toBe(true); expect(settled).toBe(false);
      released = true;
      await lock.finish(`update public.github_installations set status='${status}', ${status === "suspended" ? "suspended_at" : "revoked_at"}=now() where id='${fixture.installationId}'; COMMIT;`);
      expect(await result).toEqual({ error: "project_context_authorization_unavailable" });
      expect(workspaceSql(`select count(*) from public.projects where selected_repository_id='${fixture.selectedRepositoryId}'`)).toBe("0");
      fixtureEvent("t03_authorization_lock_verified", { userId: fixture.userId, installationId: fixture.installationId, status, blockedBeforeCommit: true, rejectedAfterCommit: true });
    } finally { if (!released) await lock.finish(); await result; }
  }, 120_000);
  it("归档项目不能恢复，旧行保持原样并创建新活动项目", async () => {
    await login(a);
    const archived = await patch({ status: "archived" }); expect(archived.status).toBe(200);
    expect((await archived.json()).project.syncPreparation).toEqual({ state: "blocked", requested: false });
    const before = workspaceSql(`select row_to_json(p) from public.projects p where id='${projectId}'`);
    expect((await patch({ status: "in_development" })).status).toBe(409);
    const replacement = await (await create()).json(); a.observe(replacement.project.id);
    expect(replacement.project.id).not.toBe(projectId); expect(replacement.project.context.status).toBeNull();
    expect(workspaceSql(`select row_to_json(p) from public.projects p where id='${projectId}'`)).toBe(before);
    expect(workspaceSql(`select (select count(*) from public.sync_runs where project_id in (select id from public.projects where user_id='${a.userId}'))+(select count(*) from public.project_sync_dispatches where project_id in (select id from public.projects where user_id='${a.userId}'))`)).toBe("0");
  }, 120_000);
});
