import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorizedRepositoryList } from "./authorized-repository-list";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const authorizedRepository = {
  id: 701,
  name: "synthetic-private-repository",
  fullName: "synthetic-owner/synthetic-private-repository",
  ownerLogin: "synthetic-owner",
  isPrivate: true,
  isFork: true,
  isArchived: true,
  isDisabled: true,
  visibility: "private",
  defaultBranch: "trunk",
};

const selectedRepository = {
  repositoryId: 701,
  ownerLogin: "synthetic-owner",
  name: "synthetic-private-repository",
  fullName: "synthetic-owner/synthetic-private-repository",
  visibility: "private",
  isPrivate: true,
  isFork: true,
  isArchived: true,
  isDisabled: true,
  defaultBranch: "trunk",
  selectedAt: "2026-07-29T01:00:00.000Z",
  updatedAt: "2026-07-29T01:00:01.000Z",
  calibrationStatus: "pending",
};

function selectedResponse(repositories: unknown[]) {
  return new Response(JSON.stringify({ selectedRepositories: repositories }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function authorizedResponse(repositories: unknown[]) {
  return new Response(
    JSON.stringify({
      repositorySelection: "selected",
      totalCount: repositories.length,
      repositories,
      loadedAt: "2026-07-29T01:00:00.000Z",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function postResponse(repository: unknown = selectedRepository) {
  return new Response(
    JSON.stringify({
      selectionState: "selected",
      selectedRepository: repository,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Phase 4 authorization and Phase 5 selection UI", () => {
  it("automatically restores only selections and never auto-loads GitHub authorization", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(selectedResponse([selectedRepository]));
    vi.stubGlobal("fetch", fetcher);

    render(<AuthorizedRepositoryList installationStatus="active" />);

    expect(await screen.findByText(selectedRepository.fullName)).toBeInTheDocument();
    expect(screen.getByText("not_loaded", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("1", { exact: true })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/github/repository-selections",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(fetcher).not.toHaveBeenCalledWith(
      "/api/github/repositories",
      expect.anything(),
    );
    expect(
      screen.queryByRole("button", {
        name: /Project|同步|导入|Select All/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: /Project|同步|导入|Select All/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("manually loads authorization and POSTs only repositoryId from an explicit selection", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (
        input === "/api/github/repository-selections" &&
        !init?.method
      ) {
        return selectedResponse([]);
      }
      if (input === "/api/github/repositories") {
        return authorizedResponse([authorizedRepository]);
      }
      if (
        input === "/api/github/repository-selections" &&
        init?.method === "POST"
      ) {
        return postResponse();
      }
      throw new Error(`unexpected request ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    await screen.findByText("0", { exact: true });
    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    expect(await screen.findByText("Fork")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: `选择 ${authorizedRepository.fullName}`,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: `取消选择 ${selectedRepository.fullName}`,
        }),
      ).toBeInTheDocument(),
    );
    const postCall = fetcher.mock.calls.find(
      ([url, init]) =>
        url === "/api/github/repository-selections" &&
        init?.method === "POST",
    );
    expect(postCall?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repositoryId: 701 }),
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      repositoryId: 701,
    });
    expect(postCall?.[1]?.headers).not.toHaveProperty("origin");
  });

  it("uses the server POST DTO as truth and rejects malformed or sensitive extra response fields", async () => {
    const malformed = {
      ...selectedRepository,
      fullName: "server-value/only",
      user_id: "forbidden-internal-user",
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (input === "/api/github/repository-selections" && !init?.method) {
        return selectedResponse([]);
      }
      if (input === "/api/github/repositories") {
        return authorizedResponse([authorizedRepository]);
      }
      return postResponse(malformed);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    await screen.findByText("0", { exact: true });
    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    await screen.findByText("Fork");
    fireEvent.click(
      screen.getByRole("button", {
        name: `选择 ${authorizedRepository.fullName}`,
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "仓库选择失败，请稍后重试。",
    );
    expect(screen.getByText("0", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("forbidden-internal-user")).not.toBeInTheDocument();
  });

  it("does not turn a failed or malformed Selection GET into a successful zero count", async () => {
    for (const body of [
      { error: { code: "github_repository_selection_lookup_failed" } },
      {
        selectedRepositories: [
          selectedRepository,
          { ...selectedRepository, fullName: "duplicate/id" },
        ],
      },
      {
        selectedRepositories: [
          { ...selectedRepository, selectedAt: "invalid-date" },
        ],
      },
    ]) {
      cleanup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(body), {
            status: "error" in body ? 503 : 200,
          }),
        ),
      );
      render(<AuthorizedRepositoryList installationStatus="active" />);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "已选择仓库读取失败。",
      );
      expect(screen.getByText("unknown", { exact: true })).toBeInTheDocument();
    }
  });

  it("fails closed when authorization loads but Selection state is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (input === "/api/github/repository-selections") {
        return new Response(
          JSON.stringify({
            error: {
              code: "github_repository_selection_lookup_failed",
              message: "Selected repositories could not be loaded.",
            },
          }),
          { status: 503 },
        );
      }
      if (input === "/api/github/repositories") {
        return authorizedResponse([authorizedRepository]);
      }
      throw new Error(`unexpected request ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "重新加载本地状态" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /选择|导入|创建|同步/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );

    expect(
      await screen.findByText(authorizedRepository.fullName, { exact: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("选择状态不可用")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: `选择 ${authorizedRepository.fullName}`,
      }),
    ).not.toBeInTheDocument();
  });

  it.each([
    "suspended",
    "revoked",
    "not_registered",
    "configuration_failed",
  ] as const)(
    "still restores and allows deselection while %s without loading GitHub",
    async (installationStatus) => {
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        if (input === "/api/github/repository-selections" && !init?.method) {
          return selectedResponse([selectedRepository]);
        }
        if (
          input === "/api/github/repository-selections/701" &&
          init?.method === "DELETE"
        ) {
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected request ${String(input)}`);
      });
      vi.stubGlobal("fetch", fetcher);
      render(
        <AuthorizedRepositoryList
          installationStatus={installationStatus}
        />,
      );

      fireEvent.click(
        await screen.findByRole("button", {
          name: `取消选择 ${selectedRepository.fullName}`,
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByText(selectedRepository.fullName),
        ).not.toBeInTheDocument(),
      );
      expect(fetcher).not.toHaveBeenCalledWith(
        "/api/github/repositories",
        expect.anything(),
      );
      expect(
        screen.queryByRole("button", { name: "加载已授权仓库" }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps a selected repository visible when DELETE fails and shows no raw body", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (!init?.method) return selectedResponse([selectedRepository]);
      return new Response(
        "postgres-private-repository-name-token-sentinel",
        { status: 503 },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="revoked" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: `取消选择 ${selectedRepository.fullName}`,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "取消仓库选择失败，请稍后重试。",
    );
    expect(screen.getByText(selectedRepository.fullName)).toBeInTheDocument();
    expect(
      screen.queryByText("postgres-private-repository-name-token-sentinel"),
    ).not.toBeInTheDocument();
  });

  it("prevents same-repository POST/DELETE overlap while allowing independent repository operations", async () => {
    let resolveFirstPost!: (value: Response) => void;
    const firstPost = new Promise<Response>((resolve) => {
      resolveFirstPost = resolve;
    });
    const secondAuthorized = {
      ...authorizedRepository,
      id: 702,
      name: "second",
      fullName: "synthetic-owner/second",
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (input === "/api/github/repository-selections" && !init?.method) {
        return selectedResponse([]);
      }
      if (input === "/api/github/repositories") {
        return authorizedResponse([
          authorizedRepository,
          secondAuthorized,
        ]);
      }
      if (
        input === "/api/github/repository-selections" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(String(init.body)) as {
          repositoryId: number;
        };
        if (body.repositoryId === 701) return firstPost;
        return postResponse({
          ...selectedRepository,
          repositoryId: 702,
          name: "second",
          fullName: "synthetic-owner/second",
        });
      }
      throw new Error("unexpected");
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    await screen.findByText("0", { exact: true });
    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    await screen.findByText("synthetic-owner/second");
    const firstButton = screen.getByRole("button", {
      name: `选择 ${authorizedRepository.fullName}`,
    });
    fireEvent.click(firstButton);
    expect(firstButton).toBeDisabled();
    fireEvent.click(firstButton);
    fireEvent.click(
      screen.getByRole("button", {
        name: "选择 synthetic-owner/second",
      }),
    );

    await screen.findByRole("button", {
      name: "取消选择 synthetic-owner/second",
    });
    const firstPosts = fetcher.mock.calls.filter(([, init]) => {
      if (init?.method !== "POST") return false;
      return JSON.parse(String(init.body)).repositoryId === 701;
    });
    expect(firstPosts).toHaveLength(1);
    resolveFirstPost(postResponse());
    await screen.findByRole("button", {
      name: `取消选择 ${selectedRepository.fullName}`,
    });
  });

  it("ignores stale authorized responses from an older manual load", async () => {
    let resolveOld!: (value: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(selectedResponse([]))
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(authorizedResponse([]));
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    await screen.findByText("0", { exact: true });
    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "刷新授权仓库" }),
    );
    expect(
      await screen.findByText("当前授权范围内没有仓库。"),
    ).toBeInTheDocument();
    resolveOld(authorizedResponse([authorizedRepository]));
    await waitFor(() =>
      expect(
        screen.queryByText(authorizedRepository.fullName),
      ).not.toBeInTheDocument(),
    );
  });
});
