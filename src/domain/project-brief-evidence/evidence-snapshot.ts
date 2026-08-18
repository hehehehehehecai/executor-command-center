import {
  deriveFreshnessStatus,
  freshnessStatusContract,
  type FreshnessInput,
  type FreshnessStatus,
} from "@/domain/synchronization/synchronization-state";
import { normalizeEvidenceText } from "./canonicalization";
import {
  evidenceFailure,
  projectBriefEvidenceCanonicalizationContractVersion,
  projectBriefEvidenceFingerprintContractVersion,
  projectBriefEvidenceSnapshotContractVersion,
  projectBriefEvidenceSourceRefContractVersion,
} from "./contracts";

export const evidenceSourceKinds = [
  "project_profile",
  "github_commit",
  "github_issue",
  "github_pull_request",
  "github_release",
  "github_workflow_run",
  "github_document",
  "confirmed_decision",
  "freshness",
] as const;
export type EvidenceSourceKind = (typeof evidenceSourceKinds)[number];
export type GitHubEvidenceActivityKind = Extract<
  EvidenceSourceKind,
  | "github_commit"
  | "github_issue"
  | "github_pull_request"
  | "github_release"
  | "github_workflow_run"
>;

export interface EvidenceSourceRef {
  readonly contractVersion: typeof projectBriefEvidenceSourceRefContractVersion;
  readonly sourceKind: EvidenceSourceKind;
  readonly sourceId: string;
  readonly projectId: string;
  readonly occurredAt: string | null;
  readonly sourceUpdatedAt: string | null;
  readonly sourceVersion: string | null;
  readonly sourceSha: string | null;
}

type RawOwnedSource = {
  userId: string;
  projectId: string;
};

export interface RawProjectProfileSource extends RawOwnedSource {
  sourceId: string;
  sourceUpdatedAt: string;
  sourceVersion: string;
  coreGoal: string;
  currentStageGoal: string;
  status: string;
  currentBlocker: string | null;
}

export type EvidenceFactValue = string | number | boolean | null;

export interface RawGitHubActivitySource extends RawOwnedSource {
  sourceKind: GitHubEvidenceActivityKind;
  sourceId: string;
  occurredAt: string;
  sourceUpdatedAt: string;
  sourceVersion: string;
  summary: string;
  facts: Record<string, EvidenceFactValue>;
}

export interface RawAuthorizedDocumentSource extends RawOwnedSource {
  sourceId: string;
  sourceUpdatedAt: string;
  sourceVersion: string;
  sourceSha: string;
  path: string;
  documentKind: string;
  authorized: boolean;
}

export interface RawConfirmedDecisionSource extends RawOwnedSource {
  sourceId: string;
  confirmedAt: string;
  sourceVersion: string;
  status: "candidate" | "unconfirmed" | "confirmed";
  provenance: "connected" | "preview";
  decision: string;
}

export interface RawFreshnessSource extends RawOwnedSource {
  sourceId: string;
  sourceUpdatedAt: string;
  sourceVersion: typeof freshnessStatusContract;
  input: FreshnessInput;
}

export interface ProjectBriefEvidenceSources {
  authorizationStatus: "active" | "revoked" | "suspended" | "unavailable";
  projectProfile: RawProjectProfileSource | null;
  githubActivities: RawGitHubActivitySource[];
  authorizedDocuments: RawAuthorizedDocumentSource[];
  confirmedDecisionsSourceAvailable: boolean;
  confirmedDecisions: RawConfirmedDecisionSource[];
  freshness: RawFreshnessSource | null;
}

export type ProjectBriefEvidenceSourceData = Omit<
  ProjectBriefEvidenceSources,
  "freshness"
>;

export interface ProjectBriefEvidenceProjectProfile {
  readonly sourceRef: EvidenceSourceRef;
  readonly coreGoal: string;
  readonly currentStageGoal: string;
  readonly status: string;
  readonly currentBlocker: string | null;
}

export interface ProjectBriefEvidenceActivity {
  readonly sourceRef: EvidenceSourceRef;
  readonly activityKind: GitHubEvidenceActivityKind;
  readonly summary: string;
  readonly facts: Readonly<Record<string, EvidenceFactValue>>;
}

