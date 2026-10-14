import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "../../../src/infrastructure/auth/supabase-server-client";
import { POST } from "../../../src/app/api/auth/sign-out/route";
import { GET } from "../../../src/app/api/auth/workspace/route";
import { registeredWorkspaceFixture, workspaceConfiguration, workspaceSql, fixtureEvent, type WorkspaceFixture } from "./workspace-fixture";

// Only the Next request cookie store is supplied by this harness. Auth SDK,
// workspace reader, routes, network calls and database RLS are all real.
const requestCookies = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return { jar, getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); } };
});
vi.mock("next/headers", () => ({ cookies: async () => requestCookies }));

describe("真实 SDK 与工作区路由会话边界", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let a: WorkspaceFixture | undefined;
  let b: WorkspaceFixture | undefined;
  const origin = "http://127.0.0.1:3000";
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: requestCookies, responseHeaders: new Headers() });
  const anon = () => createClient(configuration.apiUrl, configuration.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const workspace = () => GET(new Request(`${origin}/api/auth/workspace`));
  const logout = () => POST(new Request(`${origin}/api/auth/sign-out`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin" } }));
  async function login(identity: WorkspaceFixture) {
    const result = await server().auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (result.error || !result.data.session) throw new Error("workspace_real_session_login_failed");
    return result.data.session;
  }
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubEnv("APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configuration.apiUrl); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configuration.anonKey);
    a = registeredWorkspaceFixture(configuration, "session-A"); b = registeredWorkspaceFixture(configuration, "session-B");
    await a.seed(); await b.seed();
  }, 120_000);
  afterAll(async () => { try { await a?.cleanup(); } finally { try { await b?.cleanup(); } finally { requestCookies.jar.clear(); vi.unstubAllEnvs(); } } }, 120_000);

  it("退出仅撤销当前会话，清空 Cookie，保留同用户其他会话、B 会话及业务数据", async () => {
    const current = await login(a!);
    const otherA = anon(), otherB = anon();
    for (const [client, identity] of [[otherA, a!], [otherB, b!]] as const) {
      const result = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
      if (result.error) throw new Error("workspace_parallel_session_failed");
    }
    const snapshot = () => workspaceSql(`BEGIN READ ONLY; SELECT json_build_object('installation',(SELECT row_to_json(i) FROM public.github_installations i WHERE id='${a!.installationId}'),'project',(SELECT row_to_json(p) FROM public.projects p WHERE id='${a!.projectId}')); COMMIT;`);
    const before = snapshot();
    expect((await (await workspace()).json()).workspace.userId).toBe(a!.userId);
    const response = await logout();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ signedOut: true, redirectTo: "/?signedOut=1" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(requestCookies.jar.size).toBe(0);
    expect((await (await workspace()).json()).workspace).toEqual({ status: "signed_out", reason: "missing_session" });
    const revoked = await anon().auth.refreshSession({ refresh_token: current.refresh_token });
    expect(Boolean(revoked.error)).toBe(true); expect(revoked.data.session).toBeNull();
    for (const [client, identity] of [[otherA, a!], [otherB, b!]] as const) {
      const refreshed = await client.auth.refreshSession();
      expect(refreshed.error).toBeNull(); expect(refreshed.data.user?.id).toBe(identity.userId);
      const projects = await client.from("projects").select("id");
      expect(projects.error).toBeNull(); expect(projects.data).toEqual([{ id: identity.projectId }]);
      await client.auth.signOut({ scope: "local" });
    }
    expect(snapshot()).toBe(before);
    fixtureEvent("current_session_logout_verified", { userId: a!.userId, ownOtherSessionPreserved: true, otherUserSessionPreserved: true, cookieCount: 0, revokedRefreshRejected: true, businessRowsUnchanged: true });
  }, 120_000);

  it("真实 Auth 拒绝无效 Cookie 内的 JWT，工作区不返回身份或项目", async () => {
    const session = await login(a!);
    const cookie = requestCookies.getAll().find(value => /-auth-token(?:\.\d+)?$/.test(value.name));
    if (!cookie) throw new Error("workspace_real_cookie_missing");
    const name = cookie.name.replace(/\.\d+$/, "");
    const parts = session.access_token.split(".");
    parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
    requestCookies.jar.clear();
    requestCookies.jar.set(name, "base64-" + Buffer.from(JSON.stringify({ ...session, access_token: parts.join(".") })).toString("base64url"));
    const response = await workspace();
    expect(response.status).toBe(200);
    expect((await response.json()).workspace).toEqual({ status: "signed_out", reason: "invalid_session" });
    // Revoke this synthetic session using its valid original tokens, never the invalid JWT.
    const cleanup = anon();
    const restored = await cleanup.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (restored.error) throw new Error("workspace_invalid_session_cleanup_failed");
    await cleanup.auth.signOut({ scope: "local" }); requestCookies.jar.clear();
    fixtureEvent("invalid_jwt_verified", { userId: a!.userId, workspaceIdentityReturned: false, workspaceProjectsReturned: false });
  }, 120_000);

  it("同一 Cookie 容器由 A 退出后登录 B，统一路由仅返回 B 且拒绝 A 项目", async () => {
    await login(a!);
    expect((await (await workspace()).json()).workspace.userId).toBe(a!.userId);
    expect((await logout()).status).toBe(200);
    await login(b!);
    const response = await workspace();
    const body = await response.json();
    expect(body.workspace).toMatchObject({ status: "authenticated", userId: b!.userId, projects: { status: "ready", data: [{ id: b!.projectId, name: b!.repositoryFullName }] } });
    expect(JSON.stringify(body)).not.toContain(a!.userId); expect(JSON.stringify(body)).not.toContain(a!.projectId);
    const denied = await GET(new Request(`${origin}/api/auth/workspace?project=${a!.projectId}&userId=${a!.userId}`));
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ error: { code: "project_not_found" } });
    expect((await logout()).status).toBe(200);
    fixtureEvent("account_switch_verified", { from: a!.userId, to: b!.userId, oldProjectDenied: true });
  }, 120_000);
});
