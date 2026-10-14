import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = "http://127.0.0.1:3037", provider = "http://127.0.0.1:4037";
const alpha = "11111111-1111-4111-8111-111111111111", beta = "22222222-2222-4222-8222-222222222222";
const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", projectB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", second = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const panels = ["project-galaxy", "flight-log", "mission-control", "decision-archive", "copilot"];
const routes = ["home", ...panels];
const output = process.env.WORKSPACE_ENTRY_BROWSER_OUTPUT!;
const route = (target: string) => target === "home" ? "/" : "/" + target;
const parameter = (target: string) => target === "copilot" ? "projectId" : "project";
const href = (target: string, id = projectA) => `${route(target)}?${parameter(target)}=${id}`;
let browserRequests: { method: string; path: string; body: string | null }[];
let pageErrors: string[];
let navigationAssertions: unknown[];
let developmentSocketsClosed: string[];
function observePage(page: Page) {
  page.on("request", request => {
    const url = new URL(request.url());
    browserRequests.push({ method: request.method(), path: url.origin === origin ? url.pathname + url.search : url.origin + url.pathname, body: request.postData() });
  });
  page.on("pageerror", error => pageErrors.push(error.message));
}
const control = async (request: APIRequestContext, update: Record<string, unknown>) => {
  const response = await request.post(provider + "/__fixture/control", { data: update });
  expect(response.ok()).toBe(true);
};
async function identity(context: BrowserContext, request: Parameters<typeof control>[0], user = alpha) {
  const response = await request.get(provider + "/__fixture/session?user=" + user);
  expect(response.ok()).toBe(true);
  const session = await response.json();
  await context.clearCookies();
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function formal(page: Page, target: string, id = projectA, login = "entry-alpha") {
  await expect(page.getByRole("complementary", { name: "当前账号", exact: true })).toContainText("@" + login);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "桌面主导航", exact: true })).toBeAttached();
  await expect(page.getByText("演示数据 · 完全虚构", { exact: true })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "桌面主导航", exact: true });
  const expected = routes.map(item => href(item, id));
  await expect.poll(() => nav.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")))).toEqual(expected);
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", href(target, id));
  navigationAssertions.push({ at: new Date().toISOString(), target, projectId: id, login, actualUrl: page.url(), expectedNavigation: expected, actualNavigation: await nav.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href"))), expectedCurrentHref: href(target, id), actualCurrentHref: await nav.locator('[aria-current="page"]').getAttribute("href") });
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.post(provider + "/__fixture/reset")).ok()).toBe(true);
  browserRequests = []; pageErrors = []; navigationAssertions = []; developmentSocketsClosed = [];
  observePage(page);
  if (process.env.WORKSPACE_ENTRY_BROWSER_MODE === "controlled") {
    await page.routeWebSocket(url => ["/_next/hmr", "/_next/webpack-hmr"].includes(url.pathname), socket => {
      developmentSocketsClosed.push(socket.url());
      socket.close();
    });
  }
});
test.afterEach(async ({ page, request }, info) => {
  const caseId = info.title.split(" ")[0];
  const folder = path.join(output, "cases"); await mkdir(folder, { recursive: true });
  const transport = await (await request.get(provider + "/__fixture/state")).json();
  let afterEachError: unknown;
  try {
    expect(transport.businessWrites).toBe(0);
    expect(transport.blockedExternal).toEqual([]);
    expect(browserRequests.filter(request => request.path.startsWith("https://"))).toEqual([]);
    expect(pageErrors).toEqual([]);
  } catch (error) { afterEachError = error; }
  await writeFile(path.join(folder, caseId + ".json"), JSON.stringify({
    case_id: caseId, dataset_id: "t07-workspace-entry-navigation-regression.v1", version: 2,
    lineage_id: "T05-T03-regression-synthetic-accounts-HTTP-T07", source_case_id: info.title,
    root_provenance: "exposed/regression-derived/not_holdout; external HTTP Auth/REST synthetic; actual Next pages/SDK/readers/owner/boundary/navigation",
    mode: process.env.WORKSPACE_ENTRY_BROWSER_MODE, status: afterEachError ? "failed" : info.status, expectedStatus: info.expectedStatus,
    afterEachAssertionsPassed: !afterEachError, afterEachError: afterEachError instanceof Error ? afterEachError.message : null,
    run_id: process.env.WORKSPACE_ENTRY_BROWSER_RUN_ID, source_manifest_sha256: process.env.WORKSPACE_ENTRY_BROWSER_SOURCE_SHA256,
    initial_session: transport.requests.find((entry: { actorId?: string }) => entry.actorId)?.actorId ?? "anonymous",
    initial_url: browserRequests.find(entry => entry.method === "GET")?.path,
    actualUrl: page.url(), navigationAssertions, browserRequests, transport, pageErrors, developmentSocketsClosed, realUsers: 0, nativeSubjectsCreated: 0,
  }, null, 2));
  if (!page.isClosed()) await page.screenshot({ path: path.join(folder, caseId + ".png"), fullPage: true });
  if (afterEachError) throw afterEachError;
});

