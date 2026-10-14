import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectSyncStatusView } from "@/domain/synchronization/project-onboarding-sync";
import { AuthorizedRepositoryList } from "./authorized-repository-list";

const selectionId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-30T08:00:00.000Z";
const repo = { id: 701, name: "repo", fullName: "synthetic/repo", ownerLogin: "synthetic", isPrivate: true, isFork: false, isArchived: false, isDisabled: false, visibility: "private", defaultBranch: "main" };
const selected = { repositoryId: repo.id, ownerLogin: repo.ownerLogin, name: repo.name, fullName: repo.fullName, visibility: repo.visibility, isPrivate: true, isFork: false, isArchived: false, isDisabled: false, defaultBranch: "main", selectedAt: timestamp, updatedAt: timestamp, calibrationStatus: "pending" };
const background = { coreGoal: "已保存核心目标", currentStageGoal: "已保存阶段目标", status: "in_development", currentBlocker: "已保存阻塞" };
type State = ProjectSyncStatusView["state"];
type Call = { at: string; method: string; path: string; body?: unknown };
let record: { case_id: string; initialState: State; action: string; retryRequestId: string | null; calls: Call[]; before: number } | undefined;
afterEach(() => {
  if (record && process.env.T041_RECORD_CASES === "1") console.info("T041_CASE " + JSON.stringify({ ...record, dataset_id: "t041-readonly-status-action-regression.v1", version: "1", source_case_id: "T04-F01/independent-readonly-action-reproduction.v1", lineage_id: "T04-F01/synthetic-review-account/repo701", exposure: "已曝光反例和工程回归", holdout_eligibility: "not_holdout", projectId, selectionId, repositoryId: repo.id, after: record.calls.filter(c => c.method !== "GET").length }));
  record = undefined; cleanup(); vi.unstubAllGlobals();
});

const states: readonly [State, string | null][] = [
  ["not_started", "onboarding"], ["dispatch_pending", "onboarding"],
  ["partial", "retry-33333333-3333-4333-8333-333333333333"],
  ["failed", "retry-33333333-3333-4333-8333-333333333333"],
  ["cancelled", "retry-33333333-3333-4333-8333-333333333333"],
  ["queued", null], ["running", null], ["completed", null], ["suspended", null], ["revoked", null],
];
function network(state: State, retryRequestId: string | null, caseId: string, action: string, options: { mapping?: "null" | "failed"; statusFailed?: boolean; lostStart?: boolean; delayedMapping?: () => Promise<void> } = {}) {
  const calls: Call[] = [];
  let phase = state, key = retryRequestId, projectsReads = 0, statusFailed = options.statusFailed ?? false;
  record = { case_id: caseId, initialState: state, action, retryRequestId, calls, before: 0 };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input), method = init?.method ?? "GET";
    calls.push({ at: new Date().toISOString(), path, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (path === "/api/github/repository-selections") return Response.json({ selectedRepositories: [selected] });
    if (path === "/api/projects") {
      ++projectsReads;
      if (projectsReads > 1) {
        await options.delayedMapping?.();
        if (options.mapping === "failed") return Response.json({ error: { code: "project_context_unavailable" } }, { status: 503 });
      }
      return Response.json({ projects: [{ repository: { id: selectionId, repositoryId: repo.id, fullName: repo.fullName, visibility: "private", defaultBranch: "main" }, calibration: projectsReads > 1 && options.mapping === "null" ? null : { id: projectId, selectedRepositoryId: selectionId, ...background, createdAt: timestamp, updatedAt: timestamp } }] });
    }
    if (path === `/api/projects/${projectId}/sync-status`) {
      if (statusFailed) return Response.json({ error: { code: "project_sync_status_unavailable" } }, { status: 503 });
      return Response.json({ sync: { contractVersion: "project-onboarding-sync.v1", projectId, state: phase, syncRunId: phase === "not_started" ? null : runId, queuedAt: phase === "not_started" ? null : timestamp, finishedAt: ["partial", "failed", "cancelled", "completed"].includes(phase) ? timestamp : null, retryRequestId: key } });
    }
    if (path === `/api/projects/${projectId}/first-sync`) {
      phase = "queued"; key = null;
      if (options.lostStart) throw new Error("synthetic_accepted_response_lost");
      return Response.json({ result: "accepted", code: "first_sync_accepted", syncRunId: runId, jobId: runId }, { status: 202 });
    }
    if (path === "/api/projects/from-repository") return Response.json({ project: { contractVersion: "project-context.v1", id: projectId, selectedRepositoryId: selectionId, context: background, completeness: { complete: true, missingFields: [] }, syncPreparation: { state: "ready", requested: false } } });
    throw new Error(`unexpected synthetic request ${method} ${path}`);
  }));
  return { calls, writes: () => calls.filter(c => c.method !== "GET"), setStatusFailed: () => { statusFailed = true; }, setCompleted: () => { phase = "completed"; key = null; } };
}
async function open() {
  const button = await screen.findByRole("button", { name: "查看同步状态 synthetic/repo" });
  if (record) record.before = record.calls.filter(c => c.method !== "GET").length;
  fireEvent.click(button);
  await screen.findByRole("button", { name: "刷新同步状态" });
  await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent("正在读取同步状态"));
}

