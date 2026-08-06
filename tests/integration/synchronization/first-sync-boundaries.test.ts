// @vitest-environment node

import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Phase 5 first-sync module boundaries", () => {
  it("rejects all provider imports from Domain and Application synchronization", async () => {
    const eslint = new ESLint({ cwd: root });
    const cases = [
      ["domain", "@supabase/supabase-js"],
      ["domain", "inngest"],
      ["domain", "@octokit/rest"],
      ["application", "@supabase/supabase-js"],
      ["application", "inngest"],
      ["application", "@octokit/rest"],
    ] as const;

    for (const [layer, specifier] of cases) {
      const [result] = await eslint.lintText(
        `import type { Forbidden } from "${specifier}";`,
        {
          filePath: path.join(root, "src", layer, "synchronization", "boundary-fixture.ts"),
        },
      );
      expect(
        result.messages.some(({ ruleId }) => ruleId === "no-restricted-imports"),
        `${layer} must reject ${specifier}`,
      ).toBe(true);
    }
  }, 120_000);
});
