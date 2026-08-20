import { z } from "zod";

export const historicalBriefArtifactContractVersion =
  "project-brief-eval-historical-brief-artifact.v1" as const;
export const historicalBriefConversionContractVersion =
  "project-brief-eval-historical-brief-conversion.v1" as const;
export const historicalBriefEvalCaseContractVersion = "project-brief-eval-case.v2" as const;
export const historicalBriefMappingVersion = "project-brief-historical-mapping.v1" as const;

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

export type HistoricalBriefReceipt = z.infer<typeof historicalBriefReceiptSchema>;
export type HistoricalBriefEvalCase = z.infer<typeof historicalBriefEvalCaseSchema>;
export type HistoricalBriefConversionAttestation = z.infer<
  typeof historicalBriefConversionAttestationSchema
>;

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
