import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registeredWorkspaceFixture, workspaceConfiguration, workspaceSql, type WorkspaceFixture } from "./workspace-fixture";
import { SupabaseWorkspaceContextReader, type WorkspaceSessionClient } from "../../../src/infrastructure/workspace/supabase-workspace-context-reader";
import { loadWorkspaceContext } from "../../../src/application/workspace/load-workspace-context";

describe("工作区真实会话适配器与 RLS", () => {
  let a: WorkspaceFixture | undefined;
  let b: WorkspaceFixture | undefined;
  let ca: SupabaseClient;
  let cb: SupabaseClient;
  const reader = (client: SupabaseClient) => new SupabaseWorkspaceContextReader(client as unknown as WorkspaceSessionClient);
  beforeAll(async () => {
    const configuration = workspaceConfiguration();
    a = registeredWorkspaceFixture(configuration, "context-A"); b = registeredWorkspaceFixture(configuration, "context-B");
    await a.seed(); await b.seed();
    // Fixture setup uses the local admin key. The real reader only receives an
    // anonymous client signed in as the corresponding synthetic account.
    ca = createClient(configuration.apiUrl, configuration.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    cb = createClient(configuration.apiUrl, configuration.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const [client, identity] of [[ca, a], [cb, b]] as const) {
      const { error } = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
      if (error) throw new Error("workspace_fixture_sign_in_failed");
    }
  }, 120_000);
  afterAll(async () => { try { await a?.cleanup(); } finally { await b?.cleanup(); } }, 120_000);
  it("A 与 B 各自只读到自己的身份、安装和项目", async () => {
    for (const [client, identity, other] of [[ca, a!, b!], [cb, b!, a!]] as const) {
      const context = await loadWorkspaceContext(reader(client));
      expect(context).toMatchObject({ status: "authenticated", userId: identity.userId, identity: { status: "ready" }, installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: [{ id: identity.projectId, name: identity.repositoryFullName }] } });
      expect(JSON.stringify(context)).not.toContain(other.projectId);
    }
  });
  it("A 注入 B 的用户或项目仍被真实 RLS 拒绝", async () => {
    expect(await reader(ca).readProjects(b!.userId)).toEqual([]);
    await expect(reader(ca).readIdentity(b!.userId)).rejects.toThrow("workspace_identity_unavailable");
    const response = await ca.from("projects").select("id").eq("id", b!.projectId);
    expect(response.error).toBeNull(); expect(response.data).toEqual([]);
  });
  it.each(["suspended", "revoked"])("安装 %s 时项目不得通过统一视图泄露", async status => {
    workspaceSql(`update public.github_installations set status='${status}', suspended_at=${status === "suspended" ? "now()" : "null"}, revoked_at=${status === "revoked" ? "now()" : "null"} where id='${a!.installationId}'`);
    try { expect(await loadWorkspaceContext(reader(ca))).toMatchObject({ status: "authenticated", installation: { status: "ready", data: { status } }, projects: { status: "blocked" } }); }
    finally { workspaceSql(`update public.github_installations set status='active', suspended_at=null, revoked_at=null where id='${a!.installationId}'`); }
  });
});
