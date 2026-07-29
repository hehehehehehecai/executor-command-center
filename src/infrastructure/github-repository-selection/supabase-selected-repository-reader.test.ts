import { describe, expect, it, vi } from "vitest";
import { SupabaseSelectedRepositoryReader } from "./supabase-selected-repository-reader";

const row = {
  github_repository_id: 960001,
  owner_login: "selected-owner",
  name: "selected-repository",
  full_name: "selected-owner/selected-repository",
  visibility: "private",
  is_private: true,
  is_fork: false,
  is_archived: false,
  is_disabled: false,
  default_branch: "main",
  selected_at: "2026-07-29T01:00:00.000Z",
  updated_at: "2026-07-29T01:00:01.000Z",
};

function sessionClient(result: {
  readonly data: unknown;
  readonly error: unknown;
}) {
  const select = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => ({ select }));

  return { client: { from }, from, select };
}

describe("SupabaseSelectedRepositoryReader", () => {
  it("uses only the request session client and lets RLS scope listOwn", async () => {
    const { client, from, select } = sessionClient({
      data: [row],
      error: null,
    });

    await expect(
      new SupabaseSelectedRepositoryReader(client).listOwn(),
    ).resolves.toEqual([
      {
        repositoryId: 960001,
        ownerLogin: "selected-owner",
        name: "selected-repository",
        fullName: "selected-owner/selected-repository",
        visibility: "private",
        isPrivate: true,
        isFork: false,
        isArchived: false,
        isDisabled: false,
        defaultBranch: "main",
        selectedAt: "2026-07-29T01:00:00.000Z",
        updatedAt: "2026-07-29T01:00:01.000Z",
        calibrationStatus: "pending",
      },
    ]);

    expect(from).toHaveBeenCalledWith("selected_repositories");
    expect(select).toHaveBeenCalledWith(
      [
        "github_repository_id",
        "owner_login",
        "name",
        "full_name",
        "visibility",
        "is_private",
        "is_fork",
        "is_archived",
        "is_disabled",
        "default_branch",
        "selected_at",
        "updated_at",
      ].join(","),
    );
  });

  it("fails closed on query errors, malformed rows, duplicate IDs, and sensitive extras", async () => {
    const cases = [
      {
        data: null,
        error: { message: "raw database error" },
      },
      {
        data: [{ ...row, selected_at: "invalid" }],
        error: null,
      },
      {
        data: [row, { ...row, full_name: "duplicate/id" }],
        error: null,
      },
      {
        data: [{ ...row, user_id: "forbidden-sensitive-extra" }],
        error: null,
      },
    ];

    for (const result of cases) {
      const { client } = sessionClient(result);

      await expect(
        new SupabaseSelectedRepositoryReader(client).listOwn(),
      ).rejects.toThrow("github_repository_selection_lookup_failed");
    }
  });
});
