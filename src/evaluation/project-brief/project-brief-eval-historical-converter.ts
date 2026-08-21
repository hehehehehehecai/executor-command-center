import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  historicalBriefArtifactContractVersion,
  historicalBriefConversionContractVersion,
  historicalBriefConversionV2ContractVersion,
  historicalBriefEvalCaseContractVersion,
  historicalBriefEvalCaseV3ContractVersion,
  historicalBriefMappingVersion,
  historicalBriefMappingV2Version,
  historicalBriefProjectionV2ContractVersion,
  historicalBriefStatementClassificationVersion,
  historicalBriefTimePrecisionVersion,
  parseHistoricalBriefEvalCase,
  parseHistoricalBriefEvalCaseV3,
  historicalBriefTimeRangeSchema,
  type HistoricalBriefEvalCase,
  type HistoricalBriefEvalCaseV3,
  type HistoricalBriefProjectionV2,
  type HistoricalBriefReceipt,
  type HistoricalBriefTimeRange,
} from "./project-brief-eval-historical-contracts";
import {
  getTrustedHistoricalBriefSource,
  historicalBriefSourceRegistry,
  historicalBriefSourceRegistryVersion,
} from "./project-brief-eval-historical-registry";
import { fingerprintEvalValue } from "./project-brief-eval-fingerprint";

type ParsedSection = { readonly heading: string; readonly content: string };

export type ParsedHistoricalBriefSource = {
  readonly title: string;
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly sections: readonly ParsedSection[];
  readonly receipt: HistoricalBriefReceipt;
};

function exactSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("historical_brief_source_invalid");
  }
}

function normalizeFingerprint(value: string): string {
  const normalized = value.replace(/^sha256:/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("historical_brief_source_invalid");
  }
  return normalized;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("`") && trimmed.endsWith("`")
    ? trimmed.slice(1, -1)
    : trimmed;
}

function parseFrontmatter(text: string): {
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly body: string;
} {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("historical_brief_source_invalid");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("historical_brief_source_invalid");
  const frontmatter: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("historical_brief_source_invalid");
    const key = line.slice(0, separator).trim();
    if (key in frontmatter) throw new Error("historical_brief_source_invalid");
    frontmatter[key] = unquote(line.slice(separator + 1));
  }
  return { frontmatter, body: normalized.slice(end + 5) };
}

function parseSections(body: string): { readonly title: string; readonly sections: ParsedSection[] } {
  const title = /^# (.+)$/m.exec(body)?.[1]?.trim();
  if (title === undefined || title.length === 0) throw new Error("historical_brief_source_invalid");
  const lines = body.split("\n");
  const sections: ParsedSection[] = [];
  let heading: string | null = null;
  let content: string[] = [];
  const flush = () => {
    if (heading === null) return;
    sections.push({ heading, content: content.join("\n").trim() });
  };
  for (const line of lines) {
    const match = /^## ([^#].*)$/.exec(line);
    if (match !== null) {
      flush();
      heading = match[1]!.trim();
      content = [];
    } else if (heading !== null) {
      content.push(line);
    }
  }
  flush();
  if (new Set(sections.map(({ heading: value }) => value)).size !== sections.length) {
    throw new Error("historical_brief_source_invalid");
  }
  return { title, sections };
}

function section(parsed: { readonly sections: readonly ParsedSection[] }, heading: string): string {
  const found = parsed.sections.find((item) => item.heading === heading);
  if (found === undefined) throw new Error("historical_brief_projection_incomplete");
  return found.content;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bulletValue(content: string, key: string): string {
  const match = new RegExp(`^- ${escapeRegExp(key)}：(.+)$`, "m").exec(content)?.[1];
  if (match === undefined) throw new Error("historical_brief_source_invalid");
  return unquote(match);
}

function evidenceIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\[(E-\d{3})\]/g)].map((match) => match[1]!))]
    .sort();
}