export interface ProjectBriefEvidenceDocument {
  readonly sourceRef: EvidenceSourceRef;
  readonly path: string;
  readonly documentKind: string;
  readonly contentFingerprint: string;
}

export interface ProjectBriefEvidenceDecision {
  readonly sourceRef: EvidenceSourceRef;
  readonly decision: string;
}

export interface ProjectBriefEvidenceFreshness {
  readonly sourceRef: EvidenceSourceRef;
  readonly status: FreshnessStatus;
  readonly evaluatedAt: string;
  readonly lastSuccessfulAt: string | null;
  readonly coverageComplete: boolean;
}

export interface ProjectBriefEvidenceSnapshot {
  readonly snapshotContractVersion: typeof projectBriefEvidenceSnapshotContractVersion;
  readonly sourceRefContractVersion: typeof projectBriefEvidenceSourceRefContractVersion;
  readonly canonicalizationContractVersion: typeof projectBriefEvidenceCanonicalizationContractVersion;
  readonly fingerprintContractVersion: typeof projectBriefEvidenceFingerprintContractVersion;
  readonly freshnessContractVersion: typeof freshnessStatusContract;
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly projectProfile: ProjectBriefEvidenceProjectProfile;
  readonly githubActivities: readonly ProjectBriefEvidenceActivity[];
  readonly authorizedDocuments: readonly ProjectBriefEvidenceDocument[];
  readonly confirmedDecisions: {
    readonly sourceAvailability: "available" | "unavailable";
    readonly items: readonly ProjectBriefEvidenceDecision[];
  };
  readonly freshness: ProjectBriefEvidenceFreshness;
}

export interface EvidenceSnapshotBuildInput {
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly now: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sourceKindSet = new Set<string>(evidenceSourceKinds);
const forbiddenFactKeys = new Set([
  "apikey",
  "authorization",
  "authorizationheader",
  "diff",
  "documentbody",
  "rawpayload",
  "rawresponse",
  "secret",
  "sourcecode",
  "token",
]);

function normalizedRequired(value: string): string {
  const normalized = normalizeEvidenceText(value).trim();
  if (normalized === "") return evidenceFailure("source_invalid");
  return normalized;
}

function canonicalTime(value: string, code: "invalid_request" | "source_invalid"): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return evidenceFailure(code);
  return new Date(parsed).toISOString();
}

function sourceRef(input: {
  sourceKind: EvidenceSourceKind;
  sourceId: string;
  projectId: string;
  occurredAt: string | null;
  sourceUpdatedAt: string | null;
  sourceVersion: string | null;
  sourceSha: string | null;
}): EvidenceSourceRef {
  if (!sourceKindSet.has(input.sourceKind) || !uuidPattern.test(input.projectId)) {
    return evidenceFailure("source_invalid");
  }
  return {
    contractVersion: projectBriefEvidenceSourceRefContractVersion,
    sourceKind: input.sourceKind,
    sourceId: normalizedRequired(input.sourceId),
    projectId: input.projectId.toLowerCase(),
    occurredAt: input.occurredAt === null
      ? null
      : canonicalTime(input.occurredAt, "source_invalid"),
    sourceUpdatedAt: input.sourceUpdatedAt === null
      ? null
      : canonicalTime(input.sourceUpdatedAt, "source_invalid"),
    sourceVersion: input.sourceVersion === null
      ? null
      : normalizedRequired(input.sourceVersion),
    sourceSha: input.sourceSha === null
      ? null
      : normalizedRequired(input.sourceSha),
  };
}

export function evidenceSourceAlignmentKey(ref: EvidenceSourceRef): string {
  return JSON.stringify([ref.sourceKind, ref.sourceId, ref.projectId]);
}

