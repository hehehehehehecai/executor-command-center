import { describe, expect, it } from "vitest";

import {
  formatSecretScanResult,
  isSecretScanExcludedPath,
  scanTrackedText,
} from "./secret-scan.mjs";

describe("secret-scan.v1", () => {
  it("detects a synthetic credential without returning its value", () => {
    const synthetic = "gh" + "p_" + "A".repeat(40);
    const findings = scanTrackedText("src/fixture.ts", `const credential = "${synthetic}";`);
    expect(findings).toEqual([
      expect.objectContaining({ path: "src/fixture.ts", ruleId: "github-token", line: 1 }),
    ]);
    const output = formatSecretScanResult({ trackedFiles: 1, scannedFiles: 1, findings, allowlisted: [] });
    expect(output).not.toContain(synthetic);
  });

  it("excludes generated, vendor and cache paths including pnpm store", () => {
    expect(isSecretScanExcludedPath(".pnpm-store/v11/files/fixture")).toBe(true);
    expect(isSecretScanExcludedPath("node_modules/pkg/index.js")).toBe(true);
    expect(isSecretScanExcludedPath(".next/server/app.js")).toBe(true);
    expect(isSecretScanExcludedPath("src/app/page.tsx")).toBe(false);
  });
});
