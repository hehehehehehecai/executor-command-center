import { expect, test } from "@playwright/test";

test("creates, reads and repeats one synthetic project without proliferation or network", async ({
  page,
  request,
}) => {
  const externalBrowserRequests: string[] = [];
  page.on("request", (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (
      url.origin !== "http://127.0.0.1:3004" &&
      url.origin !== "http://127.0.0.1:54334"
    ) {
      externalBrowserRequests.push(url.origin);
    }
  });

  await page.goto("/");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3004/onboarding");
  await expect(page.getByRole("region", { name: "仓库事实" })).toContainText(
    "synthetic-owner/restored-repository",
  );
  await expect(
    page.getByRole("region", { name: "项目校准", exact: true }),
  ).toContainText("用户陈述");

  await page.getByLabel("核心目标").fill("Ship the synthetic MVP");
  await page
    .getByLabel("当前阶段目标")
    .fill("Complete deterministic calibration");
  await page.getByLabel("正式状态").selectOption("in_development");
  await page.getByLabel("当前阻碍（可选）").fill("Fixture-only blocker");
  await page.getByRole("button", { name: "保存项目校准" }).click();
  await expect(page.getByRole("status")).toHaveText("项目校准已保存");

  await page.reload();
  await expect(page.getByLabel("核心目标")).toHaveValue(
    "Ship the synthetic MVP",
  );
  await expect(page.getByLabel("当前阶段目标")).toHaveValue(
    "Complete deterministic calibration",
  );
  await expect(page.getByLabel("正式状态")).toHaveValue("in_development");
  await expect(page.getByLabel("当前阻碍（可选）")).toHaveValue(
    "Fixture-only blocker",
  );

  await page
    .getByLabel("当前阶段目标")
    .fill("Repeat submission updates the same active project");
  await page.getByRole("button", { name: "保存项目校准" }).click();
  await expect(page.getByRole("status")).toHaveText("项目校准已保存");

  await page
    .getByRole("button", {
      name: "取消选择 synthetic-owner/restored-repository",
    })
    .click();
  await expect(page.getByText("存在有效项目，无法取消选择。")).toBeVisible();

  const state = await (
    await request.get("http://127.0.0.1:54334/__fixture/state")
  ).json();
  expect(state).toMatchObject({
    source_type: "synthetic",
    contains_real_secret: false,
    real_github_called: false,
    project_created: true,
    project_write_calls: 2,
    project_count: 1,
    active_project_count: 1,
    token_create_calls: 0,
    repository_page_calls: 0,
    forbidden_endpoint_calls: 0,
    sync_started: false,
  });
  expect(state.project_read_calls).toBeGreaterThanOrEqual(2);
  expect(externalBrowserRequests).toEqual([]);

  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage).filter(
      ([key]) => !key.startsWith("__next_debug_channel:"),
    ),
  }));
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(JSON.stringify(storage)).not.toMatch(
    /service.role|fixture-only-blocker|Ship the synthetic MVP/i,
  );
});
