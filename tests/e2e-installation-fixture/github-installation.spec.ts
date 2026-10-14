import { openOnboardingSection } from "../onboarding-ui-fixture-actions";
import { expect, test } from "@playwright/test";

test("registers a synthetic personal installation without repository access", async ({
  page,
  request,
}) => {
  const externalBrowserRequests: string[] = [];
  page.on("request", (browserRequest) => {
    const hostname = new URL(browserRequest.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      externalBrowserRequests.push(browserRequest.url());
    }
  });

  const unauthenticatedStart = await page.request.get(
    "/api/github/installations/start?returnTo=%2Fonboarding",
    { maxRedirects: 0 },
  );
  expect(unauthenticatedStart.status()).toBe(303);
  expect(unauthenticatedStart.headers().location).toBe("/auth/error");

  const unauthenticatedSetup = await page.request.get(
    "/api/github/installations/setup?state=synthetic_state&installation_id=81001",
    { maxRedirects: 0 },
  );
  expect(unauthenticatedSetup.status()).toBe(303);
  expect(unauthenticatedSetup.headers().location).toBe(
    "/onboarding?installation=configuration_failed",
  );

  await page.goto("/");
  await expect(page.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toHaveAttribute("href", "/api/auth/github?returnTo=%2Fonboarding");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3002/onboarding");
  await openOnboardingSection(page, "接入诊断");
  await expect(page.getByText("not_registered", { exact: true })).toBeVisible();
  await expect(page.getByText("not_loaded", { exact: true })).toBeVisible();

  async function createSyntheticInstallationState() {
    const startResponse = await page.request.get(
      "/api/github/installations/start?returnTo=%2Fonboarding",
      { maxRedirects: 0 },
    );
    expect(startResponse.status()).toBe(303);
    const installationLocation = startResponse.headers().location;
    const installationUrl = new URL(installationLocation);
    expect(installationUrl.origin).toBe("https://github.com");
    expect(installationUrl.pathname).toBe(
      "/apps/executor-fixture-app/installations/new",
    );
    const state = installationUrl.searchParams.get("state");
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    return state ?? "";
  }

  async function completeSyntheticInstallation() {
    const state = await createSyntheticInstallationState();
    await page.goto(
      `/api/github/installations/setup?state=${encodeURIComponent(state)}&installation_id=81001`,
    );
    await expect(page).toHaveURL("http://127.0.0.1:3002/onboarding");
    return state;
  }

  const invalidIdState = await createSyntheticInstallationState();
  await page.goto(
    `/api/github/installations/setup?state=${encodeURIComponent(invalidIdState)}&installation_id=9007199254740992`,
  );
  await expect(page).toHaveURL(
    "http://127.0.0.1:3002/onboarding?installation=configuration_failed",
  );
  await expect(
    page.getByText("GitHub App Installation 配置失败"),
  ).toBeVisible();

  const firstSuccessfulState = await completeSyntheticInstallation();
  await openOnboardingSection(page, "接入诊断");
  await openOnboardingSection(page, "仓库诊断");
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(page.getByText("not_loaded", { exact: true })).toBeVisible();
  const summary = (label: string) => page.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("..").locator("dd");
  await expect(summary("selected_repository_count")).toHaveText("0");
  await expect(summary("projects")).toHaveText("0");
  await expect(summary("repository_content")).toHaveText("none");
  await expect(page.getByText("尚未选择仓库。", { exact: true })).toBeVisible();
  await expect(page.getByText("项目背景读取失败。")).toHaveCount(0);
  await expect(
    page.getByText("GitHub App Installation 已连接"),
  ).toBeVisible();

  await page.goto(
    `/api/github/installations/setup?state=${encodeURIComponent(firstSuccessfulState)}&installation_id=81001`,
  );
  await expect(page).toHaveURL(
    "http://127.0.0.1:3002/onboarding?installation=configuration_failed",
  );

  await completeSyntheticInstallation();
  await page.reload();
  await openOnboardingSection(page, "接入诊断");
  await expect(page.getByText("active", { exact: true })).toBeVisible();

  const organizationMode = await request.post(
    "http://127.0.0.1:54332/__fixture/github-account-type",
    { data: { account_type: "Organization" } },
  );
  expect(organizationMode.ok()).toBe(true);
  const organizationState = await createSyntheticInstallationState();
  await page.goto(
    `/api/github/installations/setup?state=${encodeURIComponent(organizationState)}&installation_id=81001`,
  );
  await expect(page).toHaveURL(
    "http://127.0.0.1:3002/onboarding?installation=configuration_failed",
  );

  const fixtureStateResponse = await request.get(
    "http://127.0.0.1:54332/__fixture/state",
  );
  expect(fixtureStateResponse.ok()).toBe(true);
  expect(await fixtureStateResponse.json()).toEqual({
    fixture_id: "valid_active_personal_installation",
    fixture_version: "1.0.0",
    source_type: "synthetic",
    contains_real_secret: false,
    synthetic_key_label:
      "synthetic-test-key fixture-only not-for-production",
    real_github_called: false,
    real_private_key_used: false,
    real_installation_used: false,
    identity_ensure_calls: 1,
    state_create_calls: 4,
    state_consume_calls: 4,
    installation_register_calls: 2,
    installation_record_count: 1,
    github_installation_api_calls: 3,
    repository_api_calls: 0,
    installation_access_token_calls: 0,
    installation_state: "active",
    repository_access: "not_loaded",
    selected_repositories: "none",
    projects: "none",
  });
  expect(externalBrowserRequests).toEqual([]);

  // Preserve the original one-time state/callback counters above before exercising
  // the independent management path. Permission updates need no setup callback.
  await request.post("http://127.0.0.1:54332/__fixture/github-account-type", { data: { account_type: "User" } });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "添加仓库", exact: true })).toHaveAttribute("href", "/onboarding#repositories");
  await page.getByText("我的项目（0）", { exact: true }).click();
  await expect(page.getByRole("link", { name: "添加仓库", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "添加仓库", exact: true }).click();
  const managed = await page.request.get("/api/github/installations/manage", { maxRedirects: 0 });
  expect(managed.status()).toBe(303);
  expect(managed.headers().location).toBe("https://github.com/settings/installations/81001");
  const refresh = async () => page.getByRole("button", { name: "已返回，刷新授权和仓库" }).click();
  await refresh();
  await expect(page.getByText("当前授权范围内没有仓库。")).toBeVisible();
  for (const [mode, message] of [["suspended", "GitHub App Installation 已暂停"], ["missing", "GitHub App Installation 已撤销"], ["failure", "授权状态读取失败，请重试。"]]) {
    await request.post("http://127.0.0.1:54332/__fixture/management-mode", { data: { mode } }); await refresh();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByText("当前授权范围内没有仓库。")).toHaveCount(0);
    if (mode === "suspended") { await expect(page.getByRole("link", { name: "管理 GitHub 仓库授权" })).toBeVisible(); await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("GitHub App 已暂停"); }
    if (mode === "missing") { await expect(page.getByRole("link", { name: "重新安装 GitHub App" })).toBeVisible(); await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("GitHub App 已撤销"); }
  }
  await request.post("http://127.0.0.1:54332/__fixture/management-mode", { data: { mode: "bad_url" } }); await refresh();
  await expect(page.getByText("GitHub 未提供可验证的管理地址，请稍后刷新重试。")).toBeVisible();
  await expect(page.getByRole("link", { name: "管理 GitHub 仓库授权" })).toHaveCount(0);
  const rejected = await page.request.get("/api/github/installations/manage", { maxRedirects: 0 }); expect(rejected.status()).toBe(502); expect(rejected.headers().location).toBeUndefined();
  await request.post("http://127.0.0.1:54332/__fixture/management-mode", { data: { mode: "active" } }); await refresh();
  await expect(page.getByText("当前授权范围内没有仓库。")).toBeVisible();
  const finalState = await (await request.get("http://127.0.0.1:54332/__fixture/state")).json();
  expect(finalState).toMatchObject({ state_create_calls: 4, state_consume_calls: 4, installation_register_calls: 2, selected_repositories: "none", projects: "none", real_github_called: false });
  expect(externalBrowserRequests).toEqual([]);
  await page.screenshot({ path: "test-results/installation-management.png", fullPage: true });
  const manageLink = page.getByRole("link", { name: "管理 GitHub 仓库授权" });
  await manageLink.focus(); await expect(manageLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "已返回，刷新授权和仓库" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("当前授权范围内没有仓库。")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(manageLink).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/installation-management-mobile.png", fullPage: true });
});
