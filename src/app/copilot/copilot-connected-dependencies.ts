import "server-only";

import { cookies } from "next/headers";

import { BuildProjectBriefEvidenceSnapshotUseCase } from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
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
import { SupabaseProjectFreshnessReader } from "@/infrastructure/synchronization/supabase-project-freshness-reader";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function createCopilotConnectedPort(
  projectId: string | null,
): Promise<CopilotWorkspaceConnectedPort> {
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
  const loader = new LoadValidatedProjectBriefUseCase({
    reader: new SupabaseProjectBriefReader(
      sessionClient as ConstructorParameters<typeof SupabaseProjectBriefReader>[0],
    ),
    evidenceBuilder: new BuildProjectBriefEvidenceSnapshotUseCase({
      sourceReader: new SupabaseProjectBriefEvidenceReader(
        sessionClient as ConstructorParameters<typeof SupabaseProjectBriefEvidenceReader>[0],
      ),
      freshnessReader: new ExistingProjectFreshnessEvidenceReader(
        new SupabaseProjectFreshnessReader(
          sessionClient as ConstructorParameters<typeof SupabaseProjectFreshnessReader>[0],
        ),
      ),
      fingerprint,
    }),
    evidenceValidator: new ValidateProjectBriefEvidenceUseCase({ fingerprint }),
  });

  return {
    async load() {
      const actorUserId = await session.getVerifiedUserId();
      if (!actorUserId) throw new Error("unauthenticated");
      if (projectId === null || !uuidPattern.test(projectId)) {
        return {
          provenanceLabel: "Connected 数据 · 当前会话",
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
        return {
          provenanceLabel: "Connected 数据 · 已重新验证",
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
          context: { featureId: "copilot", projectId, evidenceReferenceIds: [] },
          lastTransitionReason: "initialized",
          projectBrief: { status },
          followUp: { status: "unavailable", message: "当前 Brief 不可追问。" },
        };
      }
    },
  };
}
