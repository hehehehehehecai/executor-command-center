import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizedRepositoryList } from "./authorized-repository-list";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const selectionId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-30T08:00:00.000Z";
const repo = { id: 701, name: "repo", fullName: "synthetic/repo", ownerLogin: "synthetic", isPrivate: true, isFork: false, isArchived: false, isDisabled: false, visibility: "private", defaultBranch: "main" };
const selected = { repositoryId: repo.id, ownerLogin: repo.ownerLogin, name: repo.name, fullName: repo.fullName, visibility: repo.visibility, isPrivate: true, isFork: false, isArchived: false, isDisabled: false, defaultBranch: "main", selectedAt: timestamp, updatedAt: timestamp, calibrationStatus: "pending" };
const project = { contractVersion: "project-context.v1", id: projectId, selectedRepositoryId: selectionId, context: { coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null }, completeness: { complete: false, missingFields: ["coreGoal", "currentStageGoal", "status"] }, syncPreparation: { state: "ready", requested: false } };

function network(options: { selected?: boolean; exists?: boolean; loseCreate?: boolean; loseStart?: boolean; failCreate?: boolean; failRead?: boolean; delayCreate?: () => Promise<void> } = {}) {
  let isSelected = options.selected ?? false, exists = options.exists ?? false, started = false;
  let loseCreate = options.loseCreate ?? false, loseStart = options.loseStart ?? false;
  let phase = "queued";
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    if (init?.method === "POST") writes.push({ path, body: JSON.parse(String(init.body)) });
    if (path === "/api/github/repositories") return Response.json({ repositorySelection: "selected", totalCount: 1, repositories: [repo], loadedAt: timestamp });
    if (path === "/api/github/repository-selections") {
      if (init?.method === "POST") { isSelected = true; return Response.json({ selectionState: "selected", selectedRepository: selected }); }
      return Response.json({ selectedRepositories: isSelected ? [selected] : [] });
    }
    if (path === "/api/projects") return Response.json({ projects: isSelected ? [{ repository: { id: selectionId, repositoryId: repo.id, fullName: repo.fullName, visibility: "private", defaultBranch: "main" }, calibration: exists ? { id: projectId, selectedRepositoryId: selectionId, ...project.context, createdAt: timestamp, updatedAt: timestamp } : null }] : [] });
    if (path === "/api/projects/from-repository") {
      if (options.failCreate) return Response.json({ error: { code: "project_context_unavailable" } }, { status: 503 });
      exists = true; await options.delayCreate?.();
      if (loseCreate) { loseCreate = false; throw new Error("synthetic_response_lost"); }
      return Response.json({ project });
    }
    if (path === `/api/projects/${projectId}/first-sync`) {
      started = true;
      if (loseStart) { loseStart = false; throw new Error("synthetic_response_lost"); }
      return Response.json({ result: "accepted", code: "first_sync_accepted", syncRunId: runId, jobId: runId }, { status: 202 });
    }
    if (path === `/api/projects/${projectId}/sync-status`) {
      if (options.failRead) return Response.json({ error: { code: "project_sync_status_unavailable" } }, { status: 503 });
      return Response.json({ sync: { contractVersion: "project-onboarding-sync.v1", projectId, state: started ? phase : "not_started", syncRunId: started ? runId : null, queuedAt: started ? timestamp : null, finishedAt: started && phase === "completed" ? timestamp : null, retryRequestId: started && phase === "completed" ? null : "onboarding" } });
    }
    throw new Error(`unexpected ${path}`);
  }));
  return { writes, setPhase: (value: string) => { phase = value; } };
}
async function select() { fireEvent.click(await screen.findByRole("button", { name: "加载已授权仓库" })); fireEvent.click(await screen.findByRole("button", { name: "选择 synthetic/repo" })); }

