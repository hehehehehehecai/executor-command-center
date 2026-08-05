import { describe, expect, it, vi } from "vitest";
import { SupabaseSelectionInstallationQuery } from "./supabase-selection-installation-query";

const userId = "a5000000-0000-4000-8000-000000000001";

function query(fetcher: typeof fetch) {
  return new SupabaseSelectionInstallationQuery({
    supabaseUrl: "https://fixture.supabase.test/",
    serviceRoleKey: "fixture-service-role-key",
    fetcher,
  });
}

describe("SupabaseSelectionInstallationQuery", () => {
  it("posts only the server user id to the narrow selection installation RPC", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        [
          {
            id: "a5100000-0000-4000-8000-000000000001",
            installation_id: 9_800_001,
            status: "active",
          },
        ],
        { status: 200 },
      ),
    );

    await expect(query(fetcher).findByUserId(userId)).resolves.toEqual({
      githubInstallationId:
        "a5100000-0000-4000-8000-000000000001",
      installationId: 9_800_001,
      status: "active",
    });

    const [url, init] = fetcher.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe(
      "/rest/v1/rpc/read_current_github_selection_installation",
    );
    expect(parsed.search).toBe("");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        apikey: "fixture-service-role-key",
        authorization: "Bearer fixture-service-role-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_user_id: userId }),
    });
  });

  it("returns null for no installation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([], { status: 200 }));

    await expect(query(fetcher).findByUserId(userId)).resolves.toBeNull();
  });

  it("fails closed on network, non-success, duplicates, malformed rows, and sensitive extras", async () => {
    const fetchers = [
      vi.fn<typeof fetch>().mockRejectedValue(new Error("network detail")),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({}, { status: 500 })),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({}, { status: 200 })),
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          [
            {
              id: "a5100000-0000-4000-8000-000000000001",
              installation_id: 9_800_001,
              status: "active",
            },
            {
              id: "a5100000-0000-4000-8000-000000000002",
              installation_id: 9_800_002,
              status: "active",
            },
          ],
          { status: 200 },
        ),
      ),
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          [
            {
              id: "a5100000-0000-4000-8000-000000000001",
              installation_id: 9_800_001,
            },
          ],
          { status: 200 },
        ),
      ),
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          [
            {
              id: "not-a-uuid",
              installation_id: 9_800_001,
              status: "active",
            },
          ],
          { status: 200 },
        ),
      ),
      ...[0, Number.MAX_SAFE_INTEGER + 1].map((installationId) =>
        vi.fn<typeof fetch>().mockResolvedValue(
          Response.json(
            [
              {
                id: "a5100000-0000-4000-8000-000000000001",
                installation_id: installationId,
                status: "active",
              },
            ],
            { status: 200 },
          ),
        ),
      ),
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          [
            {
              id: "a5100000-0000-4000-8000-000000000001",
              installation_id: 9_800_001,
              status: "unknown",
            },
          ],
          { status: 200 },
        ),
      ),
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          [
            {
              id: "a5100000-0000-4000-8000-000000000001",
              installation_id: 9_800_001,
              status: "active",
              github_account_login: "forbidden-extra",
            },
          ],
          { status: 200 },
        ),
      ),
    ];

    for (const fetcher of fetchers) {
      await expect(query(fetcher).findByUserId(userId)).rejects.toThrow(
        "github_installation_lookup_failed",
      );
    }
  });
});
