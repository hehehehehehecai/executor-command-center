// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { SupabaseCurrentGitHubInstallationQuery } from "./supabase-current-github-installation-query";

describe("Supabase current GitHub installation query", () => {
  it("reads only the unique installation bound to the verified user", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            installation_id: 81001,
            repository_selection: "selected",
            status: "active",
          },
        ]),
        { status: 200 },
      ),
    );
    const query = new SupabaseCurrentGitHubInstallationQuery({
      supabaseUrl: "https://synthetic-project.supabase.co",
      serviceRoleKey: "synthetic-service-role",
      fetcher,
    });

    await expect(
      query.findByUserId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).resolves.toEqual({
      installationId: 81001,
      repositorySelection: "selected",
      status: "active",
    });

    const [url, init] = fetcher.mock.calls[0]!;
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.pathname).toBe("/rest/v1/github_installations");
    expect(parsedUrl.searchParams.get("user_id")).toBe(
      "eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(parsedUrl.searchParams.get("select")).toBe(
      "installation_id,repository_selection,status",
    );
    expect(parsedUrl.searchParams.get("limit")).toBe("2");
    expect(init).toMatchObject({ method: "GET" });
    expect(JSON.stringify(init)).not.toMatch(/body|POST|PATCH|DELETE/i);
  });

  it("returns null for no record and rejects duplicate/corrupt/cross-user results", async () => {
    const responses = [
      [],
      [
        {
          installation_id: 81001,
          repository_selection: "selected",
          status: "active",
        },
        {
          installation_id: 81002,
          repository_selection: "all",
          status: "active",
        },
      ],
      [
        {
          installation_id: "forged",
          repository_selection: "selected",
          status: "active",
        },
      ],
    ];

    for (const payload of responses) {
      const query = new SupabaseCurrentGitHubInstallationQuery({
        supabaseUrl: "https://synthetic-project.supabase.co",
        serviceRoleKey: "synthetic-service-role",
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify(payload), { status: 200 }),
          ),
      });

      if (payload.length === 0) {
        await expect(query.findByUserId("user-a")).resolves.toBeNull();
      } else {
        await expect(query.findByUserId("user-a")).rejects.toThrow(
          "github_installation_lookup_failed",
        );
      }
    }
  });

  it("maps HTTP and malformed JSON failures without exposing the body", async () => {
    for (const response of [
      new Response("raw-sensitive-database-error", { status: 500 }),
      new Response("{", { status: 200 }),
    ]) {
      const query = new SupabaseCurrentGitHubInstallationQuery({
        supabaseUrl: "https://synthetic-project.supabase.co",
        serviceRoleKey: "synthetic-service-role",
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
      });

      await expect(query.findByUserId("user-a")).rejects.toThrow(
        "github_installation_lookup_failed",
      );
    }
  });
});
