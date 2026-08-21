import { z } from "zod";

export const projectBriefStagingSmokeContractVersion =
  "project-brief-staging-smoke.v1" as const;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const commit = z.string().regex(/^[0-9a-f]{40}$/);
const preflightSchema = z.object({
  contractVersion: z.literal(projectBriefStagingSmokeContractVersion),
  environment: z.literal("staging"),
  deploymentTarget: z.literal("preview"),
  stagingProjectId: z.string().trim().min(1).max(255),
  productionProjectId: z.string().trim().min(1).max(255),
  implementationCommit: commit,
  deployedCommit: commit,
  rollbackCommit: commit,
  testUserIdHash: sha256,
  testProjectIdHash: sha256,
  deepSeekSecretConfigured: z.boolean(),
  costBoundary: z.literal("existing_free_or_configured_allowance"),
  stableArtifactReplaySupported: z.boolean(),
  localGatesPassed: z.boolean(),
  phase9DatasetFingerprint: z.literal(
    "83b64904bb184ba35bc9cb965de5560202794adfe41df4974cb6091a05028fdb",
  ),
  phase9ResultFingerprint: z.literal(
    "9db13d98a88f4f33752885afa13c589a52f5364f725c334030f332e2bee0bb70",
  ),
}).strict();

export type ProjectBriefStagingPreflight = z.infer<typeof preflightSchema>;

export function evaluateProjectBriefStagingPreflight(input: unknown): {
  readonly status: "ready" | "blocked";
  readonly blockedReasons: readonly string[];
} {
  const parsed = preflightSchema.safeParse(input);
  if (!parsed.success) return { status: "blocked", blockedReasons: ["preflight_invalid"] };
  const value = parsed.data;
  const reasons: string[] = [];
  if (value.stagingProjectId === value.productionProjectId) reasons.push("staging_not_isolated");
  if (value.deployedCommit !== value.implementationCommit) {
    reasons.push("deployment_commit_mismatch");
  }
  if (value.rollbackCommit === value.implementationCommit) reasons.push("rollback_commit_invalid");
  if (!value.deepSeekSecretConfigured) reasons.push("deepseek_secret_unavailable");
  if (!value.stableArtifactReplaySupported) {
    reasons.push("stable_artifact_replay_unavailable");
  }
  if (!value.localGatesPassed) reasons.push("local_gates_incomplete");
  return { status: reasons.length === 0 ? "ready" : "blocked", blockedReasons: reasons };
}

type GenerationResult = {
  readonly status: "generated" | "cache_hit";
  readonly energyCharged: 0 | 3;
  readonly briefId: string;
  readonly invocationId: string | null;
  readonly evidenceFingerprint: string;
};

type Observation = {
  readonly terminalStatus: "completed" | "failed";
  readonly cacheStatus: "hit" | "miss" | "bypass";
  readonly quotaCharge: number;
  readonly providerAttempted: boolean;
  readonly evidenceFingerprint: string;
  readonly failureStage: string | null;
};

export class ProjectBriefStagingSmokeRunner {
  constructor(private readonly dependencies: {
    readonly generate: (request: Readonly<Record<string, string>>) => Promise<GenerationResult>;
    readonly readObservation: (invocationId: string) => Promise<Observation>;
  }) {}

  async execute(input: {
    readonly preflight: unknown;
    readonly request: Readonly<Record<string, string>>;
  }) {
    const gate = evaluateProjectBriefStagingPreflight(input.preflight);
    if (gate.status !== "ready") throw new Error("project_brief_staging_smoke_preflight_blocked");

    const cold = await this.dependencies.generate(input.request);
    if (cold.status !== "generated" || cold.energyCharged !== 3 || cold.invocationId === null) {
      throw new Error("project_brief_staging_smoke_cold_invalid");
    }
    const observation = await this.dependencies.readObservation(cold.invocationId);
    if (
      observation.terminalStatus !== "completed"
      || observation.cacheStatus !== "miss"
      || observation.quotaCharge !== 3
      || !observation.providerAttempted
      || observation.failureStage !== null
      || observation.evidenceFingerprint !== cold.evidenceFingerprint
    ) throw new Error("project_brief_staging_smoke_observation_invalid");

    const replay = await this.dependencies.generate(input.request);
    if (
      replay.status !== "cache_hit"
      || replay.energyCharged !== 0
      || replay.invocationId !== null
      || replay.briefId !== cold.briefId
      || replay.evidenceFingerprint !== cold.evidenceFingerprint
    ) throw new Error("project_brief_staging_smoke_cache_replay_invalid");

    return {
      contractVersion: projectBriefStagingSmokeContractVersion,
      status: "passed" as const,
      implementationCommit: (input.preflight as ProjectBriefStagingPreflight).implementationCommit,
      providerSuccessfulCalls: 1 as const,
      cold: { briefId: cold.briefId, energyCharged: 3 as const, cacheStatus: "miss" as const },
      replay: { briefId: replay.briefId, energyCharged: 0 as const, cacheStatus: "hit" as const },
    };
  }
}