function listItems(content: string): string[] {
  const items: string[] = [];
  let current: string[] | null = null;
  for (const line of content.split("\n")) {
    if (/^- /.test(line)) {
      if (current !== null) items.push(current.join("\n").trim());
      current = [line.slice(2).trim()];
    } else if (current !== null && line.trim().length > 0 && !line.startsWith("### ")) {
      current.push(line.trim());
    }
  }
  if (current !== null) items.push(current.join("\n").trim());
  return items;
}

type SpannedItem = {
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
};

function listItemsWithSpans(content: string): SpannedItem[] {
  const items: SpannedItem[] = [];
  let current: { text: string[]; startLine: number; endLine: number } | null = null;
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;
    if (/^- /.test(line)) {
      if (current !== null) {
        items.push({
          text: current.text.join("\n").trim(),
          startLine: current.startLine,
          endLine: current.endLine,
        });
      }
      current = { text: [line.slice(2).trim()], startLine: lineNumber, endLine: lineNumber };
    } else if (current !== null && line.trim().length > 0 && !line.startsWith("### ")) {
      current.text.push(line.trim());
      current.endLine = lineNumber;
    }
  }
  if (current !== null) {
    items.push({
      text: current.text.join("\n").trim(),
      startLine: current.startLine,
      endLine: current.endLine,
    });
  }
  return items;
}

export function normalizeHistoricalStatementText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

export function classifyHistoricalStatement(input: {
  readonly sourceSection: string;
  readonly text: string;
}): "project_fact" | "workflow_note" | "unknown" {
  if (input.sourceSection === "Unknowns") return "unknown";
  const normalized = normalizeHistoricalStatementText(input.text);
  const refersToBriefItself = /^(?:当前这份简报|这份简报|本简报|该简报)/u.test(normalized);
  const describesWorkflow = /(?:候选|冻结|转换|转为历史\s*Case|审核|纳入|验证流程)/iu.test(normalized);
  return refersToBriefItself && describesWorkflow ? "workflow_note" : "project_fact";
}

function canonicalInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value))
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value);
}

export function parseHistoricalTimeRange(metadata: string): HistoricalBriefTimeRange {
  const lines = metadata.split("\n").map((line) => line.trim());
  const rangeLine = lines.find((line) => line.startsWith("- 时间范围："));
  if (rangeLine !== undefined) {
    const instants = rangeLine.match(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z/g,
    ) ?? [];
    if (instants.length !== 2 || !instants.every(canonicalInstant)) {
      throw new Error("historical_time_range_invalid");
    }
    const [start, end] = instants as [string, string];
    return {
      contractVersion: historicalBriefTimePrecisionVersion,
      start: { precision: "instant", value: start, exactInstant: start },
      end: { precision: "instant", value: end, exactInstant: end },
      sourceTextHash: fingerprintEvalValue(normalizeHistoricalStatementText(rangeLine)),
    };
  }

  const startLine = lines.find((line) => line.startsWith("- 时间范围起点："));
  const endLine = lines.find((line) => line.startsWith("- 简报时间点："));
  const date = startLine?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const end = endLine?.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z/,
  )?.[0];
  if (startLine === undefined || endLine === undefined || date === undefined || end === undefined
      || !/精确\s*UTC\s*时间待确认/u.test(startLine) || !canonicalInstant(end)) {
    throw new Error("historical_time_range_invalid");
  }
  const value = {
    contractVersion: historicalBriefTimePrecisionVersion,
    start: { precision: "date" as const, value: date, exactInstant: "unknown" as const },
    end: { precision: "instant" as const, value: end, exactInstant: end },
    sourceTextHash: fingerprintEvalValue(normalizeHistoricalStatementText(`${startLine}\n${endLine}`)),
  };
  const parsed = historicalBriefTimeRangeSchema.safeParse(value);
  if (!parsed.success) throw new Error("historical_time_range_invalid");
  return parsed.data;
}

