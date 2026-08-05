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
    expect(url).toBe(
      "https://synthetic-project.supabase.co/rest/v1/rpc/read_current_github_installation",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        apikey: "synthetic-service-role",
        authorization: "Bearer synthetic-service-role",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    });
  });

  it("returns null when the narrow RPC has no matching installation", async () => {
    const query = new SupabaseCurrentGitHubInstallationQuery({
      supabaseUrl: "https://synthetic-project.supabase.co",
      serviceRoleKey: "synthetic-service-role",
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
    });

    await expect(query.findByUserId("user-a")).resolves.toBeNull();
  });

  it.each([
    ["non-array response", {}],
    [
      "multiple rows",
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
    ],
    ["missing field", [{ installation_id: 81001, status: "active" }]],
    [
      "non-numeric installation id",
      [
        {
          installation_id: "forged",
          repository_selection: "selected",
          status: "active",
        },
      ],
    ],
    [
      "zero installation id",
      [
        {
          installation_id: 0,
          repository_selection: "selected",
          status: "active",
        },
      ],
    ],
    [
      "unsafe installation id",
      [
        {
          installation_id: Number.MAX_SAFE_INTEGER + 1,
          repository_selection: "selected",
          status: "active",
        },
      ],
    ],
    [
      "invalid repository selection",
      [
        {
          installation_id: 81001,
          repository_selection: "partial",
          status: "active",
        },
      ],
    ],
    [
      "invalid status",
      [
        {
          installation_id: 81001,
          repository_selection: "selected",
          status: "unknown",
        },
      ],
    ],
  ])("rejects a %s from the narrow RPC", async (_case, payload) => {
    const query = new SupabaseCurrentGitHubInstallationQuery({
      supabaseUrl: "https://synthetic-project.supabase.co",
      serviceRoleKey: "synthetic-service-role",
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify(payload), { status: 200 }),
        ),
    });

    await expect(query.findByUserId("user-a")).rejects.toThrow(
      "github_installation_lookup_failed",
    );
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
