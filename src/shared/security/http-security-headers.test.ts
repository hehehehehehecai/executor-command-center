import { describe, expect, it } from "vitest";

import { buildHttpSecurityHeaders } from "./http-security-headers";

describe("http-security-headers.v1", () => {
  it("builds a production header set without wildcard sources or unsafe-eval", () => {
    const headers = new Map(buildHttpSecurityHeaders({
      nodeEnvironment: "production",
      supabaseUrl: "https://synthetic-project.supabase.co",
      nonce: "synthetic-nonce",
    }).map(({ key, value }) => [key.toLowerCase(), value]));
    const csp = headers.get("content-security-policy") ?? "";

    expect(headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' 'nonce-synthetic-nonce' 'strict-dynamic'");
    expect(csp).toContain("https://synthetic-project.supabase.co");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain("unsafe-inline");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
  });
});
