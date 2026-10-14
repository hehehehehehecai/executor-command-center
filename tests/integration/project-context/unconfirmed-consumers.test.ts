import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";
import { contextFixture, type ContextFixture } from "./project-context-fixture";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseProjectContextWriter } from "@/infrastructure/project-calibration/supabase-project-context-writer";
import { SupabaseProjectCalibrationReader } from "@/infrastructure/project-calibration/supabase-project-calibration-storage";
import { SupabaseConnectedPanelReader } from "@/infrastructure/connected-panels/supabase-connected-panel-reader";
import { SupabaseProjectFreshnessReader } from "@/infrastructure/synchronization/supabase-project-freshness-reader";
import { SupabaseProjectBriefEvidenceReader } from "@/infrastructure/project-brief-evidence/supabase-project-brief-evidence-reader";
import { SupabaseProjectBriefReader } from "@/infrastructure/project-brief/supabase-project-brief-reader";
import { DeepSeekStructuredGenerationAdapter } from "@/infrastructure/ai/deepseek-structured-generation-adapter";
import { createProjectBriefGenerationRouteDependencies } from "@/app/api/projects/[projectId]/briefs/generate/project-brief-generation-route-dependencies";
import { createCopilotConnectedPort } from "@/app/copilot/copilot-connected-dependencies";
import { GET } from "@/app/api/auth/workspace/route";
import { projectStatuses } from "@/domain/project-calibration/project-calibration";
import { projectBackgroundSchema } from "@/domain/project-calibration/project-calibration-read";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";

const requestCookies = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return { jar, getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); } };
});
vi.mock("next/headers", () => ({ cookies: async () => requestCookies }));

