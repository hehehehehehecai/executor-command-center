import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { refreshSupabaseSession } from "./update-session";

describe("supabase-session.v1 refresh boundary", () => {
  it("refreshes the verified auth session and copies cookies to the response", async () => {
    let getUserCalls = 0;
    const request = new NextRequest("https://executor.example.test/onboarding", {
      headers: { cookie: "existing=fixture-only" },
    });

    const response = await refreshSupabaseSession({
      request,
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-only-anon-key",
      },
      createClient(_url, _key, options) {
        expect(options.cookieOptions).toEqual({
          httpOnly: false,
          path: "/",
          sameSite: "lax",
          secure: true,
        });
        expect(options.cookies.getAll()).toEqual([
          { name: "existing", value: "fixture-only" },
        ]);
        options.cookies.setAll(
          [
            {
              name: "sb-fixture-auth-token",
              value: "synthetic-session",
              options: { path: "/", sameSite: "lax" },
            },
          ],
          { "cache-control": "private, no-store" },
        );
        return {
          auth: {
            async getUser() {
              getUserCalls += 1;
              return { data: { user: null }, error: null };
            },
          },
        };
      },
    });

    expect(getUserCalls).toBe(1);
    expect((response as NextResponse).cookies.get("sb-fixture-auth-token")?.value).toBe(
      "synthetic-session",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails closed with Retry-After when the authenticated database bucket is exhausted", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 17 }],
      error: null,
    });
    const request = new NextRequest(
      "https://executor.example.test/api/projects/20000000-0000-4000-8000-000000000002/briefs/generate",
      { method: "POST", headers: { "x-forwarded-for": "attacker-controlled" } },
    );
    const response = await refreshSupabaseSession({
      request,
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-only-anon-key",
      },
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "10000000-0000-4000-8000-000000000001" } }, error: null }) },
        rpc,
      }),
    });

    expect(rpc).toHaveBeenCalledWith("consume_beta_rate_limit", { p_scope: "project_brief_generate" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toEqual({ error: { code: "rate_limited" } });
  });
});
