import { randomUUID, generateKeyPairSync, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readIsolatedStatus } from "../../../scripts/isolated-test-target.mjs";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { createSupabaseServerClient } from "../../../src/infrastructure/auth/supabase-server-client";
import { SupabaseInstallationManagementContext } from "../../../src/infrastructure/github/supabase-installation-management-context";
import * as currentRoute from "../../../src/app/api/github/installations/current/route";
import * as manageRoute from "../../../src/app/api/github/installations/manage/route";

const cookies = vi.hoisted(() => { const jar = new Map<string, string>(); return { jar, getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); } }; });
vi.mock("next/headers", () => ({ cookies: async () => cookies }));
describe("T02 管理路由真实会话与 RLS", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  const origin = "http://127.0.0.1:3000";
  const identities = ["A", "B"].map(label => ({ userId: randomUUID(), identityId: randomUUID(), installationId: randomUUID(), numeric: Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 12), 16), email: `t02-${randomUUID()}@example.invalid`, label }));
  const password = "T02-synthetic-session-only-42!";
  const destinations = new Set<string>();
  let upstreamCalls = 0;
  let mode: "active" | "suspended" | "missing" | "bad_url" | "wrong_app" | "wrong_account" | "organization" | "forbidden" | "rate_limit" | "race" = "active";
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: cookies, responseHeaders: new Headers() });
  async function login(identity = identities[0]) { cookies.jar.clear(); const result = await server().auth.signInWithPassword({ email: identity.email, password }); if (result.error || !result.data.session) throw new Error("management_fixture_login_failed"); return result.data.session; }
  const request = (path = "/api/github/installations/current") => new Request(origin + path, { headers: { origin, "sec-fetch-site": "same-origin" } });
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    for (const identity of identities) fixtureEvent("t02_registered_before_creation", { ...identity, email: undefined });
    vi.stubEnv("APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configuration.apiUrl); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configuration.anonKey);
    vi.stubEnv("GITHUB_APP_ID", "900001"); vi.stubEnv("GITHUB_APP_SLUG", "synthetic-management"); vi.stubEnv("GITHUB_REST_API_VERSION", "2026-03-10");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }).privateKey);
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin === configuration.apiUrl) { destinations.add(url.origin + url.pathname); return realFetch(input, init); }
      const identity = identities.find(value => url.href === `https://api.github.com/app/installations/${value.numeric}`);
      if (!identity || init?.method !== "GET") throw new Error("management_external_network_forbidden");
      upstreamCalls += 1;
      expect(init.cache).toBe("no-store"); expect(init.redirect).toBe("error");
      if (mode === "race") workspaceSql(`update public.github_installations set status='suspended',suspended_at=now() where id='${identity.installationId}'`);
      if (["missing", "forbidden", "rate_limit"].includes(mode)) return Response.json({ message: "synthetic upstream" }, { status: mode === "missing" ? 404 : mode === "forbidden" ? 403 : 429 });
      return Response.json({ id: identity.numeric, app_id: mode === "wrong_app" ? 900002 : 900001, account: { id: mode === "wrong_account" ? identity.numeric + 1 : identity.numeric, login: "synthetic", type: mode === "organization" ? "Organization" : "User" }, suspended_at: mode === "suspended" ? "2026-09-28T00:00:00Z" : null, repository_selection: "selected", html_url: mode === "bad_url" ? "https://github.com.evil.invalid/settings/installations/1" : `https://github.com/settings/installations/${identity.numeric}` });
    });
    const admin = createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const identity of identities) {
      const result = await admin.auth.admin.createUser({ id: identity.userId, email: identity.email, password, email_confirm: true }); if (result.error) throw new Error("management_fixture_seed_failed");
      workspaceSql(`BEGIN; insert into public.users(id) values ('${identity.userId}'); insert into public.github_identities(id,user_id,github_user_id,github_login) values ('${identity.identityId}','${identity.userId}',${identity.numeric},'synthetic-t02-${identity.label}'); insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at) values ('${identity.installationId}','${identity.userId}',${identity.numeric},${identity.numeric},'synthetic-t02-${identity.label}','User','selected','active',now()); COMMIT;`);
      fixtureEvent("t02_created", { ...identity, email: undefined });
    }
  }, 120_000);
  afterAll(async () => {
    try {
      const admin = createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      for (const identity of identities) {
        const result = await admin.auth.admin.deleteUser(identity.userId); if (result.error && result.error.status !== 404) throw new Error("management_fixture_cleanup_failed");
        workspaceSql(`delete from public.account_deletion_operations where user_id='${identity.userId}' and not exists(select 1 from auth.users where id='${identity.userId}');`);
        const remaining = Number(workspaceSql(`select (select count(*) from auth.users where id='${identity.userId}')+(select count(*) from public.users where id='${identity.userId}')+(select count(*) from public.github_identities where id='${identity.identityId}')+(select count(*) from public.github_installations where id='${identity.installationId}')+(select count(*) from auth.sessions where user_id='${identity.userId}');`));
        fixtureEvent("t02_cleanup_verified", { ...identity, email: undefined, remaining }); expect(remaining).toBe(0);
      }
      fixtureEvent("t02_network_summary", { destinations: [...destinations], syntheticGitHubReads: upstreamCalls, externalCalls: 0, synchronizationOrModelCalls: 0 });
    } finally { cookies.jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  }, 120_000);
  it("未登录拒绝且不触达 GitHub", async () => { expect((await currentRoute.GET(request())).status).toBe(401); expect(upstreamCalls).toBe(0); });
  it.each([0, 1])("真实账号 %# 只管理自己的安装", async index => {
    const identity = identities[index]; await login(identity); const response = await currentRoute.GET(request()); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ subjectId: identity.userId, status: "active", canSelectRepositories: true });
    const redirect = await manageRoute.GET(request("/api/github/installations/manage")); expect(redirect.status).toBe(303); expect(redirect.headers.get("location")).toBe(`https://github.com/settings/installations/${identity.numeric}`);
    await expect(new SupabaseInstallationManagementContext(server()).read(identities[1 - index].userId)).rejects.toThrow("installation_context_read_failed");
  });
  it.each(["suspended", "revoked"] as const)("本地 %s 不能被只读刷新恢复成可选择", async status => {
    await login(); const a = identities[0]; workspaceSql(`update public.github_installations set status='${status}',suspended_at=${status === "suspended" ? "now()" : "null"},revoked_at=${status === "revoked" ? "now()" : "null"} where id='${a.installationId}'`);
    try { expect(await (await currentRoute.GET(request())).json()).toMatchObject({ status: "active", reconnectRequired: true, canSelectRepositories: false }); expect(workspaceSql(`select status from public.github_installations where id='${a.installationId}'`)).toBe(status); }
    finally { workspaceSql(`update public.github_installations set status='active',suspended_at=null,revoked_at=null where id='${a.installationId}'`); }
  });
  it.each([["wrong_app",403],["wrong_account",403],["organization",409],["forbidden",502],["rate_limit",429]] as const)("远端 %s 明确失败，不伪装成空仓库", async (scenario, status) => { await login(); mode = scenario; try { expect((await currentRoute.GET(request())).status).toBe(status); } finally { mode = "active"; } });
  it("远端暂停与撤销返回不可选择且不写入本地状态", async () => { await login(); try { mode = "suspended"; expect(await (await currentRoute.GET(request())).json()).toMatchObject({ status: "suspended", canSelectRepositories: false }); mode = "missing"; expect(await (await currentRoute.GET(request())).json()).toMatchObject({ status: "revoked", canSelectRepositories: false }); expect(workspaceSql(`select status from public.github_installations where id='${identities[0].installationId}'`)).toBe("active"); } finally { mode = "active"; } });
  it("无效管理地址不跳转且保留其他真实状态", async () => { await login(); mode = "bad_url"; try { expect(await (await currentRoute.GET(request())).json()).toMatchObject({ status: "active", managementUrl: null, managementError: "installation_management_address_unavailable" }); const result = await manageRoute.GET(request("/api/github/installations/manage")); expect(result.status).toBe(502); expect(result.headers.has("location")).toBe(false); } finally { mode = "active"; } });
  it("远端响应期间本地安装变化被重新读取并拒绝", async () => { await login(); mode = "race"; try { const result = await currentRoute.GET(request()); expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ error: { code: "installation_context_changed" } }); } finally { mode = "active"; workspaceSql(`update public.github_installations set status='active',suspended_at=null where id='${identities[0].installationId}'`); } });
  it.each(["tampered", "expired"] as const)("真实 Auth 拒绝 %s 会话且不调用 GitHub", async scenario => {
    const session = await login(); const cookie = cookies.getAll().find(value => /-auth-token(?:\.\d+)?$/.test(value.name)); if (!cookie) throw new Error("fixture_cookie_missing");
    let token: string;
    if (scenario === "tampered") { const pieces = session.access_token.split("."); pieces[2] = (pieces[2][0] === "a" ? "b" : "a") + pieces[2].slice(1); token = pieces.join("."); }
    else { const secret = /^JWT_SECRET="(.*?)"$/m.exec(readIsolatedStatus().stdout)?.[1]; if (!secret) throw new Error("fixture_secret_missing"); const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()); const data = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ ...claims, iat: Math.floor(Date.now()/1000)-7200, exp: Math.floor(Date.now()/1000)-3600 })).toString("base64url"); token = data + "." + createHmac("sha256", secret).update(data).digest("base64url"); }
    cookies.jar.clear(); cookies.jar.set(cookie.name.replace(/\.\d+$/, ""), "base64-" + Buffer.from(JSON.stringify({ ...session, access_token: token, expires_at: Math.floor(Date.now()/1000)+3600 })).toString("base64url")); const before = upstreamCalls; expect((await currentRoute.GET(request())).status).toBe(401); expect(upstreamCalls).toBe(before);
  }, 120_000);
});
