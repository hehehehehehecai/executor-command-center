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

const repository = {
  id: 701,
  name: "synthetic-private-repository",
  fullName: "synthetic-owner/synthetic-private-repository",
  ownerLogin: "synthetic-owner",
  isPrivate: true,
  isFork: false,
  isArchived: true,
  isDisabled: true,
  visibility: "private",
  defaultBranch: "trunk",
};

function response(repositories: unknown[]) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        repositorySelection: "selected",
        totalCount: repositories.length,
        repositories,
        loadedAt: "2026-07-27T05:30:00.000Z",
      }),
      { status: 200 },
    ),
  );
}

describe("authorized repository read-only UI", () => {
  it("renders loading then a minimal list and loaded count", async () => {
    const fetcher = vi.fn().mockReturnValue(response([repository]));
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    expect(screen.getByText("not_loaded", { exact: true })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    expect(screen.getByText("仓库正在加载")).toBeInTheDocument();
    expect(await screen.findByText(repository.fullName)).toBeInTheDocument();
    expect(screen.getByText("loaded", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("1", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("默认分支：trunk")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/github/repositories", {
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /选择|导入|创建|同步/ }),
    ).not.toBeInTheDocument();
  });

  it("renders zero repositories as a successful empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response([])));
    render(<AuthorizedRepositoryList installationStatus="active" />);

    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    expect(await screen.findByText("当前授权范围内没有仓库。")).toBeInTheDocument();
    expect(screen.getByText("loaded", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("0", { exact: true })).toBeInTheDocument();
  });

  it("renders a safe error and reloads without exposing the upstream body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("private-repository-name-sentinel", { status: 502 }),
      )
      .mockReturnValueOnce(response([]));
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus="active" />);

    fireEvent.click(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    );
    expect(await screen.findByText("仓库读取失败。")).toBeInTheDocument();
    expect(screen.queryByText("private-repository-name-sentinel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("当前授权范围内没有仓库。")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["suspended", "Installation 已暂停，无法读取仓库。"],
    ["revoked", "Installation 已撤销，无法读取仓库。"],
  ] as const)("does not fetch for %s", async (status, message) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<AuthorizedRepositoryList installationStatus={status} />);

    expect(screen.getByText(message)).toBeInTheDocument();
    await waitFor(() => expect(fetcher).not.toHaveBeenCalled());
  });
});
