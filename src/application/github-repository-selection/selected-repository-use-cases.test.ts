import { describe, expect, it, vi } from "vitest";
import { DeselectSelectedGitHubRepository } from "./deselect-selected-github-repository";
import { ListSelectedGitHubRepositories } from "./list-selected-github-repositories";

const userId = "a5000000-0000-4000-8000-000000000001";

function selected(repositoryId: number, fullName: string) {
  const [ownerLogin = "", name = ""] = fullName.split("/");
  return {
    repositoryId,
    ownerLogin,
    name,
    fullName,
    visibility: "public" as const,
    isPrivate: false,
    isFork: false,
    isArchived: false,
    isDisabled: false,
    defaultBranch: "main",
    selectedAt: "2026-07-29T01:00:00.000Z",
    updatedAt: "2026-07-29T01:00:01.000Z",
    calibrationStatus: "pending" as const,
  };
}

describe("DeselectSelectedGitHubRepository", () => {
  it("validates session and calls only the idempotent writer remove", async () => {
    const sessionReader = {
      getVerifiedUserId: vi.fn().mockResolvedValue(userId),
    };
    const writer = {
      ensureSelected: vi.fn(),
      removeSelection: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      new DeselectSelectedGitHubRepository({
        sessionReader,
        writer,
      }).execute({ repositoryId: 9_600_001 }),
    ).resolves.toBeUndefined();

    expect(writer.removeSelection).toHaveBeenCalledWith({
      userId,
      repositoryId: 9_600_001,
    });
    expect(writer.ensureSelected).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs and unauthenticated requests before writes", async () => {
    const writer = {
      ensureSelected: vi.fn(),
      removeSelection: vi.fn(),
    };
    const invalidSessionReader = {
      getVerifiedUserId: vi.fn().mockResolvedValue(userId),
    };
    await expect(
      new DeselectSelectedGitHubRepository({
        sessionReader: invalidSessionReader,
        writer,
      }).execute({ repositoryId: 0 }),
    ).rejects.toThrow("github_repository_selection_invalid_request");
    expect(invalidSessionReader.getVerifiedUserId).not.toHaveBeenCalled();
    expect(writer.removeSelection).not.toHaveBeenCalled();

    await expect(
      new DeselectSelectedGitHubRepository({
        sessionReader: {
          getVerifiedUserId: vi.fn().mockResolvedValue(null),
        },
        writer,
      }).execute({ repositoryId: 9_600_001 }),
    ).rejects.toThrow("unauthenticated");
    expect(writer.removeSelection).not.toHaveBeenCalled();
  });

  it("maps every database failure to the fixed deselection failure", async () => {
    const writer = {
      ensureSelected: vi.fn(),
      removeSelection: vi
        .fn()
        .mockRejectedValue(new Error("raw database detail")),
    };

    await expect(
      new DeselectSelectedGitHubRepository({
        sessionReader: {
          getVerifiedUserId: vi.fn().mockResolvedValue(userId),
        },
        writer,
      }).execute({ repositoryId: 9_600_001 }),
    ).rejects.toThrow("github_repository_deselection_failed");
  });
});

describe("ListSelectedGitHubRepositories", () => {
  it("uses only Session/RLS listOwn and applies deterministic lowercase sorting", async () => {
    const reader = {
      listOwn: vi.fn().mockResolvedValue([
        selected(30, "Zulu/repository"),
        selected(20, "ALPHA/repository"),
        selected(10, "alpha/repository"),
      ]),
    };

    await expect(
      new ListSelectedGitHubRepositories({
        sessionReader: {
          getVerifiedUserId: vi.fn().mockResolvedValue(userId),
        },
        reader,
      }).execute(),
    ).resolves.toEqual([
      selected(10, "alpha/repository"),
      selected(20, "ALPHA/repository"),
      selected(30, "Zulu/repository"),
    ]);

    expect(reader.listOwn).toHaveBeenCalledWith();
  });

  it("requires a verified session before RLS reads", async () => {
    const reader = { listOwn: vi.fn() };

    await expect(
      new ListSelectedGitHubRepositories({
        sessionReader: {
          getVerifiedUserId: vi.fn().mockResolvedValue(null),
        },
        reader,
      }).execute(),
    ).rejects.toThrow("unauthenticated");
    expect(reader.listOwn).not.toHaveBeenCalled();
  });

  it("normalizes every reader failure to selection lookup failure", async () => {
    const reader = {
      listOwn: vi.fn().mockRejectedValue(new Error("raw query detail")),
    };

    await expect(
      new ListSelectedGitHubRepositories({
        sessionReader: {
          getVerifiedUserId: vi.fn().mockResolvedValue(userId),
        },
        reader,
      }).execute(),
    ).rejects.toThrow("github_repository_selection_lookup_failed");
  });
});
