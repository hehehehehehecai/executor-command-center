import { expect, test } from "@playwright/test";

const fixtureBaseUrl = "http://127.0.0.1:54335";
const primaryInstallationId = 8_170_001;
const secondaryInstallationId = 8_180_001;
const targetRepositoryId = 1_701;
const revokedRepositoryId = 1_702;

test("completes one isolated connected onboarding journey and rejects cross-boundary reuse", async ({
  browser,
  page,
  request,
}) => {
  const externalBrowserRequests: string[] = [];
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== "http://127.0.0.1:3005" &&
      url.origin !== fixtureBaseUrl
    ) {
      externalBrowserRequests.push(url.origin);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "尚未登录" })).toBeVisible();

  let state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.identities).toEqual([]);
  expect(state.installations).toEqual([]);
  expect(state.selected_repositories).toEqual([]);
  expect(state.projects).toEqual([]);

  await page.goto("/");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3005/onboarding");
  await expect(
    page.getByRole("heading", { name: "GitHub 身份登录成功" }),
  ).toBeVisible();
  await expect(page.getByText("not_registered", { exact: true })).toBeVisible();

  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.identities).toEqual([
    {
      user_id: "17111111-1111-4111-8111-111111111111",
      github_user_id: 7_170_001,
    },
  ]);
  expect(state.installations).toEqual([]);
  expect(state.selected_repositories).toEqual([]);
  expect(state.projects).toEqual([]);

  const startResponse = await page.request.get(
    "/api/github/installations/start?returnTo=%2Fonboarding",
    { maxRedirects: 0 },
  );
  expect(startResponse.status()).toBe(303);
  const installationUrl = new URL(startResponse.headers().location);
  expect(installationUrl.origin).toBe("https://github.com");
  expect(installationUrl.pathname).toBe(
    "/apps/executor-connected-fixture/installations/new",
  );
  const installationState = installationUrl.searchParams.get("state");
  expect(installationState).toMatch(/^[A-Za-z0-9_-]+$/);

  await page.goto(
    `/api/github/installations/setup?state=${encodeURIComponent(installationState ?? "")}&installation_id=${primaryInstallationId}`,
  );
  await expect(page).toHaveURL("http://127.0.0.1:3005/onboarding");
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "加载已授权仓库" }).click();
  const authorizedRepositories = page.getByRole("region", {
    name: "已授权仓库",
  });
  await expect(authorizedRepositories).toContainText(
    "fixture-owner/connected-target",
  );
  await expect(authorizedRepositories).toContainText(
    "fixture-owner/revoked-before-selection",
  );
  await expect(authorizedRepositories).not.toContainText(
    "fixture-owner/not-authorized",
  );
  expect(await authorizedRepositories.locator("strong").allTextContents()).toEqual([
    "fixture-owner/connected-target",
    "fixture-owner/revoked-before-selection",
  ]);

  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.installations).toMatchObject([
    {
      user_id: "17111111-1111-4111-8111-111111111111",
      installation_id: primaryInstallationId,
      repository_selection: "selected",
      status: "active",
    },
  ]);
  expect(state.selected_repositories).toEqual([]);
  expect(state.projects).toEqual([]);

  const revokeResponse = await request.post(
    `${fixtureBaseUrl}/__fixture/revoke-repository`,
    { data: { repository_id: revokedRepositoryId } },
  );
  expect(revokeResponse.ok()).toBe(true);
  await page
    .getByRole("button", {
      name: "选择 fixture-owner/revoked-before-selection",
    })
    .click();
  await expect(
    page.getByText("仓库选择失败，请稍后重试。", { exact: true }),
  ).toBeVisible();
  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.selected_repositories).toEqual([]);
  expect(state.projects).toEqual([]);

  await page
    .getByRole("button", { name: "选择 fixture-owner/connected-target" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "取消选择 fixture-owner/connected-target",
    }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "仓库事实" })).toContainText(
    "fixture-owner/connected-target",
  );

  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.selected_repositories).toHaveLength(1);
  expect(state.selected_repositories[0]).toMatchObject({
    user_id: "17111111-1111-4111-8111-111111111111",
    github_installation_id: state.installations[0].id,
    github_repository_id: targetRepositoryId,
  });
  const selectedRepositoryId = state.selected_repositories[0].id as string;

  await page.getByLabel("核心目标").fill("Ship the connected fixture MVP");
  await page
    .getByLabel("当前阶段目标")
    .fill("Complete the continuous onboarding acceptance journey");
  await page.getByLabel("正式状态").selectOption("in_development");
  await page.getByLabel("当前阻碍（可选）").fill("Fixture-only approval boundary");
  await page.getByRole("button", { name: "保存项目校准" }).click();
  await expect(page.getByRole("status")).toHaveText("项目校准已保存");
  await expect(page.getByTestId("project-stable-id")).toHaveText(
    "Project ID: 17777777-7777-4777-8777-777777777777",
  );

  await page.reload();
  await expect(page.getByLabel("核心目标")).toHaveValue(
    "Ship the connected fixture MVP",
  );
  await expect(page.getByLabel("当前阶段目标")).toHaveValue(
    "Complete the continuous onboarding acceptance journey",
  );
  await expect(page.getByLabel("正式状态")).toHaveValue("in_development");
  await expect(page.getByTestId("project-stable-id")).toHaveText(
    "Project ID: 17777777-7777-4777-8777-777777777777",
  );

  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.projects).toEqual([
    expect.objectContaining({
      id: "17777777-7777-4777-8777-777777777777",
      user_id: "17111111-1111-4111-8111-111111111111",
      selected_repository_id: selectedRepositoryId,
      core_goal: "Ship the connected fixture MVP",
      current_stage_goal: "Complete the continuous onboarding acceptance journey",
      status: "in_development",
      current_blocker: "Fixture-only approval boundary",
    }),
  ]);

  expect(
    (await request.post(`${fixtureBaseUrl}/__fixture/archive-project`, {
      data: { project_id: "17777777-7777-4777-8777-777777777777" },
    })).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.getByTestId("project-stable-id")).toHaveCount(0);
  await expect(page.getByLabel("核心目标")).toHaveValue("");
  await expect(page.getByLabel("当前阶段目标")).toHaveValue("");
  await page.getByLabel("核心目标").fill("Ship a replacement active project");
  await page
    .getByLabel("当前阶段目标")
    .fill("Prove archived calibration is not reused");
  await page.getByLabel("正式状态").selectOption("polishing");
  await page.getByRole("button", { name: "保存项目校准" }).click();
  await expect(page.getByRole("status")).toHaveText("项目校准已保存");
  await expect(page.getByTestId("project-stable-id")).toHaveText(
    "Project ID: 18888888-8888-4888-8888-888888888888",
  );

  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.projects).toEqual([
    expect.objectContaining({
      id: "17777777-7777-4777-8777-777777777777",
      selected_repository_id: selectedRepositoryId,
      status: "archived",
    }),
    expect.objectContaining({
      id: "18888888-8888-4888-8888-888888888888",
      selected_repository_id: selectedRepositoryId,
      core_goal: "Ship a replacement active project",
      current_stage_goal: "Prove archived calibration is not reused",
      status: "polishing",
    }),
  ]);
  expect(
    state.projects.filter((project: { status: string }) =>
      project.status !== "archived"
    ),
  ).toHaveLength(1);
  const primaryProjectsSnapshot = state.projects;

  expect(
    (await request.post(`${fixtureBaseUrl}/__fixture/active-user`, {
      data: { user: "secondary" },
    })).ok(),
  ).toBe(true);
  const secondaryContext = await browser.newContext();
  const secondaryExternalRequests: string[] = [];
  await secondaryContext.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== "http://127.0.0.1:3005" &&
      url.origin !== fixtureBaseUrl
    ) {
      secondaryExternalRequests.push(url.origin);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const secondaryPage = await secondaryContext.newPage();

  await secondaryPage.goto("/");
  await secondaryPage.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(secondaryPage).toHaveURL("http://127.0.0.1:3005/onboarding");
  await expect(secondaryPage.getByText("not_registered", { exact: true })).toBeVisible();
  await expect(secondaryPage.getByText("fixture-owner/connected-target")).toHaveCount(0);

  const secondaryProjects = await secondaryPage.request.get("/api/projects");
  expect(secondaryProjects.status()).toBe(200);
  expect(await secondaryProjects.json()).toEqual({ projects: [] });
  const secondarySelections = await secondaryPage.request.get(
    "/api/github/repository-selections",
  );
  expect(secondarySelections.status()).toBe(200);
  expect(await secondarySelections.json()).toEqual({ selectedRepositories: [] });
  const forbiddenReuse = await secondaryPage.request.post("/api/projects", {
    headers: { origin: "http://127.0.0.1:3005" },
    data: {
      selectedRepositoryId,
      coreGoal: "Cross-user write must fail",
      currentStageGoal: "Preserve ownership isolation",
      status: "in_planning",
      currentBlocker: null,
    },
  });
  expect(forbiddenReuse.status()).toBe(404);
  expect(await forbiddenReuse.json()).toEqual({
    error: {
      code: "project_calibration_selected_repository_not_found",
      message: "Project calibration could not be completed.",
    },
  });
  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.projects).toEqual(primaryProjectsSnapshot);
  expect(state.counts.projectWrite).toBe(2);

  const secondaryStart = await secondaryPage.request.get(
    "/api/github/installations/start?returnTo=%2Fonboarding",
    { maxRedirects: 0 },
  );
  expect(secondaryStart.status()).toBe(303);
  const secondaryState = new URL(
    secondaryStart.headers().location,
  ).searchParams.get("state");
  await secondaryPage.goto(
    `/api/github/installations/setup?state=${encodeURIComponent(secondaryState ?? "")}&installation_id=${secondaryInstallationId}`,
  );
  await expect(secondaryPage).toHaveURL(
    "http://127.0.0.1:3005/onboarding?installation=configuration_failed",
  );
  await secondaryContext.close();

  state = await (await request.get(`${fixtureBaseUrl}/__fixture/state`)).json();
  expect(state.identities).toHaveLength(2);
  expect(state.installations).toHaveLength(1);
  expect(state.selected_repositories).toHaveLength(1);
  expect(state.projects).toHaveLength(2);
  expect(state.counts.selectionWrite).toBe(1);
  expect(state.counts.projectWrite).toBe(2);
  expect(state.counts.tokenCreate).toBe(state.counts.tokenRevoke);
  expect(state.blocked_framework_requests).toEqual([
    {
      origin: "https://registry.npmjs.org",
      path: "/-/package/next/dist-tags",
      method: "GET",
      policy: "explicit_deny",
    },
  ]);
  expect(state.forbidden_external_requests).toEqual([]);
  expect(state.real_github_called).toBe(false);
  expect(state.sync_started).toBe(false);
  expect(state.issue_created).toBe(false);
  expect(externalBrowserRequests).toEqual([]);
  expect(secondaryExternalRequests).toEqual([]);

  const browserStorage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage).filter(
      ([key]) => !key.startsWith("__next_debug_channel:"),
    ),
  }));
  expect(browserStorage.local).toEqual([]);
  expect(browserStorage.session).toEqual([]);
  expect(JSON.stringify(browserStorage)).not.toMatch(
    /service.role|fixture-token|private key|approval boundary/i,
  );
});
