import { z } from "zod";

export const historicalBriefArtifactContractVersion =
  "project-brief-eval-historical-brief-artifact.v1" as const;
export const historicalBriefConversionContractVersion =
  "project-brief-eval-historical-brief-conversion.v1" as const;
export const historicalBriefEvalCaseContractVersion = "project-brief-eval-case.v2" as const;
export const historicalBriefMappingVersion = "project-brief-historical-mapping.v1" as const;
export const historicalBriefProjectionV2ContractVersion =
  "project-brief-eval-historical-projection.v2" as const;
export const historicalBriefStatementClassificationVersion =
  "project-brief-eval-historical-statement-classification.v1" as const;
export const historicalBriefTimePrecisionVersion =
  "project-brief-eval-historical-time-precision.v1" as const;
export const historicalBriefConversionV2ContractVersion =
  "project-brief-eval-historical-brief-conversion.v2" as const;
export const historicalBriefEvalCaseV3ContractVersion = "project-brief-eval-case.v3" as const;
export const historicalBriefMappingV2Version = "project-brief-historical-mapping.v2" as const;

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const required = z.string().min(1).refine((value) => value.trim() === value);
const identifier = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
const canonicalUtc = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
});
const checkStatus = z.enum(["pass", "fail", "blocked", "not_applicable"]);

export const historicalBriefReceiptSchema = z.object({
  contractVersion: z.literal("project-brief-human-confirmation.v1"),
  receiptId: required,
  confirmerId: required,
  confirmerRole: required,
  confirmedAt: canonicalUtc,
  confirmationSource: required,
  briefId: required,
  sourceBundleFingerprint: sha,
  sourceSubjectFingerprint: sha,
  scopes: z.tuple([
    z.literal("source_and_redaction"),
    z.literal("readability"),
    z.literal("expected_outcomes"),
  ]),
}).strict();

const claimSchema = z.object({
  section: z.enum([
    "Official Status", "Summary", "Completed Changes", "Ongoing Work",
    "Open Items", "Risk Signals",
  ]),
  ordinal: z.number().int().positive(),
  text: required,
  evidenceIds: z.array(z.string().regex(/^E-\d{3}$/)),
}).strict();

const unknownSchema = z.object({
  ordinal: z.number().int().positive(),
  text: required,
  evidenceIds: z.array(z.string().regex(/^E-\d{3}$/)),
}).strict();

const evidenceSchema = z.object({
  evidenceId: z.string().regex(/^E-\d{3}$/),
  rowFingerprint: sha,
}).strict();

const sourceArtifactSchema = z.object({
  contractVersion: z.literal(historicalBriefArtifactContractVersion),
  registryVersion: z.literal("project-brief-eval-historical-source-registry.v1"),
  sourceMode: z.literal("historical_brief_artifact"),
  documentSha256: sha,
  sourceDocumentVersion: required,
  project: required,
  documentBriefId: required,
  sourceBundleFingerprint: sha,
  sourceSubjectFingerprint: sha,
}).strict();

const projectionSchema = z.object({
  sectionOrder: z.array(required).min(12),
  sections: z.array(z.object({ heading: required, contentFingerprint: sha }).strict()).min(12),
  facts: z.array(claimSchema),
  unknowns: z.array(unknownSchema),
  evidenceCatalog: z.array(evidenceSchema),
  visibleEvidenceIds: z.array(z.string().regex(/^E-\d{3}$/)),
  timeExpression: required,
  boundaryNote: required,
  projectionFingerprint: sha,
}).strict();

export const historicalBriefConversionAttestationSchema = z.object({
  contractVersion: z.literal(historicalBriefConversionContractVersion),
  mappingVersion: z.literal(historicalBriefMappingVersion),
  inputDocumentSha256: sha,
  inputReceiptFingerprint: sha,
  outputCaseFingerprint: sha,
}).strict();

const expectedChecksSchema = z.object({
  schema: checkStatus,
  evidenceValidity: checkStatus,
  timeRange: checkStatus,
  requiredFacts: checkStatus,
  forbiddenAssertions: checkStatus,
  unknownHandling: checkStatus,
  readability: checkStatus,
}).strict();

export const historicalBriefEvalCaseSchema = z.object({
  contractVersion: z.literal(historicalBriefEvalCaseContractVersion),
  caseId: identifier,
  caseType: z.literal("human_confirmed_historical"),
  title: required,
  sourceArtifact: sourceArtifactSchema,
  humanConfirmationReceipt: historicalBriefReceiptSchema,
  projection: projectionSchema,
  expectedChecks: expectedChecksSchema,
  conversionAttestation: historicalBriefConversionAttestationSchema,
  caseFingerprint: sha,
  contentFingerprint: sha,
}).strict();

const historicalStatementSectionSchema = z.enum([
  "Official Status", "Summary", "Completed Changes", "Ongoing Work",
  "Open Items", "Risk Signals", "Unknowns",
]);

