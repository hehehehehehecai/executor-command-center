import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { openOnboardingSection } from "../onboarding-ui-fixture-actions";

const transport = "http://127.0.0.1:54334";
const first = "16666666-6666-4666-8666-666666666661";
const second = "16666666-6666-4666-8666-666666666662";
const foreign = "16666666-6666-4666-8666-666666666669";
const account = "15111111-1111-4111-8111-111111111111";
const observations = new WeakMap<Page, { calls: { method: string; path: string; body: unknown }[]; initialWrites: number; external: string[] }>();

async function state(request: APIRequestContext, projects: string, other: Record<string, unknown> = {}) {
  const response = await request.post(`${transport}/__fixture/t06/state`, { data: { projects, ...other } });
  expect(response.status()).toBe(200);
}
async function login(page: Page, waitForWorkspaceRead = false) {
  await page.goto("/");
  const workspaceRead = waitForWorkspaceRead ? page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/workspace" && response.status() === 200) : null;
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  if (workspaceRead) await workspaceRead;
  await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@synthetic-selection-user");
}
const entry = (page: Page) => page.getByRole("region", { name: "进入已有项目" });

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${transport}/__fixture/t06/begin`)).status()).toBe(200);
  await state(request, "single");
  const initial = await (await request.get(`${transport}/__fixture/state`)).json();
  const observed = { calls: [] as { method: string; path: string; body: unknown }[], initialWrites: initial.project_write_calls as number, external: [] as string[] };
  observations.set(page, observed);
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/projects") || url.pathname.startsWith("/api/github/repository-selections")) observed.calls.push({ method: request.method(), path: url.pathname + url.search, body: request.postData() ? request.postDataJSON() : null });
  });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["http://127.0.0.1:3004", transport].includes(url.origin)) { observed.external.push(url.origin); await route.abort("blockedbyclient"); }
    else await route.continue();
  });
});
test.afterEach(async ({ page, request }, info) => {
  const observed = observations.get(page)!;
  const final = await (await request.get(`${transport}/__fixture/state`)).json();
  console.info("T06_BROWSER_CASE " + JSON.stringify({ case_id: info.title, dataset_version: "t06-onboarding-state-regression.v1", lineage_id: "project-calibration-fixture/synthetic-selection-user", source_case_id: "原project-calibration-fixture", root_provenance: "已曝光离线HTTP/Auth transport；真实服务器workspace reader/页面/组件", exposure: "exposed/regression-derived", holdout_eligibility: "not_holdout", real_case_count: 0, account, projectIds: [first, second], calls: observed.calls, unexpectedBusinessWrites: observed.calls.filter(call => call.method !== "GET"), fixtureProjectWriteDelta: final.project_write_calls - observed.initialWrites, external: observed.external, result: info.status, viewport: page.viewportSize() }));
  expect((await request.post(`${transport}/__fixture/t06/end`)).status()).toBe(200);
  expect(final.project_write_calls).toBe(observed.initialWrites);
  expect(observed.calls.filter(call => call.method !== "GET")).toEqual([]);
  expect(observed.external).toEqual([]);
});

test("T06-B01 单项目空背景与桌面手机诊断键盘", async ({ page }, info) => {
  await login(page);
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${first}`);
  await expect(page.getByRole("button", { name: "保存项目背景" })).toHaveCount(0);
  await expect(page.locator('[data-onboarding-primary="true"]:visible')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("t06-single-desktop.png"), fullPage: true });
  await openOnboardingSection(page, "添加仓库与授权管理");
  const diagnostic = page.getByText("authenticated", { exact: true });
  await expect(diagnostic).not.toBeVisible();
  const summary = page.locator("summary").filter({ hasText: /^接入诊断$/ });
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(diagnostic).toBeVisible();
  await page.screenshot({ path: info.outputPath("t06-diagnostic-open.png"), fullPage: true });
  await page.keyboard.press("Enter");
  await expect(diagnostic).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toBeVisible();
  await entry(page).getByRole("link", { name: "进入项目" }).focus();
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toBeFocused();
  await page.screenshot({ path: info.outputPath("t06-single-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("T06-B02 多项目按名称进入所选工作区", async ({ page, request }, info) => {
  await state(request, "multiple");
  await login(page);
  const select = entry(page).getByRole("combobox", { name: "选择要进入的项目" });
  await expect(entry(page).getByRole("button", { name: "进入项目" })).toBeDisabled();
  await select.selectOption(second);
  const link = entry(page).getByRole("link", { name: "进入项目" });
  await expect(link).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${second}`);
  await page.screenshot({ path: info.outputPath("t06-multiple-desktop.png"), fullPage: true });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`http://127.0.0.1:3004/project-galaxy?mode=connected&project=${second}`);
});
test("T06-B03 同名项目无需输入内部编号", async ({ page, request }, info) => {
  await state(request, "same_names");
  await login(page);
  const select = entry(page).getByRole("combobox", { name: "选择要进入的项目" });
  await expect(select.getByRole("option", { name: "synthetic-owner/restored-repository（第 1 个）" })).toHaveCount(1);
  await expect(select.getByRole("option", { name: "synthetic-owner/restored-repository（第 2 个）" })).toHaveCount(1);
  await select.selectOption(second);
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${second}`);
  await expect(entry(page)).not.toContainText(second);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("t06-same-names-mobile.png"), fullPage: true });
});
test("T06-B04 项目读取错误可重试且不伪装空态", async ({ page, request }, info) => {
  await state(request, "single", { projectReadFailed: true });
  await login(page, true);
  await expect(page.getByRole("alert", { name: "项目读取失败" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新读取接入状态" })).toBeVisible();
  await expect(page.getByText("当前账号暂无项目")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加载已授权仓库" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("t06-project-error-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("t06-project-error-mobile.png"), fullPage: true });
  await state(request, "single");
  await page.getByRole("button", { name: "重新读取接入状态" }).click();
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toBeVisible();
});
test("T06-B05 真实服务器核验返回归属并保留query", async ({ page, request }) => {
  await state(request, "multiple");
  await login(page);
  const target = `/project-galaxy?mode=connected&project=${second}&tab=activity`;
  await page.goto(`/onboarding?returnTo=${encodeURIComponent(target)}`);
  await expect(page).toHaveURL("http://127.0.0.1:3004" + target);
  await page.goto(`/onboarding?returnTo=${encodeURIComponent(`/project-galaxy?mode=connected&project=${foreign}`)}`);
  await expect(page.getByRole("alert", { name: "返回目标不可用" })).toBeVisible();
  await expect(entry(page).getByRole("combobox", { name: "选择要进入的项目" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp("/onboarding\\?"));
  const response = await page.request.get(`/api/auth/workspace?project=${foreign}`);
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("project_not_found");
});
test("T06-B06 安全拒绝外部编码返回且自身不循环", async ({ page }) => {
  await login(page);
  for (const target of ["https://evil.example/path", "//evil.example/path", "/%25252f%25252fevil.example/path"]) {
    await page.goto(`/onboarding?returnTo=${encodeURIComponent(target)}`);
    await expect(page.getByRole("alert", { name: "返回目标不可用" })).toBeVisible();
    await expect(entry(page).getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${first}`);
  }
  await page.goto(`/onboarding?returnTo=${encodeURIComponent("/onboarding?returnTo=%2Fonboarding")}`);
  await page.reload();
  await expect(page).toHaveURL(new RegExp("/onboarding\\?"));
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toBeVisible();
});
test("T06-B07 会话失效后匿名不残留项目", async ({ page }) => {
  await login(page);
  await expect(entry(page)).toContainText("synthetic-owner/restored-repository");
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole("link", { name: "使用 GitHub 登录" })).toBeVisible();
  await expect(page.getByText("@synthetic-selection-user")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "进入已有项目" })).toHaveCount(0);
});
test("T06-B08 安装暂停保留资料与明确恢复", async ({ page, request }, info) => {
  await state(request, "single", { installation: "suspended" });
  await login(page);
  await expect(page.getByText("GitHub App Installation 已暂停")).toBeVisible();
  const action = page.getByRole("link", { name: "管理 GitHub 仓库授权" });
  await expect(action).toHaveAttribute("data-onboarding-primary", "true");
  await expect(page.getByRole("button", { name: "加载已授权仓库" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("t06-suspended-desktop.png"), fullPage: true });
  await state(request, "single");
  await page.reload();
  await expect(entry(page).getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${first}`);
});
