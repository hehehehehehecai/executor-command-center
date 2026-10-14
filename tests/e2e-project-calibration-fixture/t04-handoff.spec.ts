import { openOnboardingSection } from "../onboarding-ui-fixture-actions";
import { expect, test, type Page } from "@playwright/test";

// Browser-only synthetic transport. Real Auth/RLS/storage is covered separately
// by tests/integration/project-context/onboarding-handoff.test.ts.
const at = "2026-09-30T08:00:00.000Z";
const selectionId = "44111111-1111-4111-8111-111111111111";
const projectId = "44222222-2222-4222-8222-222222222222";
const runId = "44333333-3333-4333-8333-333333333333";
const repo = { id: 44701, name: "browser-repo", fullName: "synthetic-t04/browser-repo", ownerLogin: "synthetic-t04", visibility: "private", isPrivate: true, isFork: false, isArchived: false, isDisabled: false, defaultBranch: "main" };
const selectedRow = { repositoryId: repo.id, ownerLogin: repo.ownerLogin, name: repo.name, fullName: repo.fullName, visibility: repo.visibility, isPrivate: true, isFork: false, isArchived: false, isDisabled: false, defaultBranch: "main", selectedAt: at, updatedAt: at, calibrationStatus: "pending" };
const background = { coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null };
const observed = new WeakMap<Page, { at: string; method: string; path: string; body?: unknown }[]>();
test.beforeEach(async ({ page }) => {
  const calls: { at: string; method: string; path: string; body?: unknown }[] = []; observed.set(page, calls);
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/projects") && path !== "/api/github/repository-selections") return;
    calls.push({ at: new Date().toISOString(), method: request.method(), path, ...(request.postData() ? { body: request.postDataJSON() } : {}) });
  });
});
test.afterEach(async ({ page }, info) => {
  console.info("T041_BROWSER_CASE " + JSON.stringify({ case_id: info.title, dataset_id: "t041-readonly-status-action-regression.v1", version: "1", lineage_id: "synthetic-t04/browser-repo", source_case_id: "T04-F01/independent-readonly-action-reproduction.v1", exposure: "已曝光反例和工程回归", holdout_eligibility: "not_holdout", projectId, selectionId, repositoryId: repo.id, calls: observed.get(page) ?? [], result: info.status, real_case_count: 0 }));
});
async function fixture(page: Page, options: { selected?: boolean; exists?: boolean; phase?: string; failCreate?: boolean; failStart?: boolean; loseCreate?: boolean; loseStart?: boolean; delayCreate?: () => Promise<void> } = {}) {
  let selected = options.selected ?? false, exists = options.exists ?? false, phase = options.phase ?? "not_started";
  let failedCreate = options.failCreate ?? false, failedStart = options.failStart ?? false;
  const writes: { path: string; body: unknown }[] = [];
  const external: string[] = [];
  page.on("request", r => { if (!["http://127.0.0.1:3004", "http://127.0.0.1:54334"].includes(new URL(r.url()).origin)) external.push(r.url()); });
  await page.route("**/api/github/repositories", route => route.fulfill({ json: { repositorySelection: "selected", totalCount: 1, repositories: [repo], loadedAt: at } }));
  await page.route("**/api/github/repository-selections", async route => {
    if (route.request().method() === "POST") { writes.push({ path: "select", body: route.request().postDataJSON() }); selected = true; await route.fulfill({ json: { selectionState: "selected", selectedRepository: selectedRow } }); }
    else await route.fulfill({ json: { selectedRepositories: selected ? [selectedRow] : [] } });
  });
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: selected ? [{ repository: { id: selectionId, repositoryId: repo.id, fullName: repo.fullName, visibility: "private", defaultBranch: "main" }, calibration: exists ? { id: projectId, selectedRepositoryId: selectionId, ...background, createdAt: at, updatedAt: at } : null }] : [] } }));
  await page.route("**/api/projects/from-repository", async route => {
    writes.push({ path: "create", body: route.request().postDataJSON() });
    if (failedCreate) return route.fulfill({ status: 503, json: { error: { code: "project_context_unavailable" } } });
    exists = true; await options.delayCreate?.();
    if (options.loseCreate) return route.abort("failed");
    return route.fulfill({ json: { project: { contractVersion: "project-context.v1", id: projectId, selectedRepositoryId: selectionId, context: background, completeness: { complete: false, missingFields: ["coreGoal", "currentStageGoal", "status"] }, syncPreparation: { state: "ready", requested: false } } } });
  });
  await page.route(`**/api/projects/${projectId}/first-sync`, async route => {
    writes.push({ path: "start", body: route.request().postDataJSON() });
    if (failedStart) return route.fulfill({ status: 503, json: { result: "rejected", code: "first_sync_failed", syncRunId: null, jobId: null } });
    phase = "queued";
    if (options.loseStart) return route.abort("failed");
    return route.fulfill({ status: 202, json: { result: "accepted", code: "first_sync_accepted", syncRunId: runId, jobId: runId } });
  });
  await page.route(`**/api/projects/${projectId}/sync-status`, route => route.fulfill({ json: { sync: { contractVersion: "project-onboarding-sync.v1", projectId, state: phase, syncRunId: phase === "not_started" ? null : runId, queuedAt: phase === "not_started" ? null : at, finishedAt: ["completed", "failed", "partial", "cancelled"].includes(phase) ? at : null, retryRequestId: ["failed", "partial", "cancelled"].includes(phase) ? `retry-${runId}` : ["not_started", "dispatch_pending"].includes(phase) ? "onboarding" : null } } }));
  await page.goto("/"); await page.getByRole("link", { name: "使用 GitHub 登录" }).click(); await expect(page).toHaveURL("http://127.0.0.1:3004/onboarding"); await openOnboardingSection(page, "添加仓库与授权管理");
  return { writes, external, setPhase: (value: string) => { phase = value; }, recover: () => { failedCreate = false; failedStart = false; } };
}
const region = (page: Page) => page.getByRole("region", { name: "已选择仓库", exact: true });
async function choose(page: Page) { await page.getByRole("button", { name: "加载已授权仓库" }).click(); await page.getByRole("button", { name: `选择 ${repo.fullName}`, exact: true }).click(); }
async function continueSelected(page: Page) { await region(page).getByRole("button", { name: `继续接入 ${repo.fullName}`, exact: true }).click(); }

