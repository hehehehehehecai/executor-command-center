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
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3002/onboarding");
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
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(page.getByText("not_loaded", { exact: true })).toBeVisible();
  await expect(page.getByText("none", { exact: true })).toHaveCount(2);
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
});
