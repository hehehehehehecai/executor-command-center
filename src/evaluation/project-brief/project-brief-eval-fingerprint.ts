import { createHash } from "node:crypto";

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return normalizeText(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("project_brief_eval_fingerprint_invalid");
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("project_brief_eval_fingerprint_invalid");
    seen.add(value);
    const result = value.map((item) => canonicalValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    ) {
      throw new Error("project_brief_eval_fingerprint_invalid");
    }
    if (seen.has(value)) throw new Error("project_brief_eval_fingerprint_invalid");
    seen.add(value);
    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const normalizedKeys = Object.keys(input)
      .map((key) => [key, normalizeText(key)] as const)
      .sort((left, right) => left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0);
    for (const [original, normalized] of normalizedKeys) {
      if (normalized in result || input[original] === undefined) {
        throw new Error("project_brief_eval_fingerprint_invalid");
      }
      result[normalized] = canonicalValue(input[original], seen);
    }
    seen.delete(value);
    return result;
  }
  throw new Error("project_brief_eval_fingerprint_invalid");
}

export function canonicalizeEvalValue(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set<object>()));
}

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function fingerprintEvalValue(value: unknown): string {
  return sha256Utf8(canonicalizeEvalValue(value));
}

export function fingerprintEvalCaseSubject(value: Readonly<Record<string, unknown>>): string {
  const subjectKeys = [
    "contractVersion", "caseId", "caseType", "title", "artifact", "candidateBrief",
    "expectedValidity", "expectedChecks", "requiredFacts", "forbiddenAssertions",
    "expectedUnknowns", "source",
  ] as const;
  return fingerprintEvalValue(Object.fromEntries(
    subjectKeys.map((key) => [key, value[key]]),
  ));
}

export function fingerprintEvalCaseContent(value: Readonly<Record<string, unknown>>): string {
  return fingerprintEvalValue(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentFingerprint"),
  ));
}
