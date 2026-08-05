import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("phase-7-connected-onboarding.v1 acceptance assets", () => {
  it("exposes one explicit package command and an isolated Playwright project", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["test:e2e:connected-onboarding-fixture"]).toBe(
      "node scripts/run-connected-onboarding-fixture-e2e.mjs",
    );

    const config = read("playwright.connected-onboarding-fixture.config.ts");
    expect(config).toContain('testDir: "./tests/e2e-connected-onboarding-fixture"');
    expect(config).toContain('baseURL: "http://127.0.0.1:3005"');
    expect(config).toContain('outputDir: "test-results/connected-onboarding-fixture"');
  });

  it("refuses production execution before loading the fixture runner", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-connected-onboarding-fixture-e2e.mjs"],
      {
        cwd: root,
        env: { ...process.env, NODE_ENV: "production" },
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "connected_onboarding_fixture_forbidden_in_production",
    );
  });

  it("keeps the server-side network allowlist local and auditable", () => {
    const runner = read("scripts/connected-onboarding-fixture-runner.mjs");
    expect(runner).toContain('const allowedNetworkOrigins = new Set([');
    expect(runner).toContain('`http://${hostname}:${appPort}`');
    expect(runner).toContain('`http://${hostname}:${fixturePort}`');
    expect(runner).toContain("forbiddenExternalRequests.push");
    expect(runner).toContain("unexpected_external_request");
    expect(runner).not.toMatch(/allowedNetworkOrigins[^;]*\*/);
  });

  it("runs every cleanup task and preserves a non-zero Playwright exit code", () => {
    const lifecycleUrl = pathToFileURL(
      path.join(root, "scripts/connected-onboarding-fixture-lifecycle.mjs"),
    ).href;
    const source = `
      import { finalizeFixtureLifecycle } from ${JSON.stringify(lifecycleUrl)};
      const events = [];
      const failedRun = await finalizeFixtureLifecycle({
        playwrightExitCode: 7,
        cleanupTasks: [
          () => { events.push("first"); throw new Error("synthetic"); },
          () => { events.push("second"); },
        ],
      });
      const failedCleanup = await finalizeFixtureLifecycle({
        playwrightExitCode: 0,
        cleanupTasks: [() => { throw new Error("synthetic"); }],
      });
      console.log(JSON.stringify({ events, failedRun, failedCleanup }));
    `;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", source],
      { cwd: root, encoding: "utf8", timeout: 15_000 },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      events: ["first", "second"],
      failedRun: { cleanupFailed: true, exitCode: 7 },
      failedCleanup: { cleanupFailed: true, exitCode: 1 },
    });
  });

  it("provides the complete human staging smoke-test evidence contract", () => {
    const runbook = read("docs/runbooks/staging-onboarding-smoke-test.md");
    for (const heading of [
      "## 目的与准入",
      "## 专用测试资产",
      "## 前置条件与秘密管理",
      "## 逐步 Smoke Test",
      "## 失败处理",
      "## 清理与回滚",
      "## 证据清单与结论模板",
    ]) {
      expect(runbook).toContain(heading);
    }
    for (const field of [
      "STAGING_BASE_URL",
      "DEPLOYMENT_ID",
      "DEPLOYMENT_COMMIT_SHA",
      "PR_NUMBER",
      "PR_HEAD_SHA",
      "MERGE_COMMIT_SHA",
      "VERSION_BINDING_PROOF",
      "EXECUTOR",
      "STARTED_AT",
      "FINISHED_AT",
      "ACCOUNT_ASSET_IDS",
      "STEP_COUNTS",
      "FAILED_STEPS",
      "EVIDENCE_LOCATIONS",
      "CLEANUP_STATUS",
      "FINAL_STATUS",
    ]) {
      expect(runbook).toContain(field);
    }
    expect(runbook).toContain("NOT_RUN_REQUIRES_HUMAN");
    expect(runbook).toContain("专用 GitHub 测试账号");
    expect(runbook).toContain("不得使用公司仓库");
  });
});