function normalizeFacts(
  facts: Record<string, EvidenceFactValue>,
): Readonly<Record<string, EvidenceFactValue>> {
  const result: Record<string, EvidenceFactValue> = {};
  for (const [rawKey, rawValue] of Object.entries(facts)) {
    const key = normalizedRequired(rawKey);
    const policyKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (forbiddenFactKeys.has(policyKey) || key in result) {
      return evidenceFailure("source_invalid");
    }
    if (
      rawValue !== null
      && typeof rawValue !== "string"
      && typeof rawValue !== "number"
      && typeof rawValue !== "boolean"
    ) {
      return evidenceFailure("source_invalid");
    }
    if (typeof rawValue === "number" && !Number.isFinite(rawValue)) {
      return evidenceFailure("source_invalid");
    }
    result[key] = typeof rawValue === "string"
      ? normalizeEvidenceText(rawValue)
      : rawValue;
  }
  return result;
}

function assertUnique(refs: readonly EvidenceSourceRef[]): void {
  const keys = new Set<string>();
  for (const ref of refs) {
    const key = evidenceSourceAlignmentKey(ref);
    if (keys.has(key)) return evidenceFailure("duplicate_source_ref");
    keys.add(key);
  }
}

function sourceOwnedBy(
  source: RawOwnedSource,
  input: EvidenceSnapshotBuildInput,
): boolean {
  return source.userId === input.userId && source.projectId === input.projectId;
}

