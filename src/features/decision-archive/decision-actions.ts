import {
  createDecisionArchiveViewModel,
  type DecisionArchiveViewModel,
  type DecisionRecord,
  type DecisionReference,
} from "./decision-archive-view-model";

export interface DecisionActionContext {
  readonly recordId: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface ManualDecisionInput {
  readonly decision: string;
  readonly confirmationReason: string;
  readonly alternatives: readonly string[];
  readonly references: readonly DecisionReference[];
  readonly revisitCondition: string | null;
}

export interface ConfirmDecisionCandidateInput {
  readonly candidateId: string;
  readonly confirmationReason: string;
}

function normalizeRequired(value: string, errorCode: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    throw new Error(errorCode);
  }

  return normalized;
}

function normalizeOptional(value: string | null) {
  if (value === null) return null;

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length === 0 ? null : normalized;
}

function normalizedAlternatives(values: readonly string[]) {
  return values
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => value.length > 0);
}

function validateContext(
  viewModel: DecisionArchiveViewModel,
  context: DecisionActionContext,
) {
  const recordId = context.recordId.trim();
  const actorId = context.actorId.trim();
  const parsedTime = Date.parse(context.occurredAt);

  if (
    recordId.length === 0 ||
    actorId.length === 0 ||
    !Number.isFinite(parsedTime) ||
    new Date(parsedTime).toISOString() !== context.occurredAt
  ) {
    throw new Error("decision_action_context_invalid");
  }

  if (viewModel.records.some(({ id }) => id === recordId)) {
    throw new Error("decision_record_id_conflict");
  }

  return { recordId, actorId, occurredAt: context.occurredAt };
}

function withRecord(
  viewModel: DecisionArchiveViewModel,
  record: DecisionRecord,
  candidates = viewModel.candidates,
) {
  return createDecisionArchiveViewModel(
    {
      provenanceLabel: viewModel.provenanceLabel,
      candidates,
      records: [...viewModel.records, record],
    },
    viewModel.mode,
  );
}

export function createManualDecisionRecord(
  viewModel: DecisionArchiveViewModel,
  input: ManualDecisionInput,
  context: DecisionActionContext,
): DecisionArchiveViewModel {
  const decision = normalizeRequired(input.decision, "decision_content_required");
  const confirmationReason = normalizeRequired(
    input.confirmationReason,
    "decision_confirmation_reason_required",
  );
  const action = validateContext(viewModel, context);

  return withRecord(viewModel, {
    id: action.recordId,
    decision,
    confirmationReason,
    alternatives: normalizedAlternatives(input.alternatives),
    references: [...input.references],
    status: "active",
    revisitCondition: normalizeOptional(input.revisitCondition),
    createdVia: "manual",
    confirmedBy: action.actorId,
    confirmedAt: action.occurredAt,
    sourceCandidateId: null,
  });
}

export function confirmDecisionCandidate(
  viewModel: DecisionArchiveViewModel,
  input: ConfirmDecisionCandidateInput,
  context: DecisionActionContext,
): DecisionArchiveViewModel {
  const confirmationReason = normalizeRequired(
    input.confirmationReason,
    "decision_confirmation_reason_required",
  );
  const candidate = viewModel.candidates.find(({ id }) => id === input.candidateId);

  if (candidate === undefined) {
    throw new Error("decision_candidate_not_found");
  }

  if (
    candidate.status === "confirmed" ||
    candidate.confirmedRecordId !== null ||
    viewModel.records.some(({ sourceCandidateId }) => sourceCandidateId === candidate.id)
  ) {
    throw new Error("decision_candidate_already_confirmed");
  }

  const action = validateContext(viewModel, context);
  const updatedCandidates = viewModel.candidates.map((item) =>
    item.id === candidate.id
      ? {
          ...item,
          status: "confirmed" as const,
          confirmedRecordId: action.recordId,
        }
      : item,
  );

  return withRecord(
    viewModel,
    {
      id: action.recordId,
      decision: candidate.proposedDecision,
      confirmationReason,
      alternatives: [...candidate.alternatives],
      references: [...candidate.references],
      status: "active",
      revisitCondition: candidate.revisitCondition,
      createdVia: "candidate_confirmation",
      confirmedBy: action.actorId,
      confirmedAt: action.occurredAt,
      sourceCandidateId: candidate.id,
    },
    updatedCandidates,
  );
}