export function validateHistoricalTimeRange(input: unknown): {
  readonly status: "pass" | "fail";
  readonly reasonCode: string;
} {
  const parsed = historicalBriefTimeRangeSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "fail", reasonCode: "historical_time_range_precision_invalid" };
  }
  const { start, end } = parsed.data;
  const ordered = start.precision === "instant" && end.precision === "instant"
    ? Date.parse(start.value) < Date.parse(end.value)
    : start.precision === "date" && end.precision === "date"
      ? start.value <= end.value
      : start.precision === "date"
        ? start.value <= end.value.slice(0, 10)
        : start.value.slice(0, 10) <= end.value;
  if (!ordered) return { status: "fail", reasonCode: "historical_time_range_order_invalid" };
  return start.precision === "date" || end.precision === "date"
    ? { status: "pass", reasonCode: "historical_time_range_date_precision_preserved" }
    : { status: "pass", reasonCode: "historical_time_range_instant_precision_preserved" };
}

function parseReceipt(
  parsed: { readonly frontmatter: Readonly<Record<string, string>>; readonly sections: readonly ParsedSection[] },
): HistoricalBriefReceipt {
  const content = section(parsed, "人工确认收据");
  const scopes: [
    "source_and_redaction",
    "readability",
    "expected_outcomes",
  ] = ["source_and_redaction", "readability", "expected_outcomes"];
  if (scopes.some((scope) => !content.includes(`\`${scope}\`：\`confirmed\``))) {
    throw new Error("historical_brief_confirmation_invalid");
  }
  return {
    contractVersion: bulletValue(content, "Receipt contract") as "project-brief-human-confirmation.v1",
    receiptId: bulletValue(content, "Confirmation receipt ID"),
    confirmerId: bulletValue(content, "确认人稳定 ID"),
    confirmerRole: bulletValue(content, "确认人角色"),
    confirmedAt: bulletValue(content, "canonical UTC 确认时间"),
    confirmationSource: bulletValue(content, "确认来源"),
    briefId: bulletValue(content, "Brief ID"),
    sourceBundleFingerprint: normalizeFingerprint(bulletValue(content, "Source fingerprint")),
    sourceSubjectFingerprint: normalizeFingerprint(bulletValue(content, "Subject fingerprint")),
    scopes,
  };
}

export function parseHistoricalBriefSource(sourceBytes: Uint8Array): ParsedHistoricalBriefSource {
  const { frontmatter, body } = parseFrontmatter(decodeUtf8(sourceBytes));
  const { title, sections } = parseSections(body);
  return { title, frontmatter, sections, receipt: parseReceipt({ frontmatter, sections }) };
}

export function verifyHistoricalBriefReceipt(
  caseId: string,
  parsed: ParsedHistoricalBriefSource,
): void {
  const trusted = getTrustedHistoricalBriefSource(caseId);
  const receipt = parsed.receipt;
  const frontmatterSource = normalizeFingerprint(parsed.frontmatter.source_bundle_fingerprint ?? "");
  const frontmatterSubject = normalizeFingerprint(parsed.frontmatter.subject_fingerprint ?? "");
  const frontmatterReceipt = parsed.frontmatter.confirmation_receipt_id;
  const frontmatterConfirmedAt = parsed.frontmatter.confirmed_at_utc;
  const documentBriefId = bulletValue(section(parsed, "简报元数据"), "Brief ID");
  const valid = parsed.title === trusted.title
    && receipt.contractVersion === trusted.receipt.contractVersion
    && receipt.receiptId === trusted.receipt.receiptId
    && receipt.confirmerId === trusted.receipt.confirmerId
    && receipt.confirmerRole === trusted.receipt.confirmerRole
    && receipt.confirmedAt === trusted.receipt.confirmedAt
    && receipt.confirmationSource === trusted.receipt.confirmationSource
    && receipt.briefId === trusted.receipt.briefId
    && receipt.sourceBundleFingerprint === trusted.sourceBundleFingerprint
    && receipt.sourceSubjectFingerprint === trusted.sourceSubjectFingerprint
    && receipt.scopes.join("\u0000") === trusted.receipt.scopes.join("\u0000")
    && documentBriefId === trusted.documentBriefId
    && frontmatterSource === trusted.sourceBundleFingerprint
    && frontmatterSubject === trusted.sourceSubjectFingerprint
    && frontmatterReceipt === trusted.receipt.receiptId
    && frontmatterConfirmedAt === trusted.receipt.confirmedAt
    && parsed.frontmatter.snapshot_status === "human_confirmed_historical";
  if (!valid) throw new Error("historical_brief_confirmation_invalid");
}

