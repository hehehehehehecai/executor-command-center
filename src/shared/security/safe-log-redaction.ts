export const safeLogRedactionContract = "safe-log-redaction.v1" as const;

const sensitiveKey = /(?:authorization|cookie|set-cookie|token|secret|password|private.?key|service.?role|provider.?body|payload|request.?body|response.?body|raw.?response|prompt|sql|stack|email|full.?name)/i;
const sensitiveString = /(?:bearer\s+|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:select|insert|update|delete)\b[\s\S]*\b(?:from|into|set)\b|(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|service[_ -]?role))/i;

function redact(value: unknown, key: string, seen: WeakSet<object>): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length > 512 || sensitiveString.test(value) ? "[REDACTED]" : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return "[REDACTED]";
  }
  if (value instanceof Error || value instanceof Headers) return "[REDACTED]";
  if (typeof value !== "object") return "[REDACTED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, "item", seen));
  }
  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 100)) {
    output[childKey] = redact(childValue, childKey, seen);
  }
  return output;
}

export function redactSecurityLog(value: unknown): Record<string, unknown> {
  const redacted = redact(value, "root", new WeakSet());
  return typeof redacted === "object" && redacted !== null && !Array.isArray(redacted)
    ? redacted as Record<string, unknown>
    : { contract_version: safeLogRedactionContract, value: redacted };
}

export function writeSafeSecurityWarning(value: unknown): void {
  console.warn(JSON.stringify(redactSecurityLog(value)));
}
