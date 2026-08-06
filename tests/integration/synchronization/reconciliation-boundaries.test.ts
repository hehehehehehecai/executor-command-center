import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 7 provider boundaries", () => {
  it("keeps reconciliation Domain and Application provider-neutral", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    for (const [layer, provider] of [
      ["domain", "next/server"],
      ["domain", "@supabase/supabase-js"],
      ["domain", "inngest"],
      ["application", "next/server"],
      ["application", "@supabase/supabase-js"],
      ["application", "inngest"],
    ] as const) {
      const [result] = await eslint.lintText(`import type { Forbidden } from "${provider}";`, {
        filePath: path.join(process.cwd(), "src", layer, "synchronization", "reconciliation-boundary-fixture.ts"),
      });
      expect(result.messages.some(({ ruleId }) => ruleId === "no-restricted-imports")).toBe(true);
    }
  }, 120_000);
});
