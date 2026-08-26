import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("http-security-headers.v1 proxy CSP", () => {
  it("forwards the same CSP and nonce to the renderer that it returns to the browser", async () => {
    const response = await proxy(new NextRequest("https://executor.example.test/project-galaxy"));
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? "";
    const requestCsp = response.headers.get("x-middleware-request-content-security-policy") ?? "";
    const requestNonce = response.headers.get("x-middleware-request-x-nonce") ?? "";

    expect(nonce).not.toBe("");
    expect(requestCsp).toBe(csp);
    expect(requestNonce).toBe(nonce);
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