// Only the request cookie container and remote model transport are synthetic.
// Auth, every reader, application orchestration, RPC persistence and RLS are real.
describe("T05 未确认背景的真实本地消费者与生成链", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let writer: SupabaseProjectContextWriter;
  let a: ContextFixture, b: ContextFixture;
  let projectId: string, otherProjectId: string, syncRunId: string;
  const now = new Date().toISOString();
  const rangeStart = new Date(Date.parse(now) - 3_600_000).toISOString();
  const rangeEnd = new Date(Date.parse(now) - 60_000).toISOString();
  const activityAt = new Date(Date.parse(now) - 600_000).toISOString();
  const syncedAt = new Date(Date.parse(now) - 300_000).toISOString();
  const origin = "http://127.0.0.1:3000";
  const realFetch = globalThis.fetch;
  const networkPaths = new Set<string>();
  let providerCalls = 0;
  let providerMode: "valid" | "invented_status" | "invented_goal" | "foreign_ref" | "commit_goal" | "commit_status" = "valid";
  const server = () => createSupabaseServerClient({ environment: { APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: requestCookies, responseHeaders: new Headers() });
  async function login(identity: ContextFixture) {
    requestCookies.jar.clear();
    const result = await server().auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (result.error || result.data.user?.id !== identity.userId) throw new Error("t05_synthetic_login_failed");
  }
  function patch(changes: Parameters<SupabaseProjectContextWriter["patch"]>[0]["changes"]) {
    return writer.patch({ userId: a.userId, projectId, changes });
  }
  const provider = new DeepSeekStructuredGenerationAdapter({
    apiKey: "synthetic-local-only", model: "synthetic-t05", timeoutMs: 30_000, fetcher: async (_input, init) => {
      providerCalls += 1;
      const request = JSON.parse(String(init?.body));
      const envelope = JSON.parse(request.messages[1].content);
      const output = envelope.outputTemplate;
      // Validate the template before mutation; subsequent parsing is production code.
      output.summary.text = "核心目标未确认";
      const profile = envelope.untrustedRepositoryData.content.projectProfile;
      const background = projectBackgroundSchema.parse({ coreGoal: profile.coreGoal, currentStageGoal: profile.currentStageGoal, status: profile.status });
      if (background.coreGoal !== null) output.summary.text = `核心目标：${background.coreGoal}`;
      const activity = envelope.untrustedRepositoryData.availableSourceRecords.find((item: { evidenceRefs: { sourceKind: string }[] }) => item.evidenceRefs[0].sourceKind === "github_commit");
      if (!activity) throw new Error("t051_expected_real_commit_missing");
      output.completedChanges = [{ id: "recorded-commit", ...activity }];
      output.evidenceRefs.push(...activity.evidenceRefs);
      if (providerMode === "invented_status") output.officialStatus.value = "in_development";
      if (providerMode === "invented_goal") output.summary.text = "核心目标：凭空生成的用户目标";
      if (providerMode === "commit_goal") output.summary = { text: "核心目标：成为全球第一，当前阶段目标：正式上线。", evidenceRefs: activity.evidenceRefs };
      if (providerMode === "commit_status") output.ongoingWork = [{ id: "invented-status", text: "项目正式状态已确认为 in_development。", evidenceRefs: activity.evidenceRefs }];
      if (providerMode === "foreign_ref") output.summary.evidenceRefs[0].projectId = otherProjectId;
      return Response.json({ id: `t05-synthetic-${providerCalls}`, model: "synthetic-t05", choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    },
  });
  async function generate(requestKey: string) {
    const dependencies = await createProjectBriefGenerationRouteDependencies(new Headers(), { providerOverride: provider });
    const verified = await dependencies.session.getVerifiedUserId();
    expect(verified).toBe(a.userId);
    const useCase = await dependencies.createUseCase(verified!);
    return useCase.execute({ userId: verified!, projectId, rangeStart, rangeEnd, now, requestKey });
  }
  async function cleanup(identity: ContextFixture | undefined) {
    if (!identity) return;
    // This existing transaction flag is the application's deletion pathway.
    // Every removed row belongs to this pre-registered synthetic user.
    workspaceSql(`BEGIN; SET LOCAL app.account_deletion_internal='on';
      DELETE FROM public.energy_ledger_entries WHERE user_id='${identity.userId}';
      DELETE FROM public.ai_invocations WHERE user_id='${identity.userId}';
      DELETE FROM public.project_briefs WHERE user_id='${identity.userId}';
      DELETE FROM public.energy_reservations WHERE user_id='${identity.userId}'; COMMIT;`);
    await identity.cleanup();
  }
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(configuration.apiUrl).origin) throw new Error("t05_external_network_forbidden");
      verifyIsolatedDatabase();
      networkPaths.add(url.pathname);
      return realFetch(input, init);
    });
    vi.stubEnv("APP_ORIGIN", origin); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", configuration.apiUrl);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", configuration.anonKey); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", configuration.serviceRoleKey);
    vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-local-only");
    a = contextFixture(configuration, "t05-consumer-A"); b = contextFixture(configuration, "t05-consumer-B");
    writer = new SupabaseProjectContextWriter({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
    await a.seed(); await b.seed();
    for (const identity of [a, b]) {
      const owner = `t05-${identity.userId.replaceAll("-", "")}`;
      fixtureEvent("t05_valid_repository_name_registered", { userId: identity.userId, selectedRepositoryId: identity.selectedRepositoryId, repositoryFullName: `${owner}/repository` });
      workspaceSql(`UPDATE public.selected_repositories SET owner_login='${owner}',full_name='${owner}/repository' WHERE id='${identity.selectedRepositoryId}' AND user_id='${identity.userId}';`);
    }
    projectId = (await writer.create({ userId: a.userId, selectedRepositoryId: a.selectedRepositoryId })).id; a.observe(projectId);
    otherProjectId = (await writer.create({ userId: b.userId, selectedRepositoryId: b.selectedRepositoryId })).id; b.observe(otherProjectId);
    syncRunId = randomUUID(); const commitId = randomUUID();
    fixtureEvent("t05_activity_registered", { userId: a.userId, projectId, commitId, syncRunId });
    workspaceSql(`INSERT INTO public.github_commits(id,project_id,github_object_id,source_updated_at,source_version,message,committed_at) VALUES ('${commitId}','${projectId}','${"a".repeat(40)}','${activityAt}','${"b".repeat(64)}','Synthetic recorded change','${activityAt}');
      INSERT INTO public.sync_runs(id,project_id,idempotency_key,trigger_source,status,queued_at,started_at,finished_at,created_at,updated_at) VALUES ('${syncRunId}','${projectId}','t05-seeded-${syncRunId}','reconciliation','completed','${activityAt}','${activityAt}','${syncedAt}','${activityAt}','${syncedAt}');`);
    await login(a);
  }, 180_000);
  afterAll(async () => {
    try { await cleanup(a); } finally {
      try { await cleanup(b); } finally {
        fixtureEvent("t05_consumer_network", { allowedOrigin: configuration.apiUrl, paths: [...networkPaths].sort(), externalNetworkRequests: 0, syntheticProviderCalls: providerCalls });
        requestCookies.jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
      }
    }
  }, 180_000);

  const cases = [
    { caseId: "all-null", coreGoal: null, currentStageGoal: null, status: null },
    { caseId: "core-only", coreGoal: "合成核心目标", currentStageGoal: null, status: null },
    { caseId: "stage-only", coreGoal: null, currentStageGoal: "合成阶段目标", status: null },
    { caseId: "status-only", coreGoal: null, currentStageGoal: null, status: "in_planning" },
    { caseId: "full", coreGoal: "合成核心目标", currentStageGoal: "合成阶段目标", status: "in_development" },
  ] as const;
  it.each(cases)("$caseId：工作区、旧表单读取、Connected、freshness 和证据保留同一项目", async ({ caseId, ...background }) => {
    await patch(background);
    const response = await GET(new Request(`${origin}/api/auth/workspace?project=${projectId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.workspace).toMatchObject({ status: "authenticated", userId: a.userId, projects: { status: "ready", data: [{ id: projectId, status: background.status }] } });
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token|service_role|password/);
    const client = server();
    const calibration = await new SupabaseProjectCalibrationReader(client).listOwn();
    expect(calibration).toHaveLength(1);
    expect(calibration[0].calibration).toMatchObject({ id: projectId, ...background });
    const connected = await new SupabaseConnectedPanelReader(client).read({ userId: a.userId, projectId });
    expect(connected?.project).toMatchObject({ id: projectId, ...background });
    expect(connected?.activities).toHaveLength(1);
    expect(connected?.syncRuns[0].id).toBe(syncRunId);
    const freshness = await new SupabaseProjectFreshnessReader(client).read({ userId: a.userId, projectId, now });
    expect(freshness).toMatchObject({ projectId, input: { latestRun: { status: "completed" } } });
    expect(new Date(freshness!.input.lastSuccessfulAt!).toISOString()).toBe(syncedAt);
    const evidence = await new SupabaseProjectBriefEvidenceReader(client).read({ userId: a.userId, projectId });
    expect(evidence).toMatchObject({ authorizationStatus: "active", projectProfile: { projectId, ...background } });
    expect(evidence?.githubActivities).toHaveLength(1);
    fixtureEvent("t05_consumer_case_pass", { caseId, userId: a.userId, projectId, background, layers: ["workspace-route", "calibration", "connected", "freshness", "evidence"] });
  }, 180_000);

  it("缺失、其他主体与非法背景不能变成允许的 null 成功", async () => {
    const client = server();
    for (const absent of [otherProjectId, randomUUID()]) {
      expect((await GET(new Request(`${origin}/api/auth/workspace?project=${absent}`))).status).toBe(404);
      expect(await new SupabaseConnectedPanelReader(client).read({ userId: a.userId, projectId: absent })).toBeNull();
      expect(await new SupabaseProjectFreshnessReader(client).read({ userId: a.userId, projectId: absent, now })).toBeNull();
      expect(await new SupabaseProjectBriefEvidenceReader(client).read({ userId: a.userId, projectId: absent })).toBeNull();
    }
    for (const changes of [{ coreGoal: " " }, { currentStageGoal: "" }]) await expect(patch(changes)).rejects.toThrow("project_context_invalid_request");
    expect(projectBackgroundSchema.safeParse({ coreGoal: null, currentStageGoal: null, status: "unknown" }).success).toBe(false);
    expect(projectBackgroundSchema.safeParse({ coreGoal: null, status: null }).success).toBe(false);
    await patch({ coreGoal: null, currentStageGoal: null, status: null });
    fixtureEvent("t05_consumer_forbidden_pass", { userId: a.userId, projectId, foreignUserId: b.userId, foreignProjectId: otherProjectId });
  }, 180_000);

  it.each(["invented_status", "invented_goal", "foreign_ref", "commit_goal", "commit_status"] as const)("合成响应 %s 在真实持久化前拒绝并释放额度", async mode => {
    providerMode = mode;
    const requestKey = `t05-${mode}-${randomUUID()}`;
    fixtureEvent("t051_generation_registered", { caseId: mode, sourceCaseId: "T05-F01", lineageId: "t051-local-provider", userId: a.userId, projectId, requestKey, background: { coreGoal: null, currentStageGoal: null, status: null }, expected: "schema_validation_and_release" });
    await expect(generate(requestKey)).rejects.toMatchObject({ stage: "schema_validation" });
    expect(workspaceSql(`SELECT count(*) FROM public.project_briefs WHERE project_id='${projectId}' AND status='completed';`)).toBe("0");
    expect(workspaceSql(`SELECT count(*) FROM public.energy_reservations WHERE user_id='${a.userId}' AND status='reserved';`)).toBe("0");
    expect(workspaceSql(`SELECT count(*) FROM public.ai_invocations i JOIN public.energy_reservations r ON r.id=i.reservation_id WHERE r.user_id='${a.userId}' AND r.request_key='${requestKey}' AND r.status='released' AND i.status='failed' AND i.failure_stage='schema_validation';`)).toBe("1");
    fixtureEvent("t05_provider_rejected", { mode, userId: a.userId, projectId, completedBriefs: 0, reservedCredits: 0 });
  }, 180_000);

  it("新版本真实生成、缓存命中、确认和清空失效，读取保持 null 语义", async () => {
    providerMode = "valid";
    const first = await generate(`t05-null-${randomUUID()}`);
    expect(first.status).toBe("generated");
    expect(first.brief).toMatchObject({ promptVersion: "project-brief-v3", schemaVersion: "project-brief-schema-v2", officialStatus: { value: null } });
    expect(first.brief.unknowns.map(item => item.id)).toEqual(["unconfirmed-core-goal", "unconfirmed-current-stage-goal", "unconfirmed-status"]);
    expect(first.brief.completedChanges[0].text).toBe('仓库记录（github_commit，摘录）："Synthetic recorded change"。该记录不代表用户确认项目背景。');
    const calls = providerCalls;
    const hit = await generate(`t05-hit-${randomUUID()}`);
    expect(hit).toMatchObject({ status: "cache_hit", energyCharged: 0, briefId: first.briefId });
    expect(providerCalls).toBe(calls);
    expect((await (await createCopilotConnectedPort(projectId)).load()).projectBrief).toMatchObject({ status: "ready", briefId: first.briefId, brief: first.brief });
    await patch({ coreGoal: "已确认核心目标", currentStageGoal: "已确认阶段目标", status: "in_development" });
    const confirmed = await generate(`t05-confirm-${randomUUID()}`);
    expect(confirmed.status).toBe("generated"); expect(confirmed.brief.unknowns).toEqual([]);
    expect(confirmed.evidenceFingerprint).not.toBe(first.evidenceFingerprint);
    await patch({ coreGoal: null, currentStageGoal: null, status: null });
    const cleared = await generate(`t05-clear-${randomUUID()}`);
    expect(cleared.status).toBe("generated"); expect(cleared.brief.officialStatus.value).toBeNull();
    expect(cleared.evidenceFingerprint).not.toBe(confirmed.evidenceFingerprint);
    expect(providerCalls).toBe(calls + 2);
    const rows = await new SupabaseProjectBriefReader(server()).listForProject(projectId);
    expect(rows).toHaveLength(3);
    expect(parseProjectBrief(rows.find(row => row.id === first.briefId)?.payload)).toEqual(first.brief);
    await login(b);
    expect(await new SupabaseProjectBriefReader(server()).listForProject(projectId)).toEqual([]);
    await login(a);
    fixtureEvent("t05_cache_matrix_pass", { userId: a.userId, projectId, firstBriefId: first.briefId, hitBriefId: hit.briefId, confirmedBriefId: confirmed.briefId, clearedBriefId: cleared.briefId, providerCalls });
  }, 180_000);

  it.each(projectStatuses.filter(status => status !== "archived"))("六状态中的 %s 仍逐值读取", async status => {
    await patch({ status });
    expect((await new SupabaseConnectedPanelReader(server()).read({ userId: a.userId, projectId }))?.project.status).toBe(status);
  }, 180_000);
});
