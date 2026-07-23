import { describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "./supabase-server-client";

describe("supabase-session.v1 server cookie adapter", () => {
  it("forwards request cookies and applies response cookies plus cache headers", () => {
    const setCookies: unknown[] = [];
    const responseHeaders = new Headers();
    const clientFixture = { auth: { getUser: vi.fn() } };
    const createClient = vi.fn((_url, _key, options) => {
      expect(options.cookieOptions).toEqual({
        httpOnly: false,
        path: "/",
        sameSite: "lax",
        secure: true,
      });
      expect(options.cookies.getAll()).toEqual([
        { name: "sb-fixture-auth-token", value: "fixture-only" },
      ]);
      options.cookies.setAll(
        [
          {
            name: "sb-fixture-auth-token",
            value: "synthetic-session",
            options: { httpOnly: true, sameSite: "lax", path: "/" },
          },
        ],
        { "cache-control": "private, no-store", pragma: "no-cache" },
      );
      return clientFixture;
    });

    const result = createSupabaseServerClient({
      environment: {
        APP_ORIGIN: "https://executor.example.test",
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-only-anon-key",
      },
      cookieStore: {
        getAll: () => [
          { name: "sb-fixture-auth-token", value: "fixture-only" },
        ],
        set: (...args) => setCookies.push(args),
      },
      responseHeaders,
      createClient,
    });

    expect(result).toBe(clientFixture);
    expect(setCookies).toEqual([
      [
        "sb-fixture-auth-token",
        "synthetic-session",
        { httpOnly: true, sameSite: "lax", path: "/" },
      ],
    ]);
    expect(responseHeaders.get("cache-control")).toBe("private, no-store");
    expect(responseHeaders.get("pragma")).toBe("no-cache");
  });

  it("fails safely when Supabase public configuration is missing", () => {
    expect(() =>
      createSupabaseServerClient({
        environment: {},
        cookieStore: { getAll: () => [], set: vi.fn() },
        responseHeaders: new Headers(),
      }),
    ).toThrow("auth_configuration_missing");
  });
});