function projectionFor(parsed: ParsedHistoricalBriefSource) {
  const factSections = [
    "Official Status", "Summary", "Completed Changes", "Ongoing Work",
    "Open Items", "Risk Signals",
  ] as const;
  const facts = factSections.flatMap((heading) => {
    const content = section(parsed, heading);
    const items = heading === "Official Status" || heading === "Summary"
      ? [content]
      : listItems(content);
    return items.map((text, index) => ({
      section: heading,
      ordinal: index + 1,
      text,
      evidenceIds: evidenceIds(text),
    }));
  });
  const unknowns = listItems(section(parsed, "Unknowns")).map((text, index) => ({
    ordinal: index + 1,
    text,
    evidenceIds: evidenceIds(text),
  }));
  const evidenceContent = section(parsed, "Evidence Refs");
  const evidenceCatalog = evidenceContent.split("\n")
    .filter((line) => /^\| E-\d{3} \|/.test(line))
    .map((line) => ({
      evidenceId: line.split("|")[1]!.trim(),
      rowFingerprint: fingerprintEvalValue(line.trim()),
    }));
  const visibleEvidenceIds = evidenceIds([
    ...facts.map(({ text }) => text),
    ...unknowns.map(({ text }) => text),
    section(parsed, "Freshness"),
    section(parsed, "Boundary Note"),
  ].join("\n"));
  const metadata = section(parsed, "简报元数据");
  const timeLine = metadata.split("\n").find((line) =>
    line.startsWith("- 时间范围：") || line.startsWith("- 时间范围起点："));
  if (timeLine === undefined) throw new Error("historical_brief_projection_incomplete");
  const sections = parsed.sections.map(({ heading, content }) => ({
    heading,
    contentFingerprint: fingerprintEvalValue(content),
  }));
  const core = {
    sectionOrder: parsed.sections.map(({ heading }) => heading),
    sections,
    facts,
    unknowns,
    evidenceCatalog,
    visibleEvidenceIds,
    timeExpression: timeLine.slice(2).trim(),
    boundaryNote: section(parsed, "Boundary Note"),
  };
  return { ...core, projectionFingerprint: fingerprintEvalValue(core) };
}

const historicalStatementSections = [
  "Official Status", "Summary", "Completed Changes", "Ongoing Work",
  "Open Items", "Risk Signals", "Unknowns",
] as const;

const statementSectionIds: Record<(typeof historicalStatementSections)[number], string> = {
  "Official Status": "official-status",
  Summary: "summary",
  "Completed Changes": "completed-changes",
  "Ongoing Work": "ongoing-work",
  "Open Items": "open-items",
  "Risk Signals": "risk-signals",
  Unknowns: "unknowns",
};

