import { evidenceSourceKinds } from "@/domain/project-brief-evidence/evidence-snapshot";
import { z } from "zod";

import {
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefFailureCodes,
  projectBriefFreshnessStatuses,
  projectBriefLimits,
  projectBriefItemSections,
  projectBriefOfficialStatuses,
  projectBriefSupportedPromptVersions,
  projectBriefSchemaVersion,
  type ProjectBrief,
  type ProjectBriefEvidenceRef,
  type ProjectBriefFailureCode,
  type ProjectBriefItemSection,
} from "./project-brief-contract";

const failureCodeSet = new Set<string>(projectBriefFailureCodes);
const itemIdPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const fingerprintPattern = /^[0-9a-f]{64}$/;
const lowerUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requiredText(maximum: number) {
  return z.string().min(1).max(maximum).refine(
    (value) => value.trim() === value && value.trim().length > 0,
  );
}

function canonicalUtc(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

const canonicalUtcSchema = z.string().refine(canonicalUtc);
const projectIdSchema = z.string().regex(lowerUuidPattern);
const itemIdSchema = z.string()
  .min(1)
  .max(projectBriefLimits.itemId)
  .regex(itemIdPattern);

const evidenceRefSchema = z.object({
  contractVersion: z.literal(projectBriefEvidenceRefContractVersion),
  sourceKind: z.enum(evidenceSourceKinds),
  sourceId: requiredText(projectBriefLimits.sourceId),
  projectId: projectIdSchema,
}).strict();

export function projectBriefEvidenceRefAlignmentKey(
  ref: ProjectBriefEvidenceRef,
): string {
  return JSON.stringify([ref.sourceKind, ref.sourceId, ref.projectId]);
}

function evidenceRefsSchema(maximum: number) {
  return z.array(evidenceRefSchema)
    .min(1)
    .max(maximum)
    .superRefine((refs, context) => {
      const keys = new Set<string>();
      refs.forEach((ref, index) => {
        const key = projectBriefEvidenceRefAlignmentKey(ref);
        if (keys.has(key)) {
          context.addIssue({
            code: "custom",
            message: "project_brief_duplicate_evidence_ref",
            path: [index],
          });
        }
        keys.add(key);
      });
    });
}

const factItemSchema = z.object({
  id: itemIdSchema,
  text: requiredText(projectBriefLimits.itemText),
  evidenceRefs: evidenceRefsSchema(projectBriefLimits.evidenceRefsPerItem),
}).strict();

const unknownItemSchema = z.object({
  id: itemIdSchema,
  text: requiredText(projectBriefLimits.itemText),
  missingEvidence: z.array(requiredText(projectBriefLimits.missingEvidenceText))
    .min(1)
    .max(projectBriefLimits.missingEvidencePerUnknown),
}).strict();

const briefBaseSchema = z.object({
  promptVersion: z.enum(projectBriefSupportedPromptVersions),
  schemaVersion: z.literal(projectBriefSchemaVersion),
  projectId: projectIdSchema,
  evidenceFingerprint: z.string().regex(fingerprintPattern),
  rangeStart: canonicalUtcSchema,
  rangeEnd: canonicalUtcSchema,
  officialStatus: z.object({
    value: z.enum(projectBriefOfficialStatuses),
    evidenceRefs: evidenceRefsSchema(projectBriefLimits.evidenceRefsPerItem),
  }).strict(),
  summary: z.object({
    text: requiredText(projectBriefLimits.summaryText),
    evidenceRefs: evidenceRefsSchema(projectBriefLimits.evidenceRefsPerItem),
  }).strict(),
  completedChanges: z.array(factItemSchema).max(projectBriefLimits.itemsPerSection),
  ongoingWork: z.array(factItemSchema).max(projectBriefLimits.itemsPerSection),
  openItems: z.array(factItemSchema).max(projectBriefLimits.itemsPerSection),
  riskSignals: z.array(factItemSchema).max(projectBriefLimits.itemsPerSection),
  unknowns: z.array(unknownItemSchema).max(projectBriefLimits.unknowns),
  evidenceRefs: evidenceRefsSchema(projectBriefLimits.evidenceRefs),
  freshness: z.object({
    status: z.enum(projectBriefFreshnessStatuses),
    evaluatedAt: canonicalUtcSchema,
    lastSuccessfulAt: canonicalUtcSchema.nullable(),
    coverageComplete: z.boolean(),
    evidenceRefs: evidenceRefsSchema(projectBriefLimits.evidenceRefsPerItem),
  }).strict(),
  boundaryNote: z.literal(projectBriefBoundaryNote),
}).strict();

function issue(
  context: z.RefinementCtx,
  message: ProjectBriefFailureCode,
  path: PropertyKey[],
): void {
  context.addIssue({ code: "custom", message, path });
}

function refKeys(refs: readonly ProjectBriefEvidenceRef[]): Set<string> {
  return new Set(refs.map(projectBriefEvidenceRefAlignmentKey));
}

export const projectBriefSchema = briefBaseSchema.superRefine((brief, context) => {
  if (brief.rangeEnd <= brief.rangeStart) {
    issue(context, "project_brief_range_invalid", ["rangeEnd"]);
  }
  if (
    brief.freshness.lastSuccessfulAt !== null
    && brief.freshness.lastSuccessfulAt > brief.freshness.evaluatedAt
  ) {
    issue(context, "project_brief_range_invalid", ["freshness", "lastSuccessfulAt"]);
  }

  for (const section of projectBriefItemSections) {
    const ids = new Set<string>();
    const items: readonly { readonly id: string }[] = brief[section];
    items.forEach((item, index) => {
      if (ids.has(item.id)) {
        issue(context, "project_brief_duplicate_item", [section, index, "id"]);
      }
      ids.add(item.id);
    });
  }

  const aggregate = refKeys(brief.evidenceRefs);
  const usedRefs = [
    ...brief.officialStatus.evidenceRefs,
    ...brief.summary.evidenceRefs,
    ...brief.completedChanges.flatMap((item) => item.evidenceRefs),
    ...brief.ongoingWork.flatMap((item) => item.evidenceRefs),
    ...brief.openItems.flatMap((item) => item.evidenceRefs),
    ...brief.riskSignals.flatMap((item) => item.evidenceRefs),
    ...brief.freshness.evidenceRefs,
  ];
  const used = refKeys(usedRefs);
  const allRefs = [...brief.evidenceRefs, ...usedRefs];
  if (allRefs.some((ref) => ref.projectId !== brief.projectId)) {
    issue(context, "project_brief_evidence_ref_invalid", ["evidenceRefs"]);
  }
  if (
    aggregate.size !== used.size
    || [...aggregate].some((key) => !used.has(key))
    || [...used].some((key) => !aggregate.has(key))
  ) {
    issue(context, "project_brief_evidence_ref_invalid", ["evidenceRefs"]);
  }
});

function jsonPath(path: readonly PropertyKey[]): string | null {
  if (path.length === 0) return null;
  return path.reduce<string>((result, part) =>
    typeof part === "number" ? `${result}[${part}]` : `${result}.${String(part)}`, "$" );
}

function mappedFailure(error: z.ZodError): ProjectBriefSchemaError {
  const selected = error.issues.find(({ message }) => failureCodeSet.has(message))
    ?? error.issues[0];
  const path = selected?.path ?? [];
  const root = path[0];
  let code: ProjectBriefFailureCode = "project_brief_schema_invalid";
  if (selected && failureCodeSet.has(selected.message)) {
    code = selected.message as ProjectBriefFailureCode;
  } else if (root === "promptVersion" || root === "schemaVersion") {
    code = "project_brief_version_invalid";
  } else if (root === "rangeStart" || root === "rangeEnd") {
    code = "project_brief_range_invalid";
  } else if (path.includes("evidenceRefs")) {
    code = "project_brief_evidence_ref_invalid";
  }
  return new ProjectBriefSchemaError(code, jsonPath(path));
}

export class ProjectBriefSchemaError extends Error {
  readonly name = "ProjectBriefSchemaError";

  constructor(
    readonly code: ProjectBriefFailureCode,
    readonly path: string | null,
  ) {
    super(code);
  }
}

export function parseProjectBrief(value: unknown): ProjectBrief {
  const parsed = projectBriefSchema.safeParse(value);
  if (!parsed.success) throw mappedFailure(parsed.error);
  return parsed.data;
}

export function projectBriefItemAlignmentKey(
  section: ProjectBriefItemSection,
  itemId: string,
): string {
  return JSON.stringify([section, itemId]);
}
