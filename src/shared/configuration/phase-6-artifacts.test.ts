import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function commandIndex(workflow: string, command: string) {
  const index = workflow.indexOf(`run: ${command}`);

  expect(index, `${command} must be a workflow run step`).toBeGreaterThan(-1);

  return index;
}

describe("ci-quality-gate.v1 artifacts", () => {
  test("keeps the quality-gate identity, triggers, permissions and concurrency stable", () => {
    const workflow = readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toContain("name: CI");
    expect(workflow).toMatch(/pull_request:\s*\n\s+branches:\s*\[main\]/);
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\[main\]/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(workflow).toContain(
      "group: ci-${{ github.workflow }}-${{ github.ref }}",
    );
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toMatch(
      /quality-gate:\s*\n\s+name: quality-gate\s*\n\s+runs-on: ubuntu-24\.04\s*\n\s+timeout-minutes: 45/,
    );
  });

  test("pins every third-party action to its frozen immutable SHA", () => {
    const workflow = readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toContain(
      "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6",
    );
    expect(workflow).toContain(
      "pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6",
    );
    expect(workflow).toContain(
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6",
    );
    expect(workflow).not.toMatch(/uses:\s+[^\n]+@(main|master|v\d+)\s*(?:#.*)?$/m);
  });

  test("runs the complete gate in order and always cleans up Supabase", () => {
    const workflow = readProjectFile(".github/workflows/ci.yml");
    const orderedCommands = [
      "pnpm install --frozen-lockfile",
      "pnpm exec playwright install --with-deps chromium",
      "pnpm env:check",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm db:start",
      "pnpm db:reset",
      "pnpm db:lint",
      "pnpm db:test",
      "pnpm test:integration",
      "pnpm db:types:check",
      "pnpm db:drift:check",
      "pnpm test:e2e",
      "pnpm build",
      "pnpm db:stop",
    ];
    const indexes = orderedCommands.map((command) =>
      commandIndex(workflow, command),
    );

    expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
    expect(workflow.match(/run: pnpm db:lint/g)).toHaveLength(2);
    expect(workflow).toMatch(
      /name: Stop local Supabase\s*\n\s+if: always\(\)\s*\n\s+run: pnpm db:stop/,
    );
  });

  test("contains no CI bypass or privileged pull request trigger", () => {
    const workflow = readProjectFile(".github/workflows/ci.yml");

    expect(workflow).not.toMatch(/continue-on-error|allow_failure|\|\|\s*true/);
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).not.toContain("write-all");
  });

  test("exposes the environment, drift and Preview verification commands", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["env:check"]).toBe(
      "vitest run src/shared/configuration/environment-validation.ci.test.ts",
    );
    expect(packageJson.scripts["db:drift:check"]).toBe(
      "node scripts/check-database-drift.mjs",
    );
    expect(packageJson.scripts["test:e2e:preview"]).toBe(
      "node scripts/run-preview-e2e.mjs",
    );
  });
});

describe("Dependabot contract", () => {
  test("covers npm and GitHub Actions on the frozen weekly schedule", () => {
    const dependabot = readProjectFile(".github/dependabot.yml");

    expect(dependabot).toMatch(/^version: 2/m);
    expect(dependabot.match(/package-ecosystem:/g)).toHaveLength(2);
    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');
    expect(dependabot.match(/directory: "\/"/g)).toHaveLength(2);
    expect(dependabot.match(/interval: "weekly"/g)).toHaveLength(2);
    expect(dependabot.match(/day: "monday"/g)).toHaveLength(2);
    expect(dependabot.match(/time: "09:00"/g)).toHaveLength(2);
    expect(dependabot.match(/timezone: "Asia\/Shanghai"/g)).toHaveLength(2);
    expect(dependabot.match(/target-branch: "main"/g)).toHaveLength(2);
    expect(dependabot.match(/open-pull-requests-limit: 5/g)).toHaveLength(2);
    expect(dependabot.match(/prefix: "chore\(deps\)"/g)).toHaveLength(2);
    expect(dependabot).not.toMatch(/auto-merge|automerge/);
  });
});

describe("vercel-preview.v1.2 runner", () => {
  test("binds the remote Preview assertions to the revised Contract version", () => {
    const previewSpec = readProjectFile("tests/e2e-preview/preview.spec.ts");

    expect(previewSpec).toContain("vercel-preview.v1.2");
    expect(previewSpec).not.toContain("vercel-preview.v1.1");
    expect(previewSpec).not.toMatch(/vercel-preview\.v1(?!\.2)/);
  });

  test("rejects a missing Preview URL", () => {
    const environment = { ...process.env };
    delete environment.PREVIEW_BASE_URL;

    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, "scripts/run-preview-e2e.mjs")],
      { cwd: projectRoot, encoding: "utf8", env: environment },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PREVIEW_BASE_URL is required");
  });

  test("rejects a non-HTTPS remote Preview URL", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, "scripts/run-preview-e2e.mjs")],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PREVIEW_BASE_URL: "http://preview.example.test",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PREVIEW_BASE_URL must use HTTPS");
  });

  test("uses a remote-only Playwright configuration", () => {
    const configuration = readProjectFile("playwright.preview.config.ts");

    expect(configuration).toContain('testDir: "./tests/e2e-preview"');
    expect(configuration).toContain("baseURL: process.env.PREVIEW_BASE_URL");
    expect(configuration).not.toContain("webServer");
  });
});