function projectionV2For(parsed: ParsedHistoricalBriefSource): HistoricalBriefProjectionV2 {
  const statements = historicalStatementSections.flatMap((heading) => {
    const content = section(parsed, heading);
    const items = heading === "Official Status" || heading === "Summary"
      ? [{ text: content, startLine: 1, endLine: content.split("\n").length }]
      : listItemsWithSpans(content);
    return items.map(({ text, startLine, endLine }, index) => {
      const normalizedText = normalizeHistoricalStatementText(text);
      return {
        statementId: `${statementSectionIds[heading]}-${String(index + 1).padStart(3, "0")}`,
        normalizedText,
        sourceSection: heading,
        statementKind: classifyHistoricalStatement({ sourceSection: heading, text }),
        evidenceIds: evidenceIds(text),
        sourceProvenance: {
          startLine,
          endLine,
          sourceTextHash: fingerprintEvalValue(normalizedText),
        },
      };
    });
  });
  const evidenceContent = section(parsed, "Evidence Refs");
  const evidenceCatalog = evidenceContent.split("\n")
    .filter((line) => /^\| E-\d{3} \|/.test(line))
    .map((line) => ({
      evidenceId: line.split("|")[1]!.trim(),
      rowFingerprint: fingerprintEvalValue(line.trim()),
    }));
  const visibleEvidenceIds = evidenceIds([
    ...statements.map(({ normalizedText }) => normalizedText),
    section(parsed, "Freshness"),
    section(parsed, "Boundary Note"),
  ].join("\n"));
  const sections = parsed.sections.map(({ heading, content }) => ({
    heading,
    contentFingerprint: fingerprintEvalValue(content),
  }));
  const core = {
    contractVersion: historicalBriefProjectionV2ContractVersion,
    classificationVersion: historicalBriefStatementClassificationVersion,
    timePrecisionVersion: historicalBriefTimePrecisionVersion,
    sectionOrder: parsed.sections.map(({ heading }) => heading),
    sections,
    statements,
    evidenceCatalog,
    visibleEvidenceIds,
    timeRange: parseHistoricalTimeRange(section(parsed, "简报元数据")),
    boundaryNote: section(parsed, "Boundary Note"),
  };
  return { ...core, projectionFingerprint: fingerprintEvalValue(core) };
}

export function validateHistoricalStatementEvidence(
  projection: Pick<HistoricalBriefProjectionV2, "statements" | "evidenceCatalog" | "visibleEvidenceIds">,
): { readonly status: "pass" | "fail" | "blocked"; readonly reasonCode: string } {
  const catalog = new Set(projection.evidenceCatalog.map(({ evidenceId }) => evidenceId));
  if (catalog.size !== projection.evidenceCatalog.length) {
    return { status: "fail", reasonCode: "historical_evidence_catalog_invalid" };
  }
  for (const statement of projection.statements) {
    const sectionIsUnknown = statement.sourceSection === "Unknowns";
    if ((sectionIsUnknown && statement.statementKind !== "unknown")
        || (!sectionIsUnknown && statement.statementKind === "unknown")) {
      return { status: "fail", reasonCode: "historical_statement_classification_invalid" };
    }
    if (statement.statementKind === "project_fact" && statement.evidenceIds.length === 0) {
      return { status: "blocked", reasonCode: "historical_project_fact_evidence_unavailable" };
    }
    if (classifyHistoricalStatement({
      sourceSection: statement.sourceSection,
      text: statement.normalizedText,
    }) !== statement.statementKind) {
      return { status: "fail", reasonCode: "historical_statement_classification_invalid" };
    }
    if (normalizeHistoricalStatementText(statement.normalizedText) !== statement.normalizedText
        || fingerprintEvalValue(statement.normalizedText)
          !== statement.sourceProvenance.sourceTextHash
        || statement.sourceProvenance.endLine < statement.sourceProvenance.startLine) {
      return { status: "fail", reasonCode: "historical_statement_provenance_invalid" };
    }
    if (statement.evidenceIds.some((id) => !catalog.has(id))) {
      return { status: "fail", reasonCode: "historical_statement_evidence_invalid" };
    }
  }
  if (projection.visibleEvidenceIds.some((id) => !catalog.has(id))) {
    return { status: "fail", reasonCode: "historical_visible_evidence_invalid" };
  }
  return { status: "pass", reasonCode: "historical_statement_evidence_valid" };
}

