import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  historicalBriefArtifactContractVersion,
  historicalBriefConversionContractVersion,
  historicalBriefEvalCaseContractVersion,
  historicalBriefMappingVersion,
  parseHistoricalBriefEvalCase,
  type HistoricalBriefEvalCase,
  type HistoricalBriefReceipt,
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
