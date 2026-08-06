// @vitest-environment node

import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Phase 4 GitHub activity module boundaries", () => {
  it.each([
    ["domain", "@octokit/rest"],
    ["domain", "undici"],
    ["domain", "node-fetch"],
    ["application", "@octokit/rest"],
    ["application", "undici"],
    ["application", "node-fetch"],
  ])("rejects %s import of provider HTTP type %s", async (layer, specifier) => {
    const eslint = new ESLint({ cwd: root });
    const [result] = await eslint.lintText(
      `import type { Forbidden } from "${specifier}";`,
      {
        filePath: path.join(
          root,
          "src",
          layer,
          "github-activity",
          "boundary-fixture.ts",
        ),
      },
    );
    expect(result.messages.some(({ ruleId }) => ruleId === "no-restricted-imports"))
      .toBe(true);
  }, 10_000);
});
