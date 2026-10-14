import { expect, test } from "@playwright/test";
import { openOnboardingSection } from "../onboarding-ui-fixture-actions";

test("restores, live-authorizes, selects, refreshes, and deselects without project or sync", async ({
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

  await page.goto("/");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3004/onboarding");
  await expect(
    page.getByRole("button", {
      name: "取消选择 synthetic-owner/restored-repository",
    }),
  ).toBeVisible();

  const beforeAuthorization = await (
    await request.get("http://127.0.0.1:54334/__fixture/state")
  ).json();
  // Development StrictMode can repeat the mount read. The contract requires
  // restoration without a GitHub authorization request, not one exact render.
  expect(beforeAuthorization.selection_read_calls).toBeGreaterThanOrEqual(1);
  expect(beforeAuthorization.token_create_calls).toBe(0);
  expect(beforeAuthorization.repository_page_calls).toBe(0);

  await page
    .getByRole("button", { name: "加载已授权仓库" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "选择 synthetic-owner/selectable-repository",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "选择 synthetic-owner/selectable-repository",
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "取消选择 synthetic-owner/selectable-repository",
    }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "取消选择 synthetic-owner/selectable-repository",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "取消选择 synthetic-owner/restored-repository",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "取消选择 synthetic-owner/selectable-repository",
    })
    .click();
  await expect(
    page.getByText("synthetic-owner/selectable-repository"),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "加载已授权仓库" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "选择 synthetic-owner/removed-after-load",
    }),
  ).toBeVisible();
  await request.post(
    "http://127.0.0.1:54334/__fixture/remove-repository",
  );
  await page
    .getByRole("button", {
      name: "选择 synthetic-owner/removed-after-load",
    })
    .click();
  await expect(
    page.getByText("仓库选择失败，请稍后重试。", {
      exact: true,
    }),
  ).toBeVisible();

  await request.post("http://127.0.0.1:54334/__fixture/revoke");
  await page.reload();
  await openOnboardingSection(page, "接入诊断");
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "取消选择 synthetic-owner/restored-repository",
    })
    .click();
  await expect(
    page.getByText("synthetic-owner/restored-repository"),
  ).toHaveCount(0);

  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(storage.local).toEqual([]);
  expect(
    storage.session.filter(
      ([key]) => !key.startsWith("__next_debug_channel:"),
    ),
  ).toEqual([]);
  expect(JSON.stringify(storage.session)).not.toMatch(
    /synthetic-owner\/|fixture-opaque-installation-token|service.role|selectedRepositories/i,
  );

  const state = await (
    await request.get("http://127.0.0.1:54334/__fixture/state")
  ).json();
  expect(state).toMatchObject({
    fixture_id: "refresh_restores_selection",
    fixture_version: "1.0.0",
    source_type: "synthetic",
    contains_real_secret: false,
    real_github_called: false,
    selection_write_calls: 1,
    selection_delete_calls: 2,
    selected_repository_count: 0,
    project_created: false,
    sync_started: false,
    forbidden_endpoint_calls: 0,
  });
  expect(state.token_create_calls).toBe(state.token_revoke_calls);
  expect(state.token_create_calls).toBeGreaterThanOrEqual(3);
  expect(externalBrowserRequests).toEqual([]);
  expect(JSON.stringify(storage)).not.toMatch(
    /fixture-opaque-installation-token|private key|service.role/i,
  );
  await expect(
    page.getByRole("button", { name: /Project|同步|导入|Select All/i }),
  ).toHaveCount(0);

  // The original full scenario and exact side-effect counts above stay intact.
  // A separate synthetic permission event adds two repositories, with one
  // transient storage failure. Returning does not invoke setup or bulk select.
  await request.post("http://127.0.0.1:54334/__fixture/add-authorization");
  await page.getByRole("button", { name: "已返回，刷新授权和仓库" }).click();
  await expect(page.getByRole("button", { name: "选择 synthetic-owner/new-first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择 synthetic-owner/new-second" })).toBeVisible();
  await expect(page.getByText("synthetic-owner/removed-after-load", { exact: true })).toHaveCount(0);
  await expect(page.getByText("尚未选择仓库。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "选择 synthetic-owner/new-first" }).click();
  await expect(page.getByRole("button", { name: "取消选择 synthetic-owner/new-first" })).toBeVisible();
  await page.getByRole("button", { name: "选择 synthetic-owner/new-second" }).click();
  await expect(page.getByRole("button", { name: "重试选择 synthetic-owner/new-second" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消选择 synthetic-owner/new-first" })).toBeVisible();
  await page.getByRole("button", { name: "重试选择 synthetic-owner/new-second" }).click();
  await expect(page.getByRole("button", { name: "取消选择 synthetic-owner/new-second" })).toBeVisible();
  await expect(page.getByRole("region", { name: "已选择仓库", exact: true }).getByText("已选择，待建项", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "已返回，刷新授权和仓库" }).click();
  await expect(page.getByRole("button", { name: "取消选择 synthetic-owner/new-first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消选择 synthetic-owner/new-second" })).toBeVisible();
  const finalState = await (await request.get("http://127.0.0.1:54334/__fixture/state")).json();
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("GitHub App 已连接");
  await expect(page.getByRole("complementary", { name: "当前账号" })).toContainText("我的项目（0）");
  expect(finalState).toMatchObject({ selection_write_calls: 3, selected_repository_count: 2, project_created: false, sync_started: false, forbidden_endpoint_calls: 0 });
  expect(finalState.token_create_calls).toBe(finalState.token_revoke_calls);
  expect(externalBrowserRequests).toEqual([]);
  await page.screenshot({ path: "test-results/repository-management-results.png", fullPage: true });
});