function assertCompleteProjectionV2(
  caseId: string,
  projection: HistoricalBriefProjectionV2,
): void {
  const trusted = getTrustedHistoricalBriefSource(caseId);
  const statementCount = trusted.expectedFactCount + trusted.expectedUnknownCount;
  const complete = projection.sectionOrder.join("\u0000")
      === trusted.expectedSectionOrder.join("\u0000")
    && projection.sections.length === trusted.expectedSectionOrder.length
    && projection.statements.length === statementCount
    && projection.statements.filter(({ statementKind }) => statementKind === "unknown").length
      === trusted.expectedUnknownCount;
  if (!complete) throw new Error("historical_brief_projection_v2_incomplete");
}

function assertCompleteProjection(caseId: string, projection: ReturnType<typeof projectionFor>): void {
  const trusted = getTrustedHistoricalBriefSource(caseId);
  const catalog = new Set(projection.evidenceCatalog.map(({ evidenceId }) => evidenceId));
  const complete = projection.sectionOrder.join("\u0000")
      === trusted.expectedSectionOrder.join("\u0000")
    && projection.sections.length === trusted.expectedSectionOrder.length
    && projection.facts.length === trusted.expectedFactCount
    && projection.unknowns.length === trusted.expectedUnknownCount
    && projection.visibleEvidenceIds.every((id) => catalog.has(id));
  if (!complete) throw new Error("historical_brief_projection_incomplete");
}

export async function convertHistoricalBriefSource(input: {
  readonly caseId: string;
  readonly sourceBytes: Uint8Array;
}): Promise<HistoricalBriefEvalCase> {
  const trusted = getTrustedHistoricalBriefSource(input.caseId);
  const documentSha256 = exactSha256(input.sourceBytes);
  if (documentSha256 !== trusted.documentSha256) {
    throw new Error("historical_brief_source_fingerprint_mismatch");
  }
  const parsed = parseHistoricalBriefSource(input.sourceBytes);
  verifyHistoricalBriefReceipt(input.caseId, parsed);
  const projection = projectionFor(parsed);
  assertCompleteProjection(input.caseId, projection);
  const sourceArtifact = {
    contractVersion: historicalBriefArtifactContractVersion,
    registryVersion: historicalBriefSourceRegistryVersion,
    sourceMode: "historical_brief_artifact" as const,
    documentSha256,
    sourceDocumentVersion: trusted.sourceDocumentVersion,
    project: trusted.project,
    documentBriefId: trusted.documentBriefId,
    sourceBundleFingerprint: trusted.sourceBundleFingerprint,
    sourceSubjectFingerprint: trusted.sourceSubjectFingerprint,
  };
  const humanConfirmationReceipt = {
    ...trusted.receipt,
    sourceBundleFingerprint: trusted.sourceBundleFingerprint,
    sourceSubjectFingerprint: trusted.sourceSubjectFingerprint,
  };
  const caseSubject = {
    contractVersion: historicalBriefEvalCaseContractVersion,
    caseId: trusted.caseId,
    caseType: "human_confirmed_historical" as const,
    title: trusted.title,
    sourceArtifact,
    humanConfirmationReceipt,
    projection,
    expectedChecks: trusted.expectedChecks,
  };
  const caseFingerprint = fingerprintEvalValue(caseSubject);
  const conversionAttestation = {
    contractVersion: historicalBriefConversionContractVersion,
    mappingVersion: historicalBriefMappingVersion,
    inputDocumentSha256: documentSha256,
    inputReceiptFingerprint: fingerprintEvalValue(humanConfirmationReceipt),
    outputCaseFingerprint: caseFingerprint,
  };
  const withoutContentFingerprint = {
    ...caseSubject,
    conversionAttestation,
    caseFingerprint,
  };
  return parseHistoricalBriefEvalCase({
    ...withoutContentFingerprint,
    contentFingerprint: fingerprintEvalValue(withoutContentFingerprint),
  });
}

export async function loadRegisteredHistoricalBriefCase(
  caseId: string,
): Promise<HistoricalBriefEvalCase> {
  const trusted = getTrustedHistoricalBriefSource(caseId);
  return convertHistoricalBriefSource({ caseId, sourceBytes: await readFile(trusted.fixturePath) });
}

