import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
describe("Phase 6 provider boundaries", () => {
  it("keeps Domain/Application free of Next, Supabase and Inngest imports", async () => {
    const results = await new ESLint({ cwd: process.cwd() }).lintFiles(["src/domain/webhooks/**/*.ts", "src/application/webhooks/**/*.ts"]);
    expect(results.flatMap((result) => result.messages)).toEqual([]);
  }, 120_000);
});