test.describe("formal entry", () => {
  test("T07-B01 anonymous homepage explains connection without private fixture", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "EXECUTOR" })).toBeVisible();
    await expect(page.getByRole("link", { name: "使用 GitHub 登录" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Aurora Cartography");
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
  });
  for (const target of panels) test(`T07-B02-${target} no-mode anonymous direct address keeps login return`, async ({ page }) => {
    await page.goto(href(target));
    await expect(page.getByRole("heading", { name: "需要登录", exact: true })).toBeVisible();
    const url = new URL((await page.getByRole("link", { name: "使用 GitHub 登录" }).getAttribute("href"))!, origin);
    expect(url.searchParams.get("returnTo")).toBe(href(target));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(origin + href(target));
    await page.reload();
    const refreshed = new URL((await page.getByRole("link", { name: "使用 GitHub 登录" }).getAttribute("href"))!, origin);
    expect(refreshed.searchParams.get("returnTo")).toBe(href(target));
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
  });
  test("T07-B03 authenticated account with no projects directs all entries to onboarding", async ({ page, context, request }) => {
    await identity(context, request); await control(request, { scenario: "empty" });
    for (const target of routes) {
      await page.goto(route(target));
      await expect(page.getByRole("link", { name: "接入项目", exact: true })).toBeVisible();
      await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@entry-alpha");
      await expect(page.locator("body")).not.toContainText("演示数据 · 完全虚构");
    }
  });
  for (const target of routes) test(`T07-B04-${target} single owned null-background project enters and refreshes without mode`, async ({ page, context, request }) => {
    await identity(context, request);
    await page.goto(route(target)); await formal(page, target);
    await page.reload(); await formal(page, target);
    if (target === "home") await expect(page.getByRole("region", { name: "当前项目" })).toContainText("entry-alpha/alpha-private-project");
    if (target === "project-galaxy") {
      await expect(page.getByText("核心目标未确认", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "启动首次同步", exact: true })).toBeVisible();
    }
  });
  test("T07-B05 all five panels cross-link and return through exact project navigation", async ({ page, context, request }) => {
    await identity(context, request);
    for (const source of panels) for (const target of panels) {
      await page.goto(href(source)); await formal(page, source);
      await page.getByRole("navigation", { name: "桌面主导航", exact: true }).locator(`a[href="${href(target)}"]`).click();
      await expect(page).toHaveURL(origin + href(target)); await formal(page, target);
      const returned = page.getByRole("link", { name: target === "copilot" ? "返回项目总览" : "返回 Command Deck", exact: true });
      await expect(returned).toHaveAttribute("href", href("home"));
    }
    await page.getByRole("navigation", { name: "面包屑", exact: true }).getByRole("link", { name: "舰桥总览" }).click();
    await expect(page).toHaveURL(origin + href("home")); await formal(page, "home");
  });
  test("T07-B06 named homepage selector distinguishes duplicate names and enters selected owned project", async ({ page, context, request }) => {
    await identity(context, request); await control(request, { scenario: "multiple" });
    await page.goto("/");
    const form = page.getByRole("form", { name: "选择工作区项目" });
    await expect(form.locator("option")).toHaveText([
      "请选择项目", "entry-alpha/alpha-private-project",
      "entry-alpha/same-name-project（项目 1）", "entry-alpha/same-name-project（项目 2）",
    ]);
    await form.getByRole("combobox").selectOption(second);
    await form.getByRole("button", { name: "进入项目" }).click();
    await expect(page).toHaveURL(origin + href("home", second)); await formal(page, "home", second);
    const cards = page.getByRole("navigation", { name: "Command Deck 面板入口" }).locator("a");
    expect(await cards.evaluateAll(elements => elements.map(item => item.getAttribute("href")))).toEqual(panels.map(item => href(item, second)));
  });
  test("T07-B07 every multi-project panel chooses by name and canonical parameter", async ({ page, context, request }) => {
    await identity(context, request); await control(request, { scenario: "multiple" });
    for (const target of panels) {
      await page.goto(route(target));
      const form = page.getByRole("form", { name: "选择工作区项目" });
      await form.getByRole("combobox").selectOption(second);
      await form.getByRole("button", { name: "进入项目" }).click();
      await expect(page).toHaveURL(origin + href(target, second)); await formal(page, target, second);
      await expect(form.getByRole("textbox")).toHaveCount(0);
    }
  });
  test("T07-B08 aliases normalize while repeated conflicting foreign or unknown query fails closed", async ({ page, context, request }) => {
    await identity(context, request);
    for (const target of panels) {
      await page.goto(`${route(target)}?${target === "copilot" ? "project" : "projectId"}=${projectA}`); await formal(page, target);
      for (const query of [`project=${projectA}&projectId=${projectB}`, `project=${projectA}&project=${projectA}`, `project=${projectA}&unknown=1`, `project=${projectB}`]) {
        await page.goto(route(target) + "?" + query);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("navigation", { name: "桌面主导航" })).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText("beta-private-project");
        await expect(page.getByText("演示数据 · 完全虚构", { exact: true })).toHaveCount(0);
      }
    }
  });
  for (const target of routes) test(`T07-B09-${target} production preview and invalid mode cannot enable fixture even with server flags`, async ({ page, context, request }) => {
    await identity(context, request);
    for (const mode of ["preview", "demo"]) {
      await page.goto(route(target) + "?mode=" + mode);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Aurora Cartography");
      await expect(page.locator("body")).not.toContainText("演示数据版本");
      await expect(page.getByRole("article")).toHaveCount(0);
    }
  });
  test("T07-B10 summary failure is distinct from empty and visible retry restores real context", async ({ page, context, request }) => {
    await identity(context, request);
    await control(request, { scenario: "summary_failure" });
    const entries = await Promise.all(routes.map(async target => {
      const targetPage = target === "home" ? page : await context.newPage();
      if (targetPage !== page) observePage(targetPage);
      const verification = targetPage.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/workspace" && response.request().method() === "GET");
      await targetPage.goto(href(target)); await verification;
      const retry = targetPage.getByRole("link", { name: "重试读取", exact: true }); await expect(retry).toBeVisible();
      await expect(targetPage.getByRole("link", { name: "接入项目", exact: true })).toHaveCount(0);
      navigationAssertions.push({ target, phase: "read_failure", actualUrl: targetPage.url(), retryVisible: true, onboardingAbsent: true });
      return { target, targetPage, retry };
    }));
    await control(request, { scenario: "single" });
    await Promise.all(entries.map(async ({ target, targetPage, retry }) => { await retry.click(); await formal(targetPage, target); }));
    await Promise.all(entries.filter(entry => entry.targetPage !== page).map(entry => entry.targetPage.close()));
  });
  test("T07-B11 all three owner checks reject adversarial HTTP rows before private panel data", async ({ page, context, request }) => {
    await identity(context, request);
    for (const ownerMismatch of ["project", "selection", "installation"]) {
      await control(request, { ownerMismatch });
      for (const target of panels) { await page.goto(href(target)); await expect(page.getByRole("main")).toBeVisible(); await expect(page.getByRole("navigation", { name: "桌面主导航" })).toHaveCount(0); await expect(page.locator("body")).not.toContainText("alpha-private-project"); }
    }
  });
  test("T07-B12 revoked authorization blocks all entry pages with actual account recovery", async ({ page, context, request }) => {
    await identity(context, request); await control(request, { scenario: "revoked" });
    for (const target of routes) { await page.goto(href(target)); await expect(page.getByRole("link", { name: "检查 GitHub App 状态", exact: true })).toBeVisible(); await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("GitHub App 已撤销"); await expect(page.getByRole("navigation", { name: "桌面主导航" })).toHaveCount(0); }
  });
  test("T07-B13 account switch focus refresh and history cannot retain preceding account project", async ({ page, context, request }) => {
    await identity(context, request); await page.goto(href("flight-log")); await formal(page, "flight-log");
    await identity(context, request, beta); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@entry-beta");
    await expect(page).toHaveURL(origin + "/flight-log");
    await formal(page, "flight-log", projectB, "entry-beta");
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
    await page.reload(); await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@entry-beta");
    await page.goto(href("copilot", projectB)); await page.goBack();
    await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@entry-beta");
    await formal(page, "flight-log", projectB, "entry-beta");
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
  });
  test("T07-B14 explicit logout removes account and history cannot reveal previous private context", async ({ page, context, request }) => {
    await identity(context, request); await page.goto(href("flight-log")); await formal(page, "flight-log");
    await page.goto(href("home")); await formal(page, "home");
    await page.getByRole("button", { name: "退出当前账号", exact: true }).click();
    await expect(page).toHaveURL(origin + "/?signedOut=1");
    await expect(page.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
    await page.goBack(); await expect(page.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
  });
  test("T07-B15 delayed prior-account Auth response cannot restore its context", async ({ page, context, request }) => {
    await identity(context, request); await page.goto(href("home")); await formal(page, "home");
    await control(request, { delayNextAuthMs: 1200 });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(async () => (await (await request.get(provider + "/__fixture/state")).json()).pendingAuth).toBe(1);
    await identity(context, request, beta); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@entry-beta");
    await expect.poll(async () => (await (await request.get(provider + "/__fixture/state")).json()).pendingAuth).toBe(0);
    await formal(page, "home", projectB, "entry-beta");
    await expect(page.locator("body")).not.toContainText("alpha-private-project");
    await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("@entry-beta");
  });
  test("T07-B16 mobile keyboard selection drawer navigation and Escape remain usable", async ({ page, context, request }) => {
    await identity(context, request); await control(request, { scenario: "multiple" }); await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const form = page.getByRole("form", { name: "选择工作区项目" }), select = form.getByRole("combobox");
    await select.focus(); await select.press("ArrowDown"); await select.press("Enter");
    await form.getByRole("button", { name: "进入项目" }).focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(origin + href("home"));
    const trigger = page.getByRole("button", { name: "打开主导航" }); await trigger.focus(); await page.keyboard.press("Enter");
    const drawer = page.getByRole("navigation", { name: "移动主导航" }); await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.press("Enter"); const copilot = drawer.locator(`a[href="${href("copilot")}"]`); await copilot.focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(origin + href("copilot")); await expect(page.getByRole("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
  for (const syncState of ["not_started", "running", "failed"]) test(`T07-B17-${syncState} real sync read remains visible without automatic business writes`, async ({ page, context, request }) => {
    await identity(context, request); await control(request, { syncState }); await page.goto(href("project-galaxy")); await formal(page, "project-galaxy");
    const label = syncState === "not_started" ? "项目已建立，尚未开始首次同步" : syncState === "running" ? "首次同步正在进行" : "首次同步失败，项目资料已保留";
    await expect(page.getByRole("region", { name: "首次同步状态", exact: true })).toContainText(label);
    if (syncState !== "running") await expect(page.getByRole("button", { name: syncState === "not_started" ? "启动首次同步" : "重试首次同步", exact: true })).toBeVisible();
  });
  test("T07-B18 same-account refreshed summary preserves owned project and necessary filter query", async ({ page, context, request }) => {
    await identity(context, request); await page.goto(href("flight-log") + "&apply=1&range=24h&type=issue");
    await expect(page.getByRole("main")).toBeVisible();
    await control(request, { scenario: "multiple" }); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(origin + href("flight-log") + "&apply=1&range=24h&type=issue");
    await expect(page.getByRole("main")).toBeVisible();
    const current = page.getByRole("navigation", { name: "桌面主导航" }).locator('[aria-current="page"]');
    await expect(current).toHaveAttribute("href", href("flight-log") + "&apply=1&range=24h&type=issue");
  });
});

test.describe("controlled local", () => {
  for (const target of routes) test(`T07-B19-${target} explicit preview is isolated to controlled local server`, async ({ page }) => {
    await page.goto(route(target) + "?mode=preview");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("演示数据 · 完全虚构", { exact: true }).first()).toBeVisible();
    if (target === "home") {
      const entries = page.getByRole("navigation", { name: "Command Deck 面板入口" });
      expect(await entries.locator("a").evaluateAll(elements => elements.map(element => element.getAttribute("href")))).toEqual(panels.map(item => route(item) + "?mode=preview"));
    } else await expect(page.getByRole("link", { name: "返回 Command Deck", exact: true })).toHaveAttribute("href", "/?mode=preview");
    await page.goto(route(target));
    await expect(page.getByText("演示数据 · 完全虚构", { exact: true })).toHaveCount(0);
  });
});
