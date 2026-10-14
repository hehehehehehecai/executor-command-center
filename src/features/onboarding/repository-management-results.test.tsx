import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizedRepositoryList } from "./authorized-repository-list";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const repo = (id: number) => ({ id, name: `repo-${id}`, fullName: `owner/repo-${id}`, ownerLogin: "owner", isPrivate: true, isFork: false, isArchived: false, isDisabled: false, visibility: "private", defaultBranch: "main" });
const selected = (id: number) => { const { id: repositoryId, ...rest } = repo(id); return { repositoryId, ...rest, selectedAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z", calibrationStatus: "pending" }; };
const projectRepository = { id: "33333333-3333-4333-8333-333333333333", repositoryId: 1, fullName: "owner/repo-1", visibility: "private", defaultBranch: "main" };
const calibration = { id: "44444444-4444-4444-8444-444444444444", selectedRepositoryId: projectRepository.id, coreGoal: "goal", currentStageGoal: "stage", status: "in_planning", currentBlocker: null, createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" };
function network(input: { initial?: number[]; project?: boolean; post?: (id: number) => Promise<Response> } = {}) {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url === "/api/github/repository-selections") return init?.method === "POST" ? input.post!(JSON.parse(String(init.body)).repositoryId) : Response.json({ selectedRepositories: (input.initial ?? []).map(selected) });
    if (url === "/api/projects") return Response.json({ projects: input.project ? [{ repository: projectRepository, calibration }] : [] });
    if (url === "/api/github/repositories") return Response.json({ repositories: [1, 2].map(repo), totalCount: 2, repositorySelection: "selected", loadedAt: "2026-09-28T00:00:00Z" });
    throw new Error("unexpected request");
  }); vi.stubGlobal("fetch", fetcher); return fetcher;
}
async function load() { await screen.findByText("尚未选择仓库。"); fireEvent.click(screen.getByRole("button", { name: "加载已授权仓库" })); await screen.findByRole("button", { name: "选择 owner/repo-1" }); }
describe("逐仓库添加结果", () => {
  it("区分已添加项目与已选择待建项", async () => { network({ initial: [1, 2], project: true }); render(<AuthorizedRepositoryList installationStatus="active" />); expect(await screen.findByText("已添加")).toBeVisible(); expect(screen.getByText("已选择，待建项")).toBeVisible(); });
  it("部分失败保留成功项并只重试失败项", async () => {
    let second = 0;
    const f = network({ post: async id => id === 2 && ++second === 1 ? Response.json({}, { status: 503 }) : Response.json({ selectionState: "selected", selectedRepository: selected(id) }) });
    render(<AuthorizedRepositoryList installationStatus="active" />); await load();
    fireEvent.click(screen.getByRole("button", { name: "选择 owner/repo-1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "选择 owner/repo-1" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "选择 owner/repo-2" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试选择 owner/repo-2" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "已选择仓库" })).getAllByText("已选择，待建项")).toHaveLength(2));
    expect(f.mock.calls.filter(([, i]) => i?.method === "POST").map(([, i]) => JSON.parse(String(i?.body)).repositoryId)).toEqual([1, 2, 2]);
  });
  it("错误仓库的成功响应不能污染选择列表", async () => { network({ post: async () => Response.json({ selectionState: "selected", selectedRepository: selected(2) }) }); render(<AuthorizedRepositoryList installationStatus="active" />); await load(); fireEvent.click(screen.getByRole("button", { name: "选择 owner/repo-1" })); expect(await screen.findByRole("button", { name: "重试选择 owner/repo-1" })).toBeVisible(); expect(within(screen.getByRole("region", { name: "已选择仓库" })).queryByText("owner/repo-2")).not.toBeInTheDocument(); });
  it("暂停后清除旧候选项并丢弃在途选择结果", async () => {
    let finish!: (r: Response) => void; network({ post: () => new Promise(resolve => { finish = resolve; }) }); const ui = render(<AuthorizedRepositoryList installationStatus="active" />); await load(); fireEvent.click(screen.getByRole("button", { name: "选择 owner/repo-1" })); ui.rerender(<AuthorizedRepositoryList installationStatus="suspended" />);
    await act(async () => finish(Response.json({ selectionState: "selected", selectedRepository: selected(1) })));
    expect(screen.queryByText("owner/repo-1")).not.toBeInTheDocument(); expect(screen.getByText("尚未选择仓库。")).toBeVisible();
  });
  it("同一仓库双击只提交一次", async () => { let finish!: (r: Response) => void; const f = network({ post: () => new Promise(resolve => { finish = resolve; }) }); render(<AuthorizedRepositoryList installationStatus="active" />); await load(); const button = screen.getByRole("button", { name: "选择 owner/repo-1" }); fireEvent.click(button); fireEvent.click(button); expect(f.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(1); await act(async () => finish(Response.json({ selectionState: "selected", selectedRepository: selected(1) }))); });
});
