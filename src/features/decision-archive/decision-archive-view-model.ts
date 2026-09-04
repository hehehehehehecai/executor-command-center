import type { PanelMode } from "@/shared/panel-query";

export type DecisionCandidateStatus = "pending" | "confirmed";
export type DecisionRecordStatus = "active" | "revisit_due" | "superseded";
export type DecisionRecordCreation = "manual" | "candidate_confirmation";
export type DecisionReferenceKind =
  | "commit"
  | "pull_request"
  | "issue"
  | "document";

export interface DecisionReference {
  readonly id: string;
  readonly kind: DecisionReferenceKind;
  readonly label: string;
  readonly originalUrl: string | null;
}

export interface DecisionCandidate {
  readonly id: string;
  readonly proposedDecision: string;
  readonly rationale: string;
  readonly alternatives: readonly string[];
  readonly references: readonly DecisionReference[];
  readonly unknowns: string;
  readonly sourceLabel: string;
  readonly generatedAt: string;
  readonly status: DecisionCandidateStatus;
  readonly confirmedRecordId: string | null;
  readonly revisitCondition: string | null;
}

export interface DecisionRecord {
  readonly id: string;
  readonly decision: string;
  readonly confirmationReason: string;
  readonly alternatives: readonly string[];
  readonly references: readonly DecisionReference[];
  readonly status: DecisionRecordStatus;
  readonly revisitCondition: string | null;
  readonly createdVia: DecisionRecordCreation;
  readonly confirmedBy: string;
  readonly confirmedAt: string;
  readonly sourceCandidateId: string | null;
}

export interface DecisionArchiveSource {
  readonly provenanceLabel: string;
  readonly candidates: readonly DecisionCandidate[];
  readonly records: readonly DecisionRecord[];
}

export interface DecisionArchiveViewModel {
  readonly mode: PanelMode;
  readonly provenanceLabel: string;
  readonly candidates: readonly DecisionCandidate[];
  readonly records: readonly DecisionRecord[];
}

function safeHttpsUrl(value: string | null) {
  if (value === null) return null;

  try {
    const parsed = new URL(value);

    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function safeReferences(references: readonly DecisionReference[]) {
  return references.map((reference) => ({
    ...reference,
    originalUrl: safeHttpsUrl(reference.originalUrl),
  }));
}

function byStableId<T extends { readonly id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

export function createDecisionArchiveViewModel(
  source: DecisionArchiveSource,
  mode: PanelMode,
): DecisionArchiveViewModel {
  return {
    mode,
    provenanceLabel: source.provenanceLabel,
    candidates: source.candidates
      .map((candidate) => ({
        ...candidate,
        alternatives: [...candidate.alternatives],
        references: safeReferences(candidate.references),
      }))
      .sort(byStableId),
    records: source.records
      .map((record) => ({
        ...record,
        alternatives: [...record.alternatives],
        references: safeReferences(record.references),
      }))
      .sort(byStableId),
  };
}