export async function loadRegisteredHistoricalBriefCases(): Promise<HistoricalBriefEvalCase[]> {
  return Promise.all(historicalBriefSourceRegistry.map(({ caseId }) =>
    loadRegisteredHistoricalBriefCase(caseId)));
}

const passingHistoricalChecks = {
  schema: "pass",
  evidenceValidity: "pass",
  timeRange: "pass",
  requiredFacts: "pass",
  forbiddenAssertions: "pass",
  unknownHandling: "pass",
  readability: "pass",
} as const;

export async function convertHistoricalBriefSourceV3(input: {
  readonly caseId: string;
  readonly sourceBytes: Uint8Array;
}): Promise<HistoricalBriefEvalCaseV3> {
  const trusted = getTrustedHistoricalBriefSource(input.caseId);
  const documentSha256 = exactSha256(input.sourceBytes);
  if (documentSha256 !== trusted.documentSha256) {
    throw new Error("historical_brief_source_fingerprint_mismatch");
  }
  const parsed = parseHistoricalBriefSource(input.sourceBytes);
  verifyHistoricalBriefReceipt(input.caseId, parsed);
  const projection = projectionV2For(parsed);
  assertCompleteProjectionV2(input.caseId, projection);
  const sourceArtifact = {
    contractVersion: historicalBriefArtifactContractVersion,
    registryVersion: historicalBriefSourceRegistryVersion,
    sourceMode: "historical_brief_artifact" as const,
    documentSha256,
    sourceDocumentVersion: trusted.sourceDocumentVersion,
    project: trusted.project,
    documentBriefId: trusted.documentBriefId,
    sourceBundleFingerprint: trusted.sourceBundleFingerprint,
    sourceSubjectFingerprint: trusted.sourceSubjectFingerprint,
  };
  const humanConfirmationReceipt = {
    ...trusted.receipt,
    sourceBundleFingerprint: trusted.sourceBundleFingerprint,
    sourceSubjectFingerprint: trusted.sourceSubjectFingerprint,
  };
  const caseSubject = {
    contractVersion: historicalBriefEvalCaseV3ContractVersion,
    caseId: trusted.caseId,
    caseType: "human_confirmed_historical" as const,
    title: trusted.title,
    sourceArtifact,
    humanConfirmationReceipt,
    projection,
    expectedChecks: passingHistoricalChecks,
  };
  const caseFingerprint = fingerprintEvalValue(caseSubject);
  const conversionAttestation = {
    contractVersion: historicalBriefConversionV2ContractVersion,
    mappingVersion: historicalBriefMappingV2Version,
    projectionContractVersion: historicalBriefProjectionV2ContractVersion,
    classificationVersion: historicalBriefStatementClassificationVersion,
    timePrecisionVersion: historicalBriefTimePrecisionVersion,
    inputDocumentSha256: documentSha256,
    inputReceiptFingerprint: fingerprintEvalValue(humanConfirmationReceipt),
    outputCaseFingerprint: caseFingerprint,
  };
  const withoutContentFingerprint = {
    ...caseSubject,
    conversionAttestation,
    caseFingerprint,
  };
  return parseHistoricalBriefEvalCaseV3({
    ...withoutContentFingerprint,
    contentFingerprint: fingerprintEvalValue(withoutContentFingerprint),
  });
}

export async function loadRegisteredHistoricalBriefCaseV3(
  caseId: string,
): Promise<HistoricalBriefEvalCaseV3> {
  const trusted = getTrustedHistoricalBriefSource(caseId);
  return convertHistoricalBriefSourceV3({
    caseId,
    sourceBytes: await readFile(trusted.fixturePath),
  });
}

export async function loadRegisteredHistoricalBriefCasesV3(): Promise<HistoricalBriefEvalCaseV3[]> {
  return Promise.all(historicalBriefSourceRegistry.map(({ caseId }) =>
    loadRegisteredHistoricalBriefCaseV3(caseId)));
}
