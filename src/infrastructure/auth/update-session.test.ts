import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

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
    expect(response.cookies.get("sb-fixture-auth-token")?.value).toBe(
      "synthetic-session",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
