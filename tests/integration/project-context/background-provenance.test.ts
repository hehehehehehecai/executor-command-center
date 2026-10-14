import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";
import { contextFixture } from "./project-context-fixture";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { SupabaseProjectContextWriter } from "@/infrastructure/project-calibration/supabase-project-context-writer";
import { SupabaseEnergyReservationClient } from "@/infrastructure/ai-usage/supabase-energy-reservation-client";
import { SupabaseProjectBriefGenerationPersistence } from "@/infrastructure/project-brief/supabase-project-brief-generation-persistence";
import { SupabaseProjectBriefReader } from "@/infrastructure/project-brief/supabase-project-brief-reader";
import { SupabaseProjectBriefCache } from "@/infrastructure/project-brief/supabase-project-brief-cache";
import { SupabaseProjectBriefAuthorizationGate } from "@/infrastructure/project-brief/supabase-project-brief-authorization-gate";
import { SupabaseProjectBriefHistoricalReceiptReader } from "@/infrastructure/project-brief/supabase-project-brief-historical-receipt-reader";
import { SupabaseProjectBriefEvidenceReader } from "@/infrastructure/project-brief-evidence/supabase-project-brief-evidence-reader";
import { SupabaseProjectFreshnessReader } from "@/infrastructure/synchronization/supabase-project-freshness-reader";
import { ExistingProjectFreshnessEvidenceReader } from "@/infrastructure/project-brief-evidence/existing-project-freshness-evidence-reader";
import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";
import { BuildProjectBriefEvidenceSnapshotUseCase } from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
import { ValidateStoredProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-stored-project-brief-evidence";
import { LoadValidatedProjectBriefUseCase } from "@/application/project-brief/load-validated-project-brief";
import { GenerateProjectBriefUseCase } from "@/application/project-brief/generate-project-brief";
import { canonicalizeEvidenceValue } from "@/domain/project-brief-evidence/canonicalization";
import { buildProjectBriefGenerationPrompt } from "@/domain/project-brief/project-brief-prompt";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";
import type { ProjectBrief, ProjectBriefEvidenceRef } from "@/domain/project-brief/project-brief-contract";
import { completedStructuredGeneration, createStructuredGenerationMetadata } from "@/shared/ai/structured-generation-result";
import type { AIProvider } from "@/shared/ai/ai-provider";
import type { StructuredGenerationRequest } from "@/shared/ai/structured-generation-request";

describe("T05.1 实际本地缓存、当前读取及历史回执的背景来源约束", () => {
  it.each(["goal", "status"] as const)("已持久化的旧 v3 %s 绕过不能从缓存或回执恢复", async mode => {
    const configuration = workspaceConfiguration();
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(configuration.apiUrl).origin) throw new Error("t051_external_network_forbidden");
      verifyIsolatedDatabase(); return realFetch(input, init);
    });
    const identity = contextFixture(configuration, `t051-provenance-${mode}`);
    const now = new Date().toISOString();
    const rangeStart = new Date(Date.parse(now) - 3_600_000).toISOString();
    const rangeEnd = new Date(Date.parse(now) - 60_000).toISOString();
    const activityAt = new Date(Date.parse(now) - 600_000).toISOString();
    const finishedAt = new Date(Date.parse(now) - 300_000).toISOString();
    const expiresAt = new Date(Date.parse(now) + 86_400_000).toISOString();
    try {
      await identity.seed();
      const writer = new SupabaseProjectContextWriter({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
      const projectId = (await writer.create({ userId: identity.userId, selectedRepositoryId: identity.selectedRepositoryId })).id;
      identity.observe(projectId);
      const commitId = randomUUID(), syncRunId = randomUUID();
      fixtureEvent("t051_provenance_sources_registered", { userId: identity.userId, projectId, commitId, syncRunId, caseId: mode, sourceCaseId: "T05-F01", lineageId: "t051-real-old-v3", exposure: "exposed_engineering_regression" });
      workspaceSql(`INSERT INTO public.github_commits(id,project_id,github_object_id,source_updated_at,source_version,message,committed_at) VALUES ('${commitId}','${projectId}','${"c".repeat(40)}','${activityAt}','${"d".repeat(64)}','A recorded change','${activityAt}'); INSERT INTO public.sync_runs(id,project_id,idempotency_key,trigger_source,status,queued_at,started_at,finished_at,created_at,updated_at) VALUES ('${syncRunId}','${projectId}','t051-${syncRunId}','reconciliation','completed','${rangeStart}','${rangeStart}','${finishedAt}','${rangeStart}','${finishedAt}');`);
      const jar = new Map<string, string>();
      const client = createSupabaseServerClient({ environment: { APP_ORIGIN: "http://127.0.0.1:3000", NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name, value) => { if (value) jar.set(name, value); else jar.delete(name); } }, responseHeaders: new Headers() });
      const login = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
      expect(login.data.user?.id).toBe(identity.userId);
      const sources = new SupabaseProjectBriefEvidenceReader(client as ConstructorParameters<typeof SupabaseProjectBriefEvidenceReader>[0]);
      const fingerprint = new NodeProjectBriefEvidenceFingerprint();
      const builder = new BuildProjectBriefEvidenceSnapshotUseCase({ sourceReader: sources, freshnessReader: new ExistingProjectFreshnessEvidenceReader(new SupabaseProjectFreshnessReader(client)), fingerprint });
      const evidence = await builder.execute({ userId: identity.userId, projectId, rangeStart, rangeEnd, now });
      const refs: ProjectBriefEvidenceRef[] = [evidence.snapshot.projectProfile.sourceRef, evidence.snapshot.githubActivities[0].sourceRef, evidence.snapshot.freshness.sourceRef].map(({ contractVersion, sourceKind, sourceId, projectId }) => ({ contractVersion, sourceKind, sourceId, projectId }));
      const { status, evaluatedAt, lastSuccessfulAt, coverageComplete } = evidence.snapshot.freshness;
      const envelope = JSON.parse(buildProjectBriefGenerationPrompt({ projectId, rangeStart, rangeEnd, officialStatus: null, evidenceFingerprint: evidence.fingerprint, canonicalEvidenceSnapshot: evidence.canonicalPayload, freshness: { status, evaluatedAt, lastSuccessfulAt, coverageComplete }, availableEvidenceRefs: refs, profileEvidenceRef: refs[0], freshnessEvidenceRef: refs[2] }).userPrompt);
      const payload = envelope.outputTemplate;
      payload.summary = { text: mode === "goal" ? "核心目标：成为全球第一，当前阶段目标：正式上线。" : "核心目标未确认", evidenceRefs: [mode === "goal" ? refs[1] : refs[0]] };
      payload.completedChanges = [{ id: "recorded-commit", text: '仓库记录（github_commit，摘录）："A recorded change"。该记录不代表用户确认项目背景。', evidenceRefs: [refs[1]] }];
      if (mode === "status") payload.ongoingWork = [{ id: "invented-status", text: "项目正式状态已确认为 in_development。", evidenceRefs: [refs[1]] }];
      payload.evidenceRefs = refs;
      const unsafe = parseProjectBrief(payload);
      const reservations = new SupabaseEnergyReservationClient(client);
      const persistence = new SupabaseProjectBriefGenerationPersistence({ trustedRpc: createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }), authenticatedRpc: client, actorUserId: identity.userId });
      // Deliberately seed an old, previously accepted v3 row via the real RPC.
      // No production validator is replaced; all following reads use real RLS.
      const requestKey = `t051-old-${randomUUID()}`;
      fixtureEvent("t051_old_v3_registered", { userId: identity.userId, projectId, requestKey, mode, generatedIds: ["reservation", "brief", "invocation"], expected: "all_read_paths_reject" });
      const reservation = await reservations.reserve({ projectId, requestKey });
      const old = await persistence.finalize({ reservationId: reservation.reservationId, rangeStart, rangeEnd, promptVersion: unsafe.promptVersion, schemaVersion: unsafe.schemaVersion, evidenceFingerprint: unsafe.evidenceFingerprint, cacheEquivalenceFingerprint: evidence.cacheEquivalenceFingerprint, brief: unsafe, expiresAt, metadata: createStructuredGenerationMetadata({ provider: "synthetic", model: "old-v3-regression" }) });
      fixtureEvent("t051_old_v3_observed", { userId: identity.userId, projectId, reservationId: reservation.reservationId, briefId: old.briefId, invocationId: old.invocationId });
      const receipts = new SupabaseProjectBriefHistoricalReceiptReader(client);
      const validator = new ValidateProjectBriefEvidenceUseCase({ fingerprint });
      const storedValidator = new ValidateStoredProjectBriefEvidenceUseCase({ sourceReader: sources, receiptReader: receipts, freshnessReceiptReader: receipts });
      const reader = new SupabaseProjectBriefReader(client);
      const load = (id: string) => new LoadValidatedProjectBriefUseCase({ reader: { listForProject: async idOfProject => (await reader.listForProject(idOfProject)).filter(row => row.id === id) }, evidenceBuilder: builder, evidenceValidator: validator, storedEvidenceValidator: storedValidator }).execute({ actorUserId: identity.userId, projectId, now });
      await expect(load(old.briefId)).rejects.toMatchObject({ code: "brief_evidence_validation_failed" });
      let providerCalls = 0;
      const provider: AIProvider = { async generateStructured<T>(request: StructuredGenerationRequest) {
        providerCalls += 1;
        const data = JSON.parse(request.userPrompt), output = data.outputTemplate;
        const coreGoal = data.untrustedRepositoryData.content.projectProfile.coreGoal;
        output.summary.text = coreGoal === null ? "核心目标未确认" : `核心目标：${coreGoal}`;
        const record = data.untrustedRepositoryData.availableSourceRecords.find((item: { evidenceRefs: ProjectBriefEvidenceRef[] }) => item.evidenceRefs[0].sourceKind === "github_commit");
        output.completedChanges = [{ id: "recorded-commit", ...record }];
        output.evidenceRefs.push(...record.evidenceRefs);
        return completedStructuredGeneration(output as T, { provider: "synthetic", model: "t051-safe-source" });
      } };
      const generator = new GenerateProjectBriefUseCase({ authorization: new SupabaseProjectBriefAuthorizationGate(client), evidenceBuilder: builder, cache: new SupabaseProjectBriefCache(client), energyReservations: reservations, provider, evidenceValidator: validator, persistence });
      const generate = async (label: string) => {
        const requestKey = `t051-${label}-${randomUUID()}`;
        fixtureEvent("t051_generation_request_registered", { userId: identity.userId, projectId, requestKey, generatedIds: ["reservation", "brief", "invocation"] });
        const result = await generator.execute({ userId: identity.userId, projectId, rangeStart, rangeEnd, now, requestKey });
        fixtureEvent("t051_generation_result_observed", { userId: identity.userId, projectId, status: result.status, briefId: result.briefId, invocationId: result.invocationId });
        return result;
      };
      const safe = await generate("rebuild");
      expect(safe.status).toBe("generated"); expect(providerCalls).toBe(1);
      expect(safe.briefId).not.toBe(old.briefId);
      expect(safe.brief.completedChanges[0].text).toBe('仓库记录（github_commit，摘录）："A recorded change"。该记录不代表用户确认项目背景。');
      expect(await generate("cache-hit")).toMatchObject({ status: "cache_hit", briefId: safe.briefId, energyCharged: 0 });
      expect(providerCalls).toBe(1);
      expect(await load(safe.briefId)).toMatchObject({ evidenceValidationSource: "live_snapshot", brief: safe.brief });
      await writer.patch({ userId: identity.userId, projectId, changes: { coreGoal: "后来确认的目标", currentStageGoal: "后来确认的阶段", status: "in_planning" } });
      await expect(load(old.briefId)).rejects.toMatchObject({ code: "brief_evidence_validation_failed" });
      expect(await load(safe.briefId)).toMatchObject({ evidenceValidationSource: "generation_receipt", brief: safe.brief });
      const confirmed = await generate("confirmed");
      expect(confirmed.brief.summary.text).toBe("核心目标：后来确认的目标");
      await writer.patch({ userId: identity.userId, projectId, changes: { coreGoal: "修改后的目标", currentStageGoal: null, status: null } });
      expect(await load(confirmed.briefId)).toMatchObject({ evidenceValidationSource: "generation_receipt", brief: confirmed.brief });
      await writer.patch({ userId: identity.userId, projectId, changes: { coreGoal: null } });
      expect(await load(confirmed.briefId)).toMatchObject({ evidenceValidationSource: "generation_receipt", brief: confirmed.brief });
      const hash = (brief: ProjectBrief) => createHash("sha256").update(canonicalizeEvidenceValue(brief)).digest("hex");
      expect(hash(parseProjectBrief((await reader.listForProject(projectId)).find(row => row.id === old.briefId)!.payload))).toBe(hash(unsafe));
      fixtureEvent("t051_real_provenance_pass", { userId: identity.userId, projectId, mode, oldBriefId: old.briefId, safeBriefId: safe.briefId, confirmedBriefId: confirmed.briefId, unsafePayloadSha: hash(unsafe), unsafePayloadUnchanged: true, cacheBypasses: 0, receiptBypasses: 0, providerCalls, activityRetained: true });
    } finally {
      try {
        workspaceSql(`BEGIN; SET LOCAL app.account_deletion_internal='on'; DELETE FROM public.energy_ledger_entries WHERE user_id='${identity.userId}'; DELETE FROM public.ai_invocations WHERE user_id='${identity.userId}'; DELETE FROM public.project_briefs WHERE user_id='${identity.userId}'; DELETE FROM public.energy_reservations WHERE user_id='${identity.userId}'; COMMIT;`);
        await identity.cleanup();
      } finally { vi.unstubAllGlobals(); }
    }
  }, 240_000);
});
