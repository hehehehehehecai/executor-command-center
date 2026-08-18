import {
  evidenceFailure,
  type ProjectBriefEvidenceError,
} from "./contracts";
import type { ProjectBriefEvidenceSnapshot } from "./evidence-snapshot";

export function normalizeEvidenceText(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return normalizeEvidenceText(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return evidenceFailure("canonicalization_failed");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) return evidenceFailure("canonicalization_failed");
      result[normalizeEvidenceText(key)] = canonicalValue(item);
    }
    return result;
  }
  return evidenceFailure("canonicalization_failed");
}

export function canonicalizeEvidenceSnapshot(
  snapshot: ProjectBriefEvidenceSnapshot,
): string {
  try {
    return JSON.stringify(canonicalValue(snapshot));
  } catch (error) {
    if ((error as ProjectBriefEvidenceError)?.name === "ProjectBriefEvidenceError") {
      throw error;
    }
    return evidenceFailure("canonicalization_failed");
  }
}
