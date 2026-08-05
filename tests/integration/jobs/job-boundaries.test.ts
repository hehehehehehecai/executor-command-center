// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Phase 3 jobs dependency boundary", () => {
  it("keeps the official Inngest dependency and lockfile in exact agreement", () => {
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const version = packageJson.dependencies?.inngest;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
    expect(lockfile).toContain(`      inngest:\n        specifier: ${version}`);
  });

  it.each(["inngest", "inngest/components", "next/server", "@supabase/supabase-js"])(
    "rejects provider/framework import %s from Application",
    async (specifier) => {
      const eslint = new ESLint({ cwd: root });
      const [result] = await eslint.lintText(
        `import type { Forbidden } from "${specifier}";`,
        { filePath: path.join(root, "src", "application", "jobs", "boundary-fixture.ts") },
      );
      expect(result.messages.some(({ ruleId }) => ruleId === "no-restricted-imports"))
        .toBe(true);
    },
    10_000,
  );
});
