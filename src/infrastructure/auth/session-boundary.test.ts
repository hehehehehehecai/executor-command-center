// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 2 session and client security boundary", () => {
  it("keeps the proxy limited to Supabase session refresh", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/proxy.ts"), "utf8");

    expect(source).toContain("refreshSupabaseSession");
    expect(source).not.toMatch(/UserRepository|ensureForAuthUser|github app|repository/i);
  });

  it("keeps service-role credentials and provider tokens out of client components", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/features/onboarding/github-sign-in-link.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|service_role|provider_token|access_token|refresh_token|localStorage/i,
    );
  });
});
