import { createHash } from "node:crypto";
import type { ProjectBriefEvidenceProjectProfile, ProjectBriefEvidenceSnapshot } from "@/domain/project-brief-evidence/evidence-snapshot";
import { canonicalizeEvidenceValue, normalizeEvidenceText } from "@/domain/project-brief-evidence/canonicalization";
import { projectBriefActivePromptVersion, projectBriefFactSections, type ProjectBrief, type ProjectBriefEvidenceRef, type ProjectBriefUnknownItem } from "./project-brief-contract";
import { sanitizeUntrustedRepositoryData } from "./untrusted-repository-data";

export const projectBriefBackgroundProvenanceContract = "project-brief-background-provenance.v2" as const;
export type ProjectBriefSourceRecord = { readonly text: string; readonly evidenceRefs: readonly ProjectBriefEvidenceRef[] };

function sameRef(left: ProjectBriefEvidenceRef, right: ProjectBriefEvidenceRef): boolean {
  return left.sourceKind === right.sourceKind && left.sourceId === right.sourceId && left.projectId === right.projectId;
}

// Bound the JSON-escaped excerpt, including surrogate pairs and control escapes,
// so every selectable record also fits the narrower factual-item text limit.
function excerpt(value: string): string {
  const points = [...normalizeEvidenceText(value).trim()];
  let end = Math.min(points.length, 780);
  let quoted = JSON.stringify(points.slice(0, end).join("") + (end < points.length ? "…" : ""));
  while (quoted.length > 780) {
    end -= 1;
    quoted = JSON.stringify(points.slice(0, end).join("") + "…");
  }
  return quoted;
}

export function projectBriefSourceRecords(snapshot: Pick<ProjectBriefEvidenceSnapshot, "githubActivities" | "authorizedDocuments" | "confirmedDecisions" | "freshness">): ProjectBriefSourceRecord[] {
  const records: ProjectBriefSourceRecord[] = [];
  const add = (ref: ProjectBriefEvidenceRef, label: string, value: unknown) => {
    const { contractVersion, sourceKind, sourceId, projectId } = ref;
    const original = canonicalizeEvidenceValue(value);
    const safe = sanitizeUntrustedRepositoryData(JSON.parse(original));
    const evidenceRef = { contractVersion, sourceKind, sourceId, projectId };
    // Bind a lossy replacement to its original source without exposing that
    // text again. Receipt validation can then detect changed originals even
    // when both would otherwise produce the identical removed-instruction marker.
    const binding = canonicalizeEvidenceValue(safe) === original ? "" : ` 来源指纹：${createHash("sha256").update(canonicalizeEvidenceValue({ evidenceRef, original }), "utf8").digest("hex")}。`;
    const text = typeof safe === "string" ? safe : JSON.stringify(safe);
    records.push({ text: `${label}：${excerpt(text)}。该记录不代表用户确认项目背景。${binding}`, evidenceRefs: [evidenceRef] });
  };
  for (const activity of snapshot.githubActivities) {
    add(activity.sourceRef, `仓库记录（${activity.sourceRef.sourceKind}，摘录）`, activity.summary.trim());
    for (const key of Object.keys(activity.facts).sort()) {
      add(activity.sourceRef, `仓库记录（${activity.sourceRef.sourceKind}，字段摘录）`, [key.trim(), activity.facts[key]]);
    }
  }
  for (const document of snapshot.authorizedDocuments) {
    add(document.sourceRef, "授权文档记录（路径、类型、指纹摘录）", [document.path.trim(), document.documentKind.trim(), document.contentFingerprint.trim()]);
  }
  for (const decision of snapshot.confirmedDecisions.items) {
    add(decision.sourceRef, "已确认决策记录（摘录）", decision.decision.trim());
  }
  add(snapshot.freshness.sourceRef, "同步记录", JSON.stringify({ status: snapshot.freshness.status, lastSuccessfulAt: snapshot.freshness.lastSuccessfulAt, coverageComplete: snapshot.freshness.coverageComplete }));
  return records;
}

function narrativesMatch(brief: ProjectBrief, records: readonly ProjectBriefSourceRecord[], profileMatches: (text: string) => boolean): boolean {
  return [brief.summary, ...projectBriefFactSections.flatMap(section => brief[section])].every(item => {
    if (item.evidenceRefs.length !== 1) return false;
    const ref = item.evidenceRefs[0];
    if (ref.sourceKind === "project_profile") return profileMatches(item.text);
    return records.some(record => sameRef(record.evidenceRefs[0], ref) && item.text === record.text);
  });
}

