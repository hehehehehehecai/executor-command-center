import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contextFixture, type ContextFixture } from "./project-context-fixture";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";
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
import { BuildProjectBriefEvidenceSnapshotUseCase, type ProjectBriefEvidenceArtifact } from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
import { ValidateStoredProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-stored-project-brief-evidence";
import { LoadValidatedProjectBriefUseCase } from "@/application/project-brief/load-validated-project-brief";
import { canonicalizeEvidenceSnapshot, canonicalizeEvidenceValue } from "@/domain/project-brief-evidence/canonicalization";
import { projectBriefBoundaryNote, type ProjectBrief, type ProjectBriefEvidenceRef } from "@/domain/project-brief/project-brief-contract";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { createStructuredGenerationMetadata } from "@/shared/ai/structured-generation-result";

describe("T05 旧简报真实持久化、只读历史与缓存版本隔离", () => {
  let configuration: ReturnType<typeof workspaceConfiguration>;
  let a: ContextFixture, b: ContextFixture;
  let projectId: string;
  const authenticatedClient = () => {
    const jar = new Map<string, string>();
    return createSupabaseServerClient({ environment: { APP_ORIGIN: "http://127.0.0.1:3000", NEXT_PUBLIC_SUPABASE_URL: configuration.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: configuration.anonKey }, cookieStore: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name, value) => { if (value) jar.set(name, value); else jar.delete(name); } }, responseHeaders: new Headers() });
  };
  let client: ReturnType<typeof authenticatedClient>;
  let writer: SupabaseProjectContextWriter;
  let builder: BuildProjectBriefEvidenceSnapshotUseCase;
  const fingerprint = new NodeProjectBriefEvidenceFingerprint();
  const validator = new ValidateProjectBriefEvidenceUseCase({ fingerprint });
  let legacyArtifact: ProjectBriefEvidenceArtifact;
  const stored: { briefId: string; brief: ProjectBrief; payloadSha: string }[] = [];
  const now = new Date().toISOString();
  const rangeStart = new Date(Date.parse(now) - 3_600_000).toISOString();
  const rangeEnd = new Date(Date.parse(now) - 60_000).toISOString();
  const finishedAt = new Date(Date.parse(now) - 300_000).toISOString();
  const expiresAt = new Date(Date.parse(now) + 86_400_000).toISOString();
  const realFetch = globalThis.fetch;
  async function login(identity: ContextFixture) {
    client = authenticatedClient();
    const result = await client.auth.signInWithPassword({ email: identity.email, password: identity.password });
    if (result.error || result.data.user?.id !== identity.userId) throw new Error("t05_history_login_failed");
    return client;
  }
  function loader(briefId: string) {
    const reader = new SupabaseProjectBriefReader(client);
    const sourceReader = new SupabaseProjectBriefEvidenceReader(client as ConstructorParameters<typeof SupabaseProjectBriefEvidenceReader>[0]);
    const receipts = new SupabaseProjectBriefHistoricalReceiptReader(client);
    return new LoadValidatedProjectBriefUseCase({
      // Read actual RLS rows, then select one historical version for this assertion.
      reader: { listForProject: async id => (await reader.listForProject(id)).filter(row => row.id === briefId) },
      evidenceBuilder: builder, evidenceValidator: validator,
      storedEvidenceValidator: new ValidateStoredProjectBriefEvidenceUseCase({ sourceReader, receiptReader: receipts, freshnessReceiptReader: receipts }),
    });
  }
  const key = (brief: ProjectBrief) => ({ userId: a.userId, projectId, rangeStart, rangeEnd, promptVersion: brief.promptVersion, schemaVersion: brief.schemaVersion, evidenceFingerprint: brief.evidenceFingerprint, cacheEquivalenceFingerprint: legacyArtifact.cacheEquivalenceFingerprint, now });
  beforeAll(async () => {
    configuration = workspaceConfiguration();
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(configuration.apiUrl).origin) throw new Error("t05_history_external_network_forbidden");
      verifyIsolatedDatabase(); return realFetch(input, init);
    });
    a = contextFixture(configuration, "t05-history-A"); b = contextFixture(configuration, "t05-history-B");
    await a.seed(); await b.seed();
    writer = new SupabaseProjectContextWriter({ supabaseUrl: configuration.apiUrl, serviceRoleKey: configuration.serviceRoleKey });
    projectId = (await writer.create({ userId: a.userId, selectedRepositoryId: a.selectedRepositoryId })).id; a.observe(projectId);
    await writer.patch({ userId: a.userId, projectId, changes: { coreGoal: "历史已确认目标", currentStageGoal: "历史已确认阶段", status: "in_development" } });
    const syncRunId = randomUUID();
    fixtureEvent("t05_history_sync_registered", { userId: a.userId, projectId, syncRunId });
    workspaceSql(`INSERT INTO public.sync_runs(id,project_id,idempotency_key,trigger_source,status,queued_at,started_at,finished_at,created_at,updated_at) VALUES ('${syncRunId}','${projectId}','t05-history-${syncRunId}','reconciliation','completed','${rangeStart}','${rangeStart}','${finishedAt}','${rangeStart}','${finishedAt}');`);
    await login(a);
    builder = new BuildProjectBriefEvidenceSnapshotUseCase({ sourceReader: new SupabaseProjectBriefEvidenceReader(client), freshnessReader: new ExistingProjectFreshnessEvidenceReader(new SupabaseProjectFreshnessReader(client)), fingerprint });
    const current = await builder.execute({ userId: a.userId, projectId, rangeStart, rangeEnd, now });
    const snapshot = { ...current.snapshot, snapshotContractVersion: "project-brief-evidence-snapshot.v1" as const, fingerprintContractVersion: "project-brief-evidence-fingerprint.v1" as const };
    const canonicalPayload = canonicalizeEvidenceSnapshot(snapshot);
    legacyArtifact = { ...current, snapshot, canonicalPayload, fingerprint: await fingerprint.sha256Utf8(canonicalPayload) };
  }, 180_000);
  afterAll(async () => {
    const errors: unknown[] = [];
    for (const identity of [a, b]) {
      if (!identity) continue;
      try {
        workspaceSql(`BEGIN; SET LOCAL app.account_deletion_internal='on'; DELETE FROM public.energy_ledger_entries WHERE user_id='${identity.userId}'; DELETE FROM public.ai_invocations WHERE user_id='${identity.userId}'; DELETE FROM public.project_briefs WHERE user_id='${identity.userId}'; DELETE FROM public.energy_reservations WHERE user_id='${identity.userId}'; COMMIT;`);
        await identity.cleanup();
      } catch (error) { errors.push(error); }
    }
    vi.unstubAllGlobals();
    if (errors.length) throw new AggregateError(errors, "t05_history_cleanup_failed");
  }, 180_000);

  it.each(["project-brief-v1", "project-brief-v2"] as const)("%s 严格旧版本经真实 RPC 持久化，不能充当新缓存", async promptVersion => {
    const profileRef: ProjectBriefEvidenceRef = { contractVersion: "project-brief-evidence-source-ref.v1", sourceKind: "project_profile", sourceId: projectId, projectId };
    const freshnessRef: ProjectBriefEvidenceRef = { ...profileRef, sourceKind: "freshness", sourceId: legacyArtifact.snapshot.freshness.sourceRef.sourceId };
    const brief = parseProjectBrief({ promptVersion, schemaVersion: "project-brief-schema-v1", projectId, evidenceFingerprint: legacyArtifact.fingerprint, rangeStart, rangeEnd, officialStatus: { value: "in_development", evidenceRefs: [profileRef] }, summary: { text: "历史已确认目标", evidenceRefs: [profileRef] }, completedChanges: [], ongoingWork: [], openItems: [], riskSignals: [], unknowns: [], evidenceRefs: [profileRef, freshnessRef], freshness: { status: legacyArtifact.snapshot.freshness.status, evaluatedAt: now, lastSuccessfulAt: finishedAt, coverageComplete: true, evidenceRefs: [freshnessRef] }, boundaryNote: projectBriefBoundaryNote });
    expect(() => parseProjectBrief({ ...brief, officialStatus: { ...brief.officialStatus, value: null } })).toThrow();
    await expect(validator.execute({ actorUserId: a.userId, projectId, brief, artifact: legacyArtifact })).resolves.toMatchObject({ status: "valid" });
    const requestKey = `t05-legacy-${randomUUID()}`;
    fixtureEvent("t05_history_generation_registered", { userId: a.userId, projectId, requestKey, promptVersion, generatedIds: ["reservation", "brief", "invocation"] });
    const reservation = await new SupabaseEnergyReservationClient(client).reserve({ projectId, requestKey });
    const persistence = new SupabaseProjectBriefGenerationPersistence({ trustedRpc: createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }), authenticatedRpc: client, actorUserId: a.userId });
    const result = await persistence.finalize({ reservationId: reservation.reservationId, rangeStart, rangeEnd, promptVersion, schemaVersion: brief.schemaVersion, evidenceFingerprint: brief.evidenceFingerprint, cacheEquivalenceFingerprint: legacyArtifact.cacheEquivalenceFingerprint, brief, expiresAt, metadata: createStructuredGenerationMetadata({ provider: "synthetic", model: "legacy-fixture", requestId: requestKey, inputTokens: 10, outputTokens: 10, latencyMs: 1 }) });
    const payloadSha = createHash("sha256").update(canonicalizeEvidenceValue(brief)).digest("hex");
    stored.push({ briefId: result.briefId, brief, payloadSha });
    fixtureEvent("t05_history_generation_observed", { userId: a.userId, projectId, promptVersion, reservationId: reservation.reservationId, briefId: result.briefId, invocationId: result.invocationId, payloadSha });
    const cache = new SupabaseProjectBriefCache(client);
    expect(await cache.find(key(brief))).toMatchObject({ id: result.briefId, payload: brief, payloadFingerprint: payloadSha });
    expect(await cache.find({ ...key(brief), promptVersion: "project-brief-v3", schemaVersion: "project-brief-schema-v2" })).toBeNull();
    expect(await cache.find({ ...key(brief), now: new Date(Date.parse(expiresAt) + 1).toISOString() })).toBeNull();
  }, 180_000);

  it("背景后来清空仍从真实 receipt 读取 v1/v2，旧 payload 字节摘要不变", async () => {
    expect(stored).toHaveLength(2);
    await writer.patch({ userId: a.userId, projectId, changes: { coreGoal: null, currentStageGoal: null, status: null } });
    for (const row of stored) {
      expect(await loader(row.briefId).execute({ actorUserId: a.userId, projectId, now: new Date().toISOString() })).toMatchObject({ evidenceValidationSource: "generation_receipt", brief: row.brief });
      const actual = (await new SupabaseProjectBriefReader(client).listForProject(projectId)).find(item => item.id === row.briefId);
      expect(createHash("sha256").update(canonicalizeEvidenceValue(actual!.payload)).digest("hex")).toBe(row.payloadSha);
      await expect(loader(row.briefId).execute({ actorUserId: a.userId, projectId, now: new Date(Date.parse(expiresAt) + 1).toISOString() })).rejects.toMatchObject({ code: "brief_expired" });
    }
    fixtureEvent("t05_history_readonly_pass", { userId: a.userId, projectId, historical: stored.map(row => ({ briefId: row.briefId, promptVersion: row.brief.promptVersion, payloadSha: row.payloadSha })), payloadsUnchanged: true, validationSource: "generation_receipt" });
  }, 180_000);

  it("其他账号、暂停和撤权不能把旧缓存变成可见简报", async () => {
    await login(b);
    expect(await new SupabaseProjectBriefReader(client).listForProject(projectId)).toEqual([]);
    for (const row of stored) expect(await new SupabaseProjectBriefCache(client).find(key(row.brief))).toBeNull();
    await login(a);
    for (const status of ["suspended", "revoked"] as const) {
      workspaceSql(`UPDATE public.github_installations SET status='${status}',${status === "suspended" ? "suspended_at" : "revoked_at"}=now() WHERE id='${a.installationId}' AND user_id='${a.userId}';`);
      await expect(new SupabaseProjectBriefAuthorizationGate(client).assertActive({ actorUserId: a.userId, projectId })).rejects.toThrow("project_brief_authorization_failed");
      for (const row of stored) await expect(loader(row.briefId).execute({ actorUserId: a.userId, projectId, now: new Date().toISOString() })).rejects.toMatchObject({ code: "brief_evidence_validation_failed" });
    }
    fixtureEvent("t05_history_access_denied", { ownerUserId: a.userId, otherUserId: b.userId, projectId, suspendedDenied: true, revokedDenied: true, foreignCacheMiss: true });
  }, 180_000);
});