describe("T04 repository handoff", () => {
  it("creates with only the selected ID and starts sync without any background form", async () => {
    const f = network(); render(<AuthorizedRepositoryList installationStatus="active" />); await select();
    await waitFor(() => expect(f.writes.map(w => w.path)).toEqual(["/api/github/repository-selections", "/api/projects/from-repository", `/api/projects/${projectId}/first-sync`]));
    expect(f.writes[1].body).toEqual({ selectedRepositoryId: selectionId });
    expect(f.writes[2].body).toEqual({ requestId: "onboarding" });
    expect(await screen.findByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${projectId}`);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(await screen.findByText("首次同步已排队")).toBeVisible();
  });
  it("only reads on load and explicitly continues a historical selection", async () => {
    const f = network({ selected: true }); render(<AuthorizedRepositoryList installationStatus="active" />);
    const button = await screen.findByRole("button", { name: "继续接入 synthetic/repo" }); expect(f.writes).toHaveLength(0);
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(f.writes).toHaveLength(2));
    expect(f.writes.filter(w => w.path.includes("from-repository"))).toHaveLength(1);
  });
  it("keeps a committed project when creation response is lost and resumes by reading", async () => {
    const f = network({ selected: true, loseCreate: true }); render(<AuthorizedRepositoryList installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "继续接入 synthetic/repo" }));
    await waitFor(() => expect(f.writes.some(w => w.path.endsWith("first-sync"))).toBe(true));
    expect(f.writes.filter(w => w.path.endsWith("from-repository"))).toHaveLength(1);
    expect(await screen.findByRole("link", { name: "进入项目" })).toBeVisible();
  });
  it("does not send another start after an accepted response is lost; refreshing is read-only", async () => {
    const f = network({ selected: true, loseStart: true }); render(<AuthorizedRepositoryList installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "继续接入 synthetic/repo" }));
    expect(await screen.findByText("首次同步已排队")).toBeVisible();
    const before = f.writes.length; f.setPhase("completed");
    fireEvent.click(screen.getByRole("button", { name: "刷新同步状态" }));
    expect(await screen.findByText("首次同步已完成")).toBeVisible(); expect(f.writes).toHaveLength(before);
  });
  it("keeps a failed creation selected and offers a per-repository recovery action", async () => {
    network({ failCreate: true }); render(<AuthorizedRepositoryList installationStatus="active" />); await select();
    const region = within(screen.getByRole("region", { name: "已选择仓库" }));
    expect(await region.findByRole("button", { name: "继续接入 synthetic/repo" })).toBeEnabled();
    expect(await region.findByRole("alert")).toHaveTextContent("项目");
  });
  it("does not continue to sync after the session ends while creation is pending", async () => {
    let finish!: () => void;
    const f = network({ selected: true, delayCreate: () => new Promise<void>(resolve => { finish = resolve; }) });
    render(<AuthorizedRepositoryList installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "继续接入 synthetic/repo" }));
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => { window.dispatchEvent(new Event("executor:session-ended")); finish(); });
    expect(f.writes.some(w => w.path.endsWith("first-sync"))).toBe(false);
  });
  it("drops account A's late creation after mounting account B", async () => {
    let finish!: () => void;
    const f = network({ selected: true, delayCreate: () => new Promise<void>(resolve => { finish = resolve; }) });
    const ui = render(<AuthorizedRepositoryList userId="account-A" installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "继续接入 synthetic/repo" })); await waitFor(() => expect(finish).toBeDefined());
    const accountAFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>((input, init) => String(input) === "/api/projects" ? Promise.resolve(Response.json({ projects: [] })) : String(input) === "/api/github/repository-selections" && init?.method !== "POST" ? Promise.resolve(Response.json({ selectedRepositories: [] })) : accountAFetch(input, init)));
    ui.rerender(<AuthorizedRepositoryList userId="account-B" installationStatus="active" />);
    await act(async () => finish()); expect(f.writes.some(w => w.path.endsWith("first-sync"))).toBe(false);
    expect(screen.queryByRole("link", { name: "进入项目" })).toBeNull();
  });
  it("retains a known project when status cannot be read and does not start blindly", async () => {
    const f = network({ selected: true, failRead: true }); render(<AuthorizedRepositoryList installationStatus="active" />);
    fireEvent.click(await screen.findByRole("button", { name: "继续接入 synthetic/repo" }));
    expect(await screen.findByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${projectId}`);
    expect(await screen.findByText("同步状态暂时无法读取，请刷新重试。项目资料不会丢失。")).toBeVisible(); expect(f.writes.some(w => w.path.endsWith("first-sync"))).toBe(false);
  });
  it("keeps two repository results separate and retries only the failed project", async () => {
    const f = network(); const base = globalThis.fetch;
    const selectionB = "44444444-4444-4444-8444-444444444444", projectB = "55555555-5555-4555-8555-555555555555";
    const repoB = { ...repo, id: 702, name: "second", fullName: "synthetic/second" };
    let selectedB = false, createdB = false, startedB = false, rejectB = true;
    const writesB: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path === "/api/github/repositories") return Response.json({ repositorySelection: "selected", totalCount: 2, repositories: [repo, repoB], loadedAt: timestamp });
      if (path === "/api/github/repository-selections") {
        const rowB = { ...selected, repositoryId: repoB.id, name: repoB.name, fullName: repoB.fullName };
        if (init?.method === "POST" && JSON.parse(String(init.body)).repositoryId === repoB.id) { selectedB = true; return Response.json({ selectionState: "selected", selectedRepository: rowB }); }
        if (init?.method !== "POST") { const body = await (await base(input, init)).json(); return Response.json({ selectedRepositories: [...body.selectedRepositories, ...(selectedB ? [rowB] : [])] }); }
      }
      if (path === "/api/projects") {
        const body = await (await base(input, init)).json();
        return Response.json({ projects: [...body.projects, ...(selectedB ? [{ repository: { id: selectionB, repositoryId: repoB.id, fullName: repoB.fullName, visibility: "private", defaultBranch: "main" }, calibration: createdB ? { id: projectB, selectedRepositoryId: selectionB, ...project.context, createdAt: timestamp, updatedAt: timestamp } : null }] : [])] });
      }
      if (path === "/api/projects/from-repository" && JSON.parse(String(init?.body)).selectedRepositoryId === selectionB) {
        writesB.push("create"); if (rejectB) return Response.json({ error: { code: "project_context_unavailable" } }, { status: 503 });
        createdB = true; return Response.json({ project: { ...project, id: projectB, selectedRepositoryId: selectionB } });
      }
      if (path === `/api/projects/${projectB}/first-sync`) { writesB.push("start"); startedB = true; return Response.json({ result: "accepted", code: "first_sync_accepted", syncRunId: runId, jobId: runId }, { status: 202 }); }
      if (path === `/api/projects/${projectB}/sync-status`) return Response.json({ sync: { contractVersion: "project-onboarding-sync.v1", projectId: projectB, state: startedB ? "queued" : "not_started", syncRunId: startedB ? runId : null, queuedAt: startedB ? timestamp : null, finishedAt: null, retryRequestId: "onboarding" } });
      return base(input, init);
    }));
    render(<AuthorizedRepositoryList installationStatus="active" />); await select();
    expect(await screen.findByText("首次同步已排队")).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "选择 synthetic/second" }));
    const recovery = await screen.findByRole("button", { name: "继续接入 synthetic/second" }); await waitFor(() => expect(recovery).toBeEnabled());
    const firstWrites = f.writes.length; rejectB = false; fireEvent.click(recovery);
    await waitFor(() => expect(screen.getAllByText("首次同步已排队")).toHaveLength(2));
    expect(f.writes).toHaveLength(firstWrites); expect(writesB).toEqual(["create", "create", "start"]);
    expect(screen.getAllByRole("link", { name: "进入项目" }).map(link => link.getAttribute("href"))).toEqual([`/project-galaxy?mode=connected&project=${projectId}`, `/project-galaxy?mode=connected&project=${projectB}`]);
  });
});
