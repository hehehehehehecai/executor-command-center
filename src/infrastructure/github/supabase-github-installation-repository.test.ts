// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { SupabaseGitHubInstallationRepository } from "./supabase-github-installation-repository";

const options = {
  supabaseUrl: "https://fixture-project.supabase.co",
  serviceRoleKey: "synthetic-service-role-key",
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Supabase GitHub installation repository", () => {
  it("creates a hash-only state through the narrow service-role RPC", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    );
    const repository = new SupabaseGitHubInstallationRepository({
      ...options,
      fetcher,
    });

    await expect(
      repository.create({
        userId: "11111111-1111-4111-8111-111111111111",
        stateHash: "a".repeat(64),
        returnTo: "/onboarding",
        expiresAt: "2026-07-23T06:10:00.000Z",
      }),
    ).resolves.toEqual({
      stateRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://fixture-project.supabase.co/rest/v1/rpc/create_github_installation_state",
      expect.objectContaining({
        method: "POST",
        headers: {
          apikey: "synthetic-service-role-key",
          authorization: "Bearer synthetic-service-role-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: "11111111-1111-4111-8111-111111111111",
          p_state_hash: "a".repeat(64),
          p_return_to: "/onboarding",
          p_expires_at: "2026-07-23T06:10:00.000Z",
        }),
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.body).not.toContain("raw_state");
  });

  it.each([
    "installation_state_invalid",
    "installation_state_expired",
    "installation_state_replayed",
    "installation_state_wrong_user",
  ])("preserves the stable state-consumption failure %s", async (failureCode) => {
    const successfulFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse("/onboarding"));
    const repository = new SupabaseGitHubInstallationRepository({
      ...options,
      fetcher: successfulFetcher,
    });

    await expect(
      repository.consume({
        userId: "11111111-1111-4111-8111-111111111111",
        stateHash: "b".repeat(64),
      }),
    ).resolves.toEqual({ returnTo: "/onboarding" });

    const failedRepository = new SupabaseGitHubInstallationRepository({
      ...options,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          { code: "P0002", message: failureCode },
          404,
        ),
      ),
    });
    await expect(
      failedRepository.consume({
        userId: "22222222-2222-4222-8222-222222222222",
        stateHash: "b".repeat(64),
      }),
    ).rejects.toThrow(failureCode);
  });

  it("reads only the current user's stable numeric GitHub identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([{ github_user_id: 71001 }]));
    const repository = new SupabaseGitHubInstallationRepository({
      ...options,
      fetcher,
    });

    await expect(
      repository.findByUserId(
        "11111111-1111-4111-8111-111111111111",
      ),
    ).resolves.toEqual({ githubUserId: 71001 });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://fixture-project.supabase.co/rest/v1/github_identities?select=github_user_id&user_id=eq.11111111-1111-4111-8111-111111111111&limit=1",
    );
    expect(init).toMatchObject({ method: "GET" });
  });

  it("registers only already-verified fields through the atomic storage RPC", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    );
    const repository = new SupabaseGitHubInstallationRepository({
      ...options,
      fetcher,
    });

    await expect(
      repository.registerVerified({
        userId: "11111111-1111-4111-8111-111111111111",
        installationId: 81001,
        githubAccountId: 71001,
        githubAccountLogin: "synthetic-user",
        accountType: "User",
        repositorySelection: "selected",
        status: "active",
        suspendedAt: null,
        verifiedAt: "2026-07-23T06:00:00.000Z",
      }),
    ).resolves.toEqual({
      installationRecordId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://fixture-project.supabase.co/rest/v1/rpc/register_verified_github_installation",
    );
    expect(init?.body).toBe(
      JSON.stringify({
        p_user_id: "11111111-1111-4111-8111-111111111111",
        p_installation_id: 81001,
        p_github_account_id: 71001,
        p_github_account_login: "synthetic-user",
        p_account_type: "User",
        p_repository_selection: "selected",
        p_status: "active",
        p_suspended_at: null,
        p_verified_at: "2026-07-23T06:00:00.000Z",
      }),
    );
    expect(String(init?.body)).not.toContain("jwt");
    expect(String(init?.body)).not.toContain("access_token");
    expect(String(init?.body)).not.toContain("repositories");
  });

  it("maps a cross-user storage claim without exposing raw RPC details", async () => {
    const repository = new SupabaseGitHubInstallationRepository({
      ...options,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            code: "P0001",
            message: "github_installation_already_bound",
            details: "sensitive-database-detail",
          },
          409,
        ),
      ),
    });

    await repository
      .registerVerified({
        userId: "22222222-2222-4222-8222-222222222222",
        installationId: 81001,
        githubAccountId: 71002,
        githubAccountLogin: "synthetic-user-b",
        accountType: "User",
        repositorySelection: "all",
        status: "active",
        suspendedAt: null,
        verifiedAt: "2026-07-23T06:00:00.000Z",
      })
      .catch((error: unknown) => {
        expect(error).toEqual(
          new Error("github_installation_already_bound"),
        );
        expect(String(error)).not.toContain("sensitive-database-detail");
      });
  });
});