test("T04 新选仓库无需填写背景，接力后刷新真实阶段只读", async ({ page }) => {
  const f = await fixture(page); await choose(page);
  await expect(region(page)).toContainText("首次同步已排队");
  expect(f.writes).toEqual([{ path: "select", body: { repositoryId: repo.id } }, { path: "create", body: { selectedRepositoryId: selectionId } }, { path: "start", body: { requestId: "onboarding" } }]);
  await expect(region(page).getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${projectId}`);
  for (const phase of ["running", "completed"]) { f.setPhase(phase); await region(page).getByRole("button", { name: "刷新同步状态" }).click(); await expect(region(page)).toContainText(phase === "running" ? "首次同步正在进行" : "首次同步已完成"); }
  expect(f.writes).toHaveLength(3); expect(f.external).toEqual([]);
});
test("T04 历史选择加载不自动建项，明确继续后恢复", async ({ page }) => {
  const f = await fixture(page, { selected: true }); await expect(region(page).getByRole("button", { name: `继续接入 ${repo.fullName}` })).toBeVisible(); expect(f.writes).toEqual([]);
  await continueSelected(page); await expect(region(page)).toContainText("首次同步已排队"); expect(f.writes.map(w => w.path)).toEqual(["create", "start"]);
  await page.reload();
  await openOnboardingSection(page, "添加仓库与授权管理"); await expect(region(page).getByRole("link", { name: "进入项目" })).toBeVisible(); expect(f.writes).toHaveLength(2);
});
test("T04 同步启动失败保留项目，明确重试再读取完成", async ({ page }) => {
  const f = await fixture(page, { selected: true, failStart: true }); await continueSelected(page);
  await expect(region(page).getByRole("link", { name: "进入项目" })).toBeVisible(); await expect(region(page)).toContainText("尚未开始首次同步");
  f.recover(); await region(page).getByRole("button", { name: "启动首次同步", exact: true }).click(); await expect(region(page)).toContainText("首次同步已排队");
  f.setPhase("failed"); await region(page).getByRole("button", { name: "刷新同步状态" }).click(); await expect(region(page)).toContainText("首次同步失败，项目资料已保留");
  await region(page).getByRole("button", { name: "重试首次同步" }).click(); await expect(region(page)).toContainText("首次同步已排队");
  expect(f.writes.filter(w => w.path === "create")).toHaveLength(1); expect(f.writes.at(-1)?.body).toEqual({ requestId: `retry-${runId}` });
});
test("T04 创建失败保留已选择并可单独恢复", async ({ page }) => {
  const f = await fixture(page, { failCreate: true }); await choose(page); await expect(region(page)).toContainText("项目接入未完成");
  f.recover(); await continueSelected(page); await expect(region(page)).toContainText("首次同步已排队"); expect(f.writes.filter(w => w.path === "select")).toHaveLength(1);
});
test("T04 创建和启动响应丢失后读取复用，不重复写入", async ({ page }) => {
  const f = await fixture(page, { selected: true, loseCreate: true, loseStart: true }); await continueSelected(page); await expect(region(page)).toContainText("首次同步已排队");
  await region(page).getByRole("button", { name: "刷新同步状态" }).click(); expect(f.writes.map(w => w.path)).toEqual(["create", "start"]);
});
test("T04 账号结束后迟到创建响应不得继续写同步或显示旧项目", async ({ page }) => {
  let finish!: () => void;
  const f = await fixture(page, { selected: true, delayCreate: () => new Promise<void>(resolve => { finish = resolve; }) }); await continueSelected(page);
  await expect.poll(() => typeof finish).toBe("function"); await page.evaluate(() => window.dispatchEvent(new Event("executor:session-ended"))); finish();
  await expect(region(page).getByRole("link", { name: "进入项目" })).toHaveCount(0); expect(f.writes.map(w => w.path)).toEqual(["create"]);
});

const stateLabels = [
  ["not_started", "项目已建立，尚未开始首次同步"],
  ["dispatch_pending", "同步任务已建立，正在等待派发"],
  ["partial", "首次同步部分完成，可重试补全"],
  ["failed", "首次同步失败，项目资料已保留"],
  ["cancelled", "首次同步已取消，项目资料已保留"],
  ["queued", "首次同步已排队"], ["running", "首次同步正在进行"],
  ["completed", "首次同步已完成"],
  ["suspended", "GitHub 授权已暂停，请恢复授权后再同步"],
  ["revoked", "GitHub 授权已撤销，请重新连接"],
] as const;
for (const [phase, label] of stateLabels) {
  test(`T041 浏览器 ${phase} 已有项目查看和刷新零写`, async ({ page }) => {
    const f = await fixture(page, { selected: true, exists: true, phase });
    const button = region(page).getByRole("button", { name: `查看同步状态 ${repo.fullName}`, exact: true });
    await expect(button).toBeVisible(); expect(f.writes).toEqual([]);
    await button.click(); await expect(region(page)).toContainText(label); expect(f.writes).toEqual([]);
    await region(page).getByRole("button", { name: "刷新同步状态" }).click(); await expect(region(page)).toContainText(label);
    expect(f.writes).toEqual([]); expect(f.external).toEqual([]);
    if (["queued", "running", "completed", "suspended", "revoked"].includes(phase)) await expect(region(page).getByRole("button", { name: /启动首次同步|重试首次同步/ })).toHaveCount(0);
  });
}
for (const phase of ["not_started", "dispatch_pending", "partial", "failed", "cancelled"]) {
  test(`T041 浏览器 ${phase} 明确恢复才写入稳定请求键`, async ({ page }) => {
    const f = await fixture(page, { selected: true, exists: true, phase });
    await region(page).getByRole("button", { name: `查看同步状态 ${repo.fullName}`, exact: true }).click();
    const action = phase === "not_started" ? "启动首次同步" : "重试首次同步";
    const button = region(page).getByRole("button", { name: action, exact: true });
    await expect(button).toBeVisible(); expect(f.writes).toEqual([]);
    await button.dblclick(); await expect(region(page)).toContainText("首次同步已排队");
    expect(f.writes).toEqual([{ path: "start", body: { requestId: ["not_started", "dispatch_pending"].includes(phase) ? "onboarding" : `retry-${runId}` } }]);
    expect(f.external).toEqual([]);
  });
}
test("T041 浏览器查看映射变成null也不得自动建项", async ({ page }) => {
  const f = await fixture(page, { selected: true, exists: true });
  const button = region(page).getByRole("button", { name: `查看同步状态 ${repo.fullName}`, exact: true }); await expect(button).toBeVisible();
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: [{ repository: { id: selectionId, repositoryId: repo.id, fullName: repo.fullName, visibility: "private", defaultBranch: "main" }, calibration: null }] } }));
  await button.click(); await expect(region(page).getByRole("alert")).toBeVisible(); expect(f.writes).toEqual([]);
});
test("T041 浏览器查看状态读取失败不得盲启", async ({ page }) => {
  const f = await fixture(page, { selected: true, exists: true });
  await page.route(`**/api/projects/${projectId}/sync-status`, route => route.fulfill({ status: 503, json: { error: { code: "project_sync_status_unavailable" } } }));
  await region(page).getByRole("button", { name: `查看同步状态 ${repo.fullName}`, exact: true }).click();
  await expect(region(page)).toContainText("同步状态暂时无法读取，请刷新重试。项目资料不会丢失。"); expect(f.writes).toEqual([]);
});
test("T041 浏览器刷新状态读取失败保持零写", async ({ page }) => {
  const f = await fixture(page, { selected: true, exists: true });
  await region(page).getByRole("button", { name: `查看同步状态 ${repo.fullName}`, exact: true }).click();
  await expect(region(page)).toContainText("尚未开始首次同步"); expect(f.writes).toEqual([]);
  await page.route(`**/api/projects/${projectId}/sync-status`, route => route.fulfill({ status: 503, json: { error: { code: "project_sync_status_unavailable" } } }));
  await region(page).getByRole("button", { name: "刷新同步状态" }).click();
  await expect(region(page)).toContainText("同步状态暂时无法读取，请刷新重试。项目资料不会丢失。"); expect(f.writes).toEqual([]);
});