type Background = Pick<ProjectBriefEvidenceProjectProfile, "coreGoal" | "currentStageGoal" | "status">;
const fields = [
  { key: "coreGoal", id: "unconfirmed-core-goal", text: "核心目标未确认", missing: "用户确认的核心目标" },
  { key: "currentStageGoal", id: "unconfirmed-current-stage-goal", text: "当前阶段目标未确认", missing: "用户确认的当前阶段目标" },
  { key: "status", id: "unconfirmed-status", text: "正式状态未确认", missing: "用户确认的正式状态" },
] as const;

export function unconfirmedProjectBackgroundItems(background: Background): ProjectBriefUnknownItem[] {
  return fields.filter(field => background[field.key] === null)
    .map(field => ({ id: field.id, text: field.text, missingEvidence: [field.missing] }));
}

function profileStatements(profile: ProjectBriefEvidenceProjectProfile): ReadonlySet<string> {
  return new Set([
    profile.coreGoal === null ? "核心目标未确认" : `核心目标：${profile.coreGoal}`,
    profile.currentStageGoal === null ? "当前阶段目标未确认" : `当前阶段目标：${profile.currentStageGoal}`,
    profile.status === null ? "正式状态未确认" : `正式状态：${profile.status}`,
    ...(profile.currentBlocker === null ? [] : [`当前阻碍：${profile.currentBlocker}`]),
  ]);
}

export function briefMatchesProjectBackground(brief: ProjectBrief, snapshot: ProjectBriefEvidenceSnapshot): boolean {
  if (brief.promptVersion !== projectBriefActivePromptVersion) return true;
  const profile = snapshot.projectProfile;
  if (brief.officialStatus.value !== profile.status) return false;
  if (brief.officialStatus.evidenceRefs.length !== 1) return false;
  const ref = brief.officialStatus.evidenceRefs[0];
  if (!ref || ref.sourceKind !== "project_profile" || ref.sourceId !== profile.sourceRef.sourceId || ref.projectId !== profile.sourceRef.projectId) return false;
  const statements = profileStatements(profile);
  if (!narrativesMatch(brief, projectBriefSourceRecords(snapshot), text => statements.has(text))) return false;
  const required = unconfirmedProjectBackgroundItems(profile);
  if (brief.unknowns.length !== required.length) return false;
  for (const field of fields) {
    const item = brief.unknowns.find(item => item.id === field.id);
    const expected = required.find(item => item.id === field.id);
    if (!expected) { if (item) return false; continue; }
    if (!item || item.text !== expected.text || item.missingEvidence.length !== 1 || item.missingEvidence[0] !== expected.missingEvidence[0]) return false;
  }
  return true;
}

// Call only AFTER validating the unique successful generation receipt and
// source ownership. Original v3 generation already enforced exact profile
// statements. A later profile change cannot prove those old values anew; the
// receipt preserves that original binding. Non-profile prose gets no such
// exemption: every record must still match the actual retained source.
export function briefMatchesHistoricalBackground(brief: ProjectBrief, profileRef: ProjectBriefEvidenceRef, records: readonly ProjectBriefSourceRecord[]): boolean {
  if (brief.promptVersion !== projectBriefActivePromptVersion) return true;
  if (brief.officialStatus.evidenceRefs.length !== 1 || !sameRef(brief.officialStatus.evidenceRefs[0], profileRef)) return false;
  const allUnknowns = unconfirmedProjectBackgroundItems({ coreGoal: null, currentStageGoal: null, status: null });
  if (brief.unknowns.some(item => !allUnknowns.some(expected => item.id === expected.id && item.text === expected.text && item.missingEvidence.length === 1 && item.missingEvidence[0] === expected.missingEvidence[0]))) return false;
  const unknown = new Set(brief.unknowns.map(item => item.id));
  if (unknown.has("unconfirmed-status") !== (brief.officialStatus.value === null)) return false;
  return narrativesMatch(brief, records, text => {
    for (const [id, missing, prefix] of [
      ["unconfirmed-core-goal", "核心目标未确认", "核心目标："],
      ["unconfirmed-current-stage-goal", "当前阶段目标未确认", "当前阶段目标："],
    ]) {
      if (unknown.has(id)) { if (text === missing) return true; }
      else if (text.startsWith(prefix) && text.slice(prefix.length).trim().length > 0) return true;
    }
    return text === (brief.officialStatus.value === null ? "正式状态未确认" : `正式状态：${brief.officialStatus.value}`)
      || (text.startsWith("当前阻碍：") && text.slice("当前阻碍：".length).trim().length > 0);
  });
}
