import { expect, test } from "@playwright/test";

test("loads authorized repositories with one opaque token and immediate revocation", async ({
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

  const unauthenticated = await page.request.get(
    "/api/github/repositories?installation_id=999&page=7&per_page=1",
    {
      headers: {
        "x-installation-id": "999",
        "x-fixture-mode": "true",
        cookie: "fixture=true",
      },
    },
  );
  expect(unauthenticated.status()).toBe(401);

  await page.goto("/");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3003/onboarding");
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(page.getByText("not_loaded", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "加载已授权仓库" })
    .click();
  await expect(page.getByText("loaded", { exact: true })).toBeVisible();
  await expect(page.getByText("2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("synthetic-owner/synthetic-private-repository"),
  ).toBeVisible();
  await expect(
    page.getByText("synthetic-owner/synthetic-public-repository"),
  ).toBeVisible();
  await expect(
    page.getByText("Private", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Public", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("默认分支：trunk")).toBeVisible();
  await expect(page.getByText("默认分支：main")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /选择|导入|创建|同步/ }),
  ).toHaveCount(0);

  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(storage.local).toEqual([]);
  expect(JSON.stringify(storage)).not.toContain(
    "fixture::opaque::future-format",
  );

  const fixtureStateResponse = await request.get(
    "http://127.0.0.1:54333/__fixture/state",
  );
  expect(fixtureStateResponse.ok()).toBe(true);
  expect(await fixtureStateResponse.json()).toEqual({
    fixture_id: "active_private_repository",
    fixture_version: "1.0.0",
    source_type: "synthetic",
    contains_real_secret: false,
    real_github_called: false,
    real_private_key_used: false,
    real_app_jwt_used: false,
    real_installation_token_used: false,
    installation_query_calls: 2,
    token_create_calls: 1,
    repository_page_calls: 1,
    token_revoke_calls: 1,
    forbidden_endpoint_calls: 0,
    repository_write_calls: 0,
    installation_update_calls: 0,
    repository_list_persisted: false,
    selected_repositories: "none",
    projects: "none",
    token_created: true,
    revocation_attempted: true,
    token_revoked: true,
  });
  expect(externalBrowserRequests).toEqual([]);
});