const historicalStatementSchema = z.object({
  statementId: identifier,
  normalizedText: required,
  sourceSection: historicalStatementSectionSchema,
  statementKind: z.enum(["project_fact", "workflow_note", "unknown"]),
  evidenceIds: z.array(z.string().regex(/^E-\d{3}$/)),
  sourceProvenance: z.object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    sourceTextHash: sha,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.sourceProvenance.endLine < value.sourceProvenance.startLine) {
    context.addIssue({ code: "custom", message: "historical_statement_span_invalid" });
  }
});

const instantBoundarySchema = z.object({
  precision: z.literal("instant"),
  value: z.string().refine((value) => Number.isFinite(Date.parse(value))
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)),
  exactInstant: z.string(),
}).strict().superRefine((value, context) => {
  if (value.exactInstant !== value.value) {
    context.addIssue({ code: "custom", message: "historical_time_precision_invalid" });
  }
});

const dateBoundarySchema = z.object({
  precision: z.literal("date"),
  value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month! - 1
      && date.getUTCDate() === day;
  }),
  exactInstant: z.literal("unknown"),
}).strict();

export const historicalBriefTimeRangeSchema = z.object({
  contractVersion: z.literal(historicalBriefTimePrecisionVersion),
  start: z.discriminatedUnion("precision", [instantBoundarySchema, dateBoundarySchema]),
  end: z.discriminatedUnion("precision", [instantBoundarySchema, dateBoundarySchema]),
  sourceTextHash: sha,
}).strict();

export const historicalBriefProjectionV2Schema = z.object({
  contractVersion: z.literal(historicalBriefProjectionV2ContractVersion),
  classificationVersion: z.literal(historicalBriefStatementClassificationVersion),
  timePrecisionVersion: z.literal(historicalBriefTimePrecisionVersion),
  sectionOrder: z.array(required).min(12),
  sections: z.array(z.object({ heading: required, contentFingerprint: sha }).strict()).min(12),
  statements: z.array(historicalStatementSchema),
  evidenceCatalog: z.array(evidenceSchema),
  visibleEvidenceIds: z.array(z.string().regex(/^E-\d{3}$/)),
  timeRange: historicalBriefTimeRangeSchema,
  boundaryNote: required,
  projectionFingerprint: sha,
}).strict();

export const historicalBriefConversionAttestationV2Schema = z.object({
  contractVersion: z.literal(historicalBriefConversionV2ContractVersion),
  mappingVersion: z.literal(historicalBriefMappingV2Version),
  projectionContractVersion: z.literal(historicalBriefProjectionV2ContractVersion),
  classificationVersion: z.literal(historicalBriefStatementClassificationVersion),
  timePrecisionVersion: z.literal(historicalBriefTimePrecisionVersion),
  inputDocumentSha256: sha,
  inputReceiptFingerprint: sha,
  outputCaseFingerprint: sha,
}).strict();

export const historicalBriefEvalCaseV3Schema = z.object({
  contractVersion: z.literal(historicalBriefEvalCaseV3ContractVersion),
  caseId: identifier,
  caseType: z.literal("human_confirmed_historical"),
  title: required,
  sourceArtifact: sourceArtifactSchema,
  humanConfirmationReceipt: historicalBriefReceiptSchema,
  projection: historicalBriefProjectionV2Schema,
  expectedChecks: expectedChecksSchema,
  conversionAttestation: historicalBriefConversionAttestationV2Schema,
  caseFingerprint: sha,
  contentFingerprint: sha,
}).strict();

export type HistoricalBriefReceipt = z.infer<typeof historicalBriefReceiptSchema>;
export type HistoricalBriefEvalCase = z.infer<typeof historicalBriefEvalCaseSchema>;
export type HistoricalBriefConversionAttestation = z.infer<
  typeof historicalBriefConversionAttestationSchema
>;
export type HistoricalBriefStatement = z.infer<typeof historicalStatementSchema>;
export type HistoricalBriefTimeRange = z.infer<typeof historicalBriefTimeRangeSchema>;
export type HistoricalBriefProjectionV2 = z.infer<typeof historicalBriefProjectionV2Schema>;
export type HistoricalBriefEvalCaseV3 = z.infer<typeof historicalBriefEvalCaseV3Schema>;

function parse<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(code);
  return result.data;
}

export function parseHistoricalBriefEvalCase(value: unknown): HistoricalBriefEvalCase {
  return parse(historicalBriefEvalCaseSchema, value, "historical_brief_case_invalid");
}

export function parseHistoricalBriefConversionAttestation(
  value: unknown,
): HistoricalBriefConversionAttestation {
  return parse(
    historicalBriefConversionAttestationSchema,
    value,
    "historical_brief_conversion_invalid",
  );
}

export function parseHistoricalBriefEvalCaseV3(value: unknown): HistoricalBriefEvalCaseV3 {
  return parse(historicalBriefEvalCaseV3Schema, value, "historical_brief_case_v3_invalid");
}

export function parseHistoricalBriefTimeRange(value: unknown): HistoricalBriefTimeRange {
  return parse(historicalBriefTimeRangeSchema, value, "historical_time_range_invalid");
}
