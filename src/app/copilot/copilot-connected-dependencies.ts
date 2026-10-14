import "server-only";

import { cookies } from "next/headers";

import { BuildProjectBriefEvidenceSnapshotUseCase } from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
import { ValidateStoredProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-stored-project-brief-evidence";
import {
  LoadValidatedProjectBriefUseCase,
  ProjectBriefDisplayError,
} from "@/application/project-brief/load-validated-project-brief";
import {
  evidenceReferenceId,
  type CopilotWorkspaceConnectedPort,
} from "@/features/copilot";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { ExistingProjectFreshnessEvidenceReader } from "@/infrastructure/project-brief-evidence/existing-project-freshness-evidence-reader";
import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";
import { SupabaseProjectBriefEvidenceReader } from "@/infrastructure/project-brief-evidence/supabase-project-brief-evidence-reader";
import { SupabaseProjectBriefReader } from "@/infrastructure/project-brief/supabase-project-brief-reader";
import { SupabaseProjectBriefHistoricalReceiptReader } from "@/infrastructure/project-brief/supabase-project-brief-historical-receipt-reader";
import { SupabaseProjectFreshnessReader } from "@/infrastructure/synchronization/supabase-project-freshness-reader";
import type { CopilotEvidenceViewModel } from "@/features/copilot/copilot-project-brief-view-model";
import type { ProjectBriefRecord } from "@/domain/project-brief/project-brief";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function createCopilotConnectedPort(
  projectId: string | null,
  briefId?: string,
): Promise<CopilotWorkspaceConnectedPort> {
  if (briefId !== undefined && !uuidPattern.test(briefId)) throw new Error("invalid_brief_id");
  const responseHeaders = new Headers();
  const sessionClient = createSupabaseServerClient({
    environment: {
      APP_ORIGIN: process.env.APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookieStore: await cookies(),
    responseHeaders,
  });
  const session = new SupabaseVerifiedSessionReader(sessionClient);
  const fingerprint = new NodeProjectBriefEvidenceFingerprint();
  const sourceReader = new SupabaseProjectBriefEvidenceReader(
    sessionClient as ConstructorParameters<typeof SupabaseProjectBriefEvidenceReader>[0],
  );
  const historicalReceiptReader = new SupabaseProjectBriefHistoricalReceiptReader(
    sessionClient as ConstructorParameters<typeof SupabaseProjectBriefHistoricalReceiptReader>[0],
  );
  const briefReader = new SupabaseProjectBriefReader(
      sessionClient as ConstructorParameters<typeof SupabaseProjectBriefReader>[0],
    );
  let rows: readonly ProjectBriefRecord[] = [];
  const loader = new LoadValidatedProjectBriefUseCase({
    reader: { async listForProject(id) {
      rows = await briefReader.listForProject(id);
      return briefId === undefined ? rows : rows.filter(row => row.id === briefId);
    } },
    evidenceBuilder: new BuildProjectBriefEvidenceSnapshotUseCase({
      sourceReader,
      freshnessReader: new ExistingProjectFreshnessEvidenceReader(
        new SupabaseProjectFreshnessReader(
          sessionClient as ConstructorParameters<typeof SupabaseProjectFreshnessReader>[0],
        ),
      ),
      fingerprint,
    }),
    evidenceValidator: new ValidateProjectBriefEvidenceUseCase({ fingerprint }),
    storedEvidenceValidator: new ValidateStoredProjectBriefEvidenceUseCase({
      receiptReader: historicalReceiptReader,
      sourceReader,
      freshnessReceiptReader: historicalReceiptReader,
    }),
  });

  return {
    async load() {
      const actorUserId = await session.getVerifiedUserId();
      if (!actorUserId) throw new Error("unauthenticated");
      const energy = await sessionClient.rpc("get_available_energy", { p_business_date: new Date().toISOString().slice(0, 10) });
      const availableEnergy = !energy.error && typeof energy.data === "number" && Number.isFinite(energy.data) ? energy.data : null;
      if (projectId === null || !uuidPattern.test(projectId)) {
        return {
          provenanceLabel: "Connected 数据 · 当前会话",
          availableEnergy,
          context: { featureId: "copilot", projectId, evidenceReferenceIds: [] },
          lastTransitionReason: "initialized",
          projectBrief: { status: "not_found" },
          followUp: { status: "unavailable", message: "请先选择当前项目。" },
        };
      }
      try {
        const loaded = await loader.execute({
          actorUserId,
          projectId,
          now: new Date().toISOString(),
        });
        const data = await sourceReader.read({ userId: actorUserId, projectId });
        if (!data || data.authorizationStatus !== "active") throw new Error("source_unavailable");
        const repositoryResult = await sessionClient.from("projects")
          .select("selected_repositories!inner(owner_login,name)").eq("id", projectId).eq("user_id", actorUserId).maybeSingle();
        const repository = repositoryResult.data?.selected_repositories;
        const safeSegment = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
        const root = !repositoryResult.error && repository && safeSegment(repository.owner_login) && safeSegment(repository.name)
          ? `https://github.com/${encodeURIComponent(repository.owner_login)}/${encodeURIComponent(repository.name)}` : null;
        const evidenceDetails: CopilotEvidenceViewModel[] = loaded.brief.evidenceRefs.filter(ref => ref.projectId === projectId).map(ref => {
          const activity = data.githubActivities.find(item => item.sourceKind === ref.sourceKind && item.sourceId === ref.sourceId);
          const document = data.authorizedDocuments.find(item => ref.sourceKind === "github_document" && item.sourceId === ref.sourceId);
          const decision = data.confirmedDecisions.find(item => ref.sourceKind === "confirmed_decision" && item.sourceId === ref.sourceId);
          let originalHref: string | null = null;
          if (root && activity) {
            if (ref.sourceKind === "github_commit" && /^[0-9a-f]{7,64}$/i.test(ref.sourceId)) originalHref = `${root}/commit/${ref.sourceId}`;
            if (ref.sourceKind === "github_issue" && Number.isSafeInteger(activity.facts.issueNumber)) originalHref = `${root}/issues/${activity.facts.issueNumber}`;
            if (ref.sourceKind === "github_pull_request" && Number.isSafeInteger(activity.facts.pullRequestNumber)) originalHref = `${root}/pull/${activity.facts.pullRequestNumber}`;
            if (ref.sourceKind === "github_release" && typeof activity.facts.tagName === "string") originalHref = `${root}/releases/tag/${encodeURIComponent(activity.facts.tagName)}`;
            if (ref.sourceKind === "github_workflow_run" && /^\d+$/.test(ref.sourceId)) originalHref = `${root}/actions/runs/${ref.sourceId}`;
          }
          if (root && document?.authorized && !document.path.split('/').some(part => part === '..' || part === '.')) originalHref = `${root}/blob/HEAD/${document.path.split('/').map(encodeURIComponent).join('/')}`;
          return { referenceId: evidenceReferenceId(ref), ...ref, href: null,
            summary: activity?.summary ?? document?.path ?? decision?.decision ?? (ref.sourceKind === "project_profile" ? "项目背景" : "同步新鲜度"),
            occurredAt: activity?.occurredAt ?? decision?.confirmedAt ?? document?.sourceUpdatedAt ?? data.projectProfile?.sourceUpdatedAt ?? null,
            relationship: "当前简报已验证的依据；关联到摘要、状态或简报条目。", originalHref };
        });
        return {
          provenanceLabel: "Connected 数据 · 已重新验证",
          availableEnergy,
          context: {
            featureId: "copilot",
            projectId,
            evidenceReferenceIds: loaded.brief.evidenceRefs.map(evidenceReferenceId),
          },
          lastTransitionReason: "initialized",
          projectBrief: {
            status: "ready",
            briefId: loaded.briefId,
            brief: loaded.brief,
            generatedAt: rows.find(row => row.id === loaded.briefId)?.completedAt ?? undefined,
            evidenceDetails,
          },
          followUp: {
            status: "unavailable",
            message: "Connected 追问尚无已批准的计费与持久化合同。",
          },
        };
      } catch (error) {
        const status = error instanceof ProjectBriefDisplayError
          ? ({
              brief_not_found: "not_found",
              brief_expired: "expired",
              brief_invalid: "invalid",
              brief_evidence_validation_failed: "evidence_validation_failed",
              brief_unavailable: "unavailable",
            } as const)[error.code]
          : "unavailable";
        return {
          provenanceLabel: "Connected 数据 · 当前会话",
          availableEnergy,
          context: { featureId: "copilot", projectId, evidenceReferenceIds: [] },
          lastTransitionReason: "initialized",
          projectBrief: { status },
          followUp: { status: "unavailable", message: "当前 Brief 不可追问。" },
        };
      }
    },
  };
}