describe("T04.1 已有项目查看与显式恢复分流", () => {
  it.each(states)("T041-view-%s 查看及刷新必须零写", async (state, key) => {
    const f = network(state, key, `T041-view-${state}`, "查看同步状态 synthetic/repo");
    render(<AuthorizedRepositoryList userId="synthetic-review-account" installationStatus="active" />);
    await open();
    expect(f.writes()).toEqual([]);
    const count = f.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "刷新同步状态" }));
    await waitFor(() => expect(f.calls.length).toBeGreaterThan(count));
    expect(f.writes()).toEqual([]);
    expect(f.calls.slice(count).map(c => [c.method, c.path])).toEqual([["GET", `/api/projects/${projectId}/sync-status`]]);
    expect(screen.getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${projectId}`);
  });
  it.each(states)("T041-explicit-%s 仅明确恢复使用精确服务端键", async (state, key) => {
    const action = state === "not_started" ? "启动首次同步" : key ? "重试首次同步" : "仅刷新，无恢复入口";
    const f = network(state, key, `T041-explicit-${state}`, action);
    render(<AuthorizedRepositoryList userId="synthetic-review-account" installationStatus="active" />);
    await open(); expect(f.writes()).toEqual([]);
    if (!key) {
      expect(screen.queryByRole("button", { name: /启动首次同步|重试首次同步/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "刷新同步状态" }));
      expect(f.writes()).toEqual([]); return;
    }
    const button = screen.getByRole("button", { name: action });
    fireEvent.click(button); fireEvent.click(button);
    expect(await screen.findByText("首次同步已排队")).toBeVisible();
    expect(f.writes().map(({ method, path, body }) => ({ method, path, body }))).toEqual([{ method: "POST", path: `/api/projects/${projectId}/first-sync`, body: { requestId: key } }]);
    const writeIndex = f.calls.findIndex(c => c.method === "POST");
    expect(f.calls[writeIndex - 1].path).toBe(`/api/projects/${projectId}/sync-status`);
    expect(f.calls[writeIndex + 1].path).toBe(`/api/projects/${projectId}/sync-status`);
  });
  it.each(["null", "failed"] as const)("T041-mapping-%s 查看时映射消失或读取失败不得建项", async mapping => {
    const f = network("not_started", "onboarding", `T041-mapping-${mapping}`, `mapping-${mapping}`, { mapping });
    render(<AuthorizedRepositoryList installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "查看同步状态 synthetic/repo" }));
    await screen.findByRole("alert");
    expect(f.writes()).toEqual([]);
    expect(screen.queryByRole("button", { name: "启动首次同步" })).toBeNull();
  });
  it("T041-status-failed 查看读取失败不盲启", async () => {
    const f = network("not_started", "onboarding", "T041-status-failed", "status-failed", { statusFailed: true });
    render(<AuthorizedRepositoryList installationStatus="active" />); await open();
    expect(await screen.findByText("同步状态暂时无法读取，请刷新重试。项目资料不会丢失。")).toBeVisible(); expect(f.writes()).toEqual([]);
  });
  it("T041-refresh-failed 刷新读取失败仍零写", async () => {
    const f = network("not_started", "onboarding", "T041-refresh-failed", "refresh-failed");
    render(<AuthorizedRepositoryList installationStatus="active" />); await open(); expect(f.writes()).toEqual([]);
    f.setStatusFailed(); fireEvent.click(screen.getByRole("button", { name: "刷新同步状态" }));
    expect(await screen.findByText("同步状态暂时无法读取，请刷新重试。项目资料不会丢失。")).toBeVisible(); expect(f.writes()).toEqual([]);
  });
  it("T041-stale-completed 显式启动前回读完成状态不得写", async () => {
    const f = network("not_started", "onboarding", "T041-stale-completed", "stale-completed");
    render(<AuthorizedRepositoryList installationStatus="active" />); await open(); expect(f.writes()).toEqual([]);
    f.setCompleted(); fireEvent.click(screen.getByRole("button", { name: "启动首次同步" }));
    expect(await screen.findByText("首次同步已完成")).toBeVisible(); expect(f.writes()).toEqual([]);
  });
  it("T041-explicit-lost-response 受理响应丢失后先读且双击仅写一次", async () => {
    const f = network("not_started", "onboarding", "T041-explicit-lost-response", "explicit-lost-response", { lostStart: true });
    render(<AuthorizedRepositoryList installationStatus="active" />); await open(); expect(f.writes()).toEqual([]);
    const button = screen.getByRole("button", { name: "启动首次同步" }); fireEvent.click(button); fireEvent.click(button);
    expect(await screen.findByText("首次同步已排队")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "刷新同步状态" }));
    expect(f.writes().map(c => c.body)).toEqual([{ requestId: "onboarding" }]);
    expect(f.calls.at(-1)?.method).toBe("GET");
  });
  it.each(["session-ended", "account-switched"] as const)("T041-%s-mapping 账号失效后迟到映射不得显示旧状态或写入", async kind => {
    let finish!: () => void;
    const f = network("not_started", "onboarding", `T041-${kind}-mapping`, `${kind}-mapping`, { delayedMapping: () => new Promise<void>(resolve => { finish = resolve; }) });
    const ui = render(<AuthorizedRepositoryList userId="account-A" installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "查看同步状态 synthetic/repo" }));
    await waitFor(() => expect(finish).toBeDefined());
    if (kind === "session-ended") await act(async () => window.dispatchEvent(new Event("executor:session-ended")));
    else {
      vi.stubGlobal("fetch", vi.fn<typeof fetch>(async input => Response.json(String(input) === "/api/projects" ? { projects: [] } : { selectedRepositories: [] })));
      ui.rerender(<AuthorizedRepositoryList userId="account-B" installationStatus="active" />);
    }
    await act(async () => finish());
    expect(f.writes()).toEqual([]); expect(screen.queryByRole("button", { name: "刷新同步状态" })).toBeNull();
  });
});
