import "server-only";

import type { ProjectBriefEvidenceFreshnessReader } from "@/application/project-brief-evidence/project-brief-evidence-ports";
import type { RawFreshnessSource } from "@/domain/project-brief-evidence/evidence-snapshot";
import { freshnessStatusContract } from "@/domain/synchronization/synchronization-state";
import type {
  ProjectFreshnessView,
} from "@/infrastructure/synchronization/supabase-project-freshness-reader";

type ExistingFreshnessReader = {
  read(input: {
    readonly userId: string;
    readonly projectId: string | null;
    readonly now: string;
  }): Promise<ProjectFreshnessView | null>;
};

export class ExistingProjectFreshnessEvidenceReader
implements ProjectBriefEvidenceFreshnessReader {
  constructor(private readonly reader: ExistingFreshnessReader) {}

  async read(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly now: string;
  }): Promise<RawFreshnessSource | null> {
    const view = await this.reader.read(input);
    if (view === null || view.projectId !== input.projectId) return null;

    return {
      userId: input.userId,
      projectId: input.projectId,
      sourceId: view.input.latestRun?.id ?? `freshness:${input.projectId}`,
      sourceUpdatedAt:
        view.input.latestRun?.finishedAt
        ?? view.input.lastSuccessfulAt
        ?? input.now,
      sourceVersion: freshnessStatusContract,
      input: { ...view.input, now: input.now },
    };
  }
}
