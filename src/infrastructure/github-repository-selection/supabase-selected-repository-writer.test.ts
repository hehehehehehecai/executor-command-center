import { describe, expect, it, vi } from "vitest";
import { SupabaseSelectedRepositoryWriter } from "./supabase-selected-repository-writer";

const userId = "a5000000-0000-4000-8000-000000000001";
const installationId = "a5100000-0000-4000-8000-000000000001";

const repository = {
  id: 960001,
  ownerLogin: "verified-owner",
  name: "verified-repository",
  fullName: "verified-owner/verified-repository",
  visibility: "private" as const,
  isPrivate: true,
  isFork: false,
  isArchived: false,
  isDisabled: false,
  defaultBranch: "main",
};

const selectedRow = {
  id: "a5200000-0000-4000-8000-000000000001",
  user_id: userId,
  github_installation_id: installationId,
  github_repository_id: 960001,
  owner_login: "verified-owner",
  name: "verified-repository",
  full_name: "verified-owner/verified-repository",
  visibility: "private",
  is_private: true,
  is_fork: false,
  is_archived: false,
  is_disabled: false,
  default_branch: "main",
  selected_at: "2026-07-29T01:00:00.000Z",
  created_at: "2026-07-29T01:00:00.000Z",
  updated_at: "2026-07-29T01:00:01.000Z",
};

function createWriter(fetcher: typeof fetch) {
  return new SupabaseSelectedRepositoryWriter({
    supabaseUrl: "https://fixture.supabase.test/",
    serviceRoleKey: "fixture-service-role-key",
    fetcher,
  });
}

describe("SupabaseSelectedRepositoryWriter", () => {
  it("calls only the narrow ensure RPC with service-verified identity and metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(selectedRow, { status: 200 }),
    );

    await expect(
      createWriter(fetcher).ensureSelected({
        userId,
        githubInstallationId: installationId,
        repository,
      }),
    ).resolves.toEqual({
      repositoryId: 960001,
      ownerLogin: "verified-owner",
      name: "verified-repository",
      fullName: "verified-owner/verified-repository",
      visibility: "private",
      isPrivate: true,
      isFork: false,
      isArchived: false,
      isDisabled: false,
      defaultBranch: "main",
      selectedAt: "2026-07-29T01:00:00.000Z",
      updatedAt: "2026-07-29T01:00:01.000Z",
      calibrationStatus: "pending",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://fixture.supabase.test/rest/v1/rpc/ensure_selected_github_repository",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        apikey: "fixture-service-role-key",
        authorization: "Bearer fixture-service-role-key",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      p_user_id: userId,
      p_github_installation_id: installationId,
      p_github_repository_id: 960001,
      p_owner_login: "verified-owner",
      p_name: "verified-repository",
      p_full_name: "verified-owner/verified-repository",
      p_visibility: "private",
      p_is_private: true,
      p_is_fork: false,
      p_is_archived: false,
      p_is_disabled: false,
      p_default_branch: "main",
    });
  });

  it.each([
    "github_repository_selection_installation_not_found",
    "github_repository_selection_installation_wrong_user",
    "github_repository_selection_installation_not_active",
    "github_repository_selection_installation_mismatch",
    "github_repository_selection_storage_failed",
  ])("preserves only the exact allowlisted database failure %s", async (code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ message: code }, { status: 400 }),
    );

    await expect(
      createWriter(fetcher).ensureSelected({
        userId,
        githubInstallationId: installationId,
        repository,
      }),
    ).rejects.toThrow(code);
  });

  it("maps unknown RPC, network, and malformed result failures to storage failure", async () => {
    const unknownDatabaseError = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { message: "duplicate key value exposes raw database detail" },
        { status: 409 },
      ),
    );
    const malformedResult = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ...selectedRow, access_token: "forbidden-extra-field" },
        { status: 200 },
      ),
    );
    const invalidTime = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ...selectedRow, selected_at: "not-a-timestamp" },
        { status: 200 },
      ),
    );
    const networkFailure = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("socket included private details"));

    for (const fetcher of [
      unknownDatabaseError,
      malformedResult,
      invalidTime,
      networkFailure,
    ]) {
      await expect(
        createWriter(fetcher).ensureSelected({
          userId,
          githubInstallationId: installationId,
          repository,
        }),
      ).rejects.toThrow("github_repository_selection_storage_failed");
    }
  });

  it("uses the narrow idempotent remove RPC and accepts an empty success body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      createWriter(fetcher).removeSelection({
        userId,
        repositoryId: 960001,
      }),
    ).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://fixture.supabase.test/rest/v1/rpc/remove_selected_github_repository",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      p_user_id: userId,
      p_github_repository_id: 960001,
    });
  });

  it("never exposes a raw remove RPC failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { message: "permission denied for table selected_repositories" },
        { status: 500 },
      ),
    );

    await expect(
      createWriter(fetcher).removeSelection({
        userId,
        repositoryId: 960001,
      }),
    ).rejects.toThrow("github_repository_selection_storage_failed");
  });
});
