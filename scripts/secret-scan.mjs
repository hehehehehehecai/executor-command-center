import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const secretScanContract = "secret-scan.v1";

const rules = [
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/g },
  { id: "stripe-live-key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,255}\b/g },
  { id: "supabase-service-jwt", pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
];

export function isSecretScanExcludedPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return /^(?:\.pnpm-store|node_modules|\.next|dist|build|coverage|playwright-report|test-results|blob-report|\.git|\.supabase)(?:\/|$)/.test(normalized)
    || /(?:^|\/)database\.types\.ts$/.test(normalized)
    || /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|zip|gz|pdf)$/i.test(normalized);
}

function fingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function scanTrackedText(filePath, text) {
  const findings = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const index = match.index ?? 0;
      findings.push({
        path: filePath.replaceAll("\\", "/"),
        ruleId: rule.id,
        line: text.slice(0, index).split("\n").length,
        fingerprint: fingerprint(match[0]),
      });
    }
  }
  return findings;
}

export function formatSecretScanResult(result) {
  return JSON.stringify({
    contractVersion: secretScanContract,
    trackedFiles: result.trackedFiles,
    scannedFiles: result.scannedFiles,
    findingCount: result.findings.length,
    allowlistedCount: result.allowlisted.length,
    findings: result.findings,
  });
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (listed.status !== 0) throw new Error("secret_scan_manifest_failed");
  const paths = listed.stdout.split("\0").filter(Boolean);
  const allowlistPath = path.join(root, "security", "secret-scan-allowlist.json");
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const allowed = new Set(allowlist.map((item) => `${item.path}\0${item.ruleId}\0${item.fingerprint}`));
  const findings = [];
  let scannedFiles = 0;
  for (const filePath of paths) {
    if (isSecretScanExcludedPath(filePath)) continue;
    const bytes = readFileSync(path.join(root, filePath));
    if (bytes.includes(0)) continue;
    scannedFiles += 1;
    for (const finding of scanTrackedText(filePath, bytes.toString("utf8"))) {
      if (!allowed.has(`${finding.path}\0${finding.ruleId}\0${finding.fingerprint}`)) findings.push(finding);
    }
  }
  process.stdout.write(formatSecretScanResult({ trackedFiles: paths.length, scannedFiles, findings, allowlisted: allowlist }) + "\n");
  if (findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main();