export function buildProjectBriefEvidenceSnapshot(
  input: EvidenceSnapshotBuildInput,
  sources: ProjectBriefEvidenceSources,
): ProjectBriefEvidenceSnapshot {
  if (!uuidPattern.test(input.userId) || !uuidPattern.test(input.projectId)) {
    return evidenceFailure("invalid_request");
  }
  const rangeStart = canonicalTime(input.rangeStart, "invalid_request");
  const rangeEnd = canonicalTime(input.rangeEnd, "invalid_request");
  const now = canonicalTime(input.now, "invalid_request");
  if (rangeStart >= rangeEnd) return evidenceFailure("invalid_request");

  if (sources.authorizationStatus !== "active") {
    return evidenceFailure("authorization_revoked");
  }
  const profile = sources.projectProfile;
  if (profile === null || !sourceOwnedBy(profile, input)) {
    return evidenceFailure("project_not_found_or_forbidden");
  }
  if (sources.freshness === null || !sourceOwnedBy(sources.freshness, input)) {
    return evidenceFailure("freshness_unavailable");
  }
  const freshnessStatus = deriveFreshnessStatus({
    ...sources.freshness.input,
    now,
  });
  if (freshnessStatus === "authorization_revoked") {
    return evidenceFailure("authorization_revoked");
  }

  const projectProfile: ProjectBriefEvidenceProjectProfile = {
    sourceRef: sourceRef({
      sourceKind: "project_profile",
      sourceId: profile.sourceId,
      projectId: input.projectId,
      occurredAt: null,
      sourceUpdatedAt: profile.sourceUpdatedAt,
      sourceVersion: profile.sourceVersion,
      sourceSha: null,
    }),
    coreGoal: normalizedRequired(profile.coreGoal),
    currentStageGoal: normalizedRequired(profile.currentStageGoal),
    status: normalizedRequired(profile.status),
    currentBlocker: profile.currentBlocker === null
      ? null
      : normalizedRequired(profile.currentBlocker),
  };

  const githubActivities = sources.githubActivities
    .filter((source) => sourceOwnedBy(source, input))
    .filter((source) => {
      const occurredAt = canonicalTime(source.occurredAt, "source_invalid");
      return occurredAt >= rangeStart && occurredAt < rangeEnd;
    })
    .map((source): ProjectBriefEvidenceActivity => ({
      sourceRef: sourceRef({
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        projectId: input.projectId,
        occurredAt: source.occurredAt,
        sourceUpdatedAt: source.sourceUpdatedAt,
        sourceVersion: source.sourceVersion,
        sourceSha: null,
      }),
      activityKind: source.sourceKind,
      summary: normalizedRequired(source.summary),
      facts: normalizeFacts(source.facts),
    }))
    .sort((left, right) =>
      (left.sourceRef.occurredAt ?? "").localeCompare(right.sourceRef.occurredAt ?? "")
      || left.sourceRef.sourceKind.localeCompare(right.sourceRef.sourceKind)
      || left.sourceRef.sourceId.localeCompare(right.sourceRef.sourceId));

  const authorizedDocuments = sources.authorizedDocuments
    .filter((source) => sourceOwnedBy(source, input) && source.authorized)
    .map((source): ProjectBriefEvidenceDocument => ({
      sourceRef: sourceRef({
        sourceKind: "github_document",
        sourceId: source.sourceId,
        projectId: input.projectId,
        occurredAt: null,
        sourceUpdatedAt: source.sourceUpdatedAt,
        sourceVersion: source.sourceVersion,
        sourceSha: source.sourceSha,
      }),
      path: normalizedRequired(source.path),
      documentKind: normalizedRequired(source.documentKind),
      contentFingerprint: normalizedRequired(source.sourceSha),
    }))
    .sort((left, right) => left.path.localeCompare(right.path)
      || left.sourceRef.sourceId.localeCompare(right.sourceRef.sourceId));

  const confirmedDecisionItems = (sources.confirmedDecisionsSourceAvailable
    ? sources.confirmedDecisions
    : [])
    .filter((source) => sourceOwnedBy(source, input))
    .filter((source) => source.status === "confirmed" && source.provenance === "connected")
    .filter((source) => {
      const confirmedAt = canonicalTime(source.confirmedAt, "source_invalid");
      return confirmedAt >= rangeStart && confirmedAt < rangeEnd;
    })
    .map((source): ProjectBriefEvidenceDecision => ({
      sourceRef: sourceRef({
        sourceKind: "confirmed_decision",
        sourceId: source.sourceId,
        projectId: input.projectId,
        occurredAt: source.confirmedAt,
        sourceUpdatedAt: source.confirmedAt,
        sourceVersion: source.sourceVersion,
        sourceSha: null,
      }),
      decision: normalizedRequired(source.decision),
    }))
    .sort((left, right) =>
      (left.sourceRef.occurredAt ?? "").localeCompare(right.sourceRef.occurredAt ?? "")
      || left.sourceRef.sourceId.localeCompare(right.sourceRef.sourceId));

  const freshness: ProjectBriefEvidenceFreshness = {
    sourceRef: sourceRef({
      sourceKind: "freshness",
      sourceId: sources.freshness.sourceId,
      projectId: input.projectId,
      occurredAt: now,
      sourceUpdatedAt: sources.freshness.sourceUpdatedAt,
      sourceVersion: sources.freshness.sourceVersion,
      sourceSha: null,
    }),
    status: freshnessStatus,
    evaluatedAt: now,
    lastSuccessfulAt: sources.freshness.input.lastSuccessfulAt === null
      ? null
      : canonicalTime(sources.freshness.input.lastSuccessfulAt, "source_invalid"),
    coverageComplete: sources.freshness.input.coverageComplete,
  };

  assertUnique([
    projectProfile.sourceRef,
    ...githubActivities.map(({ sourceRef: ref }) => ref),
    ...authorizedDocuments.map(({ sourceRef: ref }) => ref),
    ...confirmedDecisionItems.map(({ sourceRef: ref }) => ref),
    freshness.sourceRef,
  ]);

  return {
    snapshotContractVersion: projectBriefEvidenceSnapshotContractVersion,
    sourceRefContractVersion: projectBriefEvidenceSourceRefContractVersion,
    canonicalizationContractVersion: projectBriefEvidenceCanonicalizationContractVersion,
    fingerprintContractVersion: projectBriefEvidenceFingerprintContractVersion,
    freshnessContractVersion: freshnessStatusContract,
    userId: input.userId.toLowerCase(),
    projectId: input.projectId.toLowerCase(),
    rangeStart,
    rangeEnd,
    projectProfile,
    githubActivities,
    authorizedDocuments,
    confirmedDecisions: {
      sourceAvailability: sources.confirmedDecisionsSourceAvailable
        ? "available"
        : "unavailable",
      items: confirmedDecisionItems,
    },
    freshness,
  };
}
