import { openOptionalOnboardingBackground } from "../onboarding-ui-fixture-actions";
import { expect, test } from "@playwright/test";

test("creates, reads and repeats one synthetic project without proliferation or network", async ({
  page,
  request,
}) => {
  const disabledCreate = await request.post("/api/projects/from-repository", { data: { selectedRepositoryId: "15444444-4444-4444-8444-444444444441" } });
  expect(disabledCreate.status()).toBe(404);
  expect((await disabledCreate.json()).error.code).toBe("project_context_disabled");
  const disabledPatch = await request.patch("/api/projects/15555555-5555-4555-8555-555555555555/context", { data: { coreGoal: null } });
  expect(disabledPatch.status()).toBe(404);
  expect((await disabledPatch.json()).error.code).toBe("project_context_disabled");
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
  expect((await request.post("http://127.0.0.1:54334/__fixture/project-context-flag", { data: { value: "1" } })).ok()).toBe(true);
  const created = await page.request.post("/api/projects/from-repository", { headers: { origin: "http://127.0.0.1:3004" }, data: { selectedRepositoryId: "15444444-4444-4444-8444-444444444441" } });
  expect(created.status()).toBe(200);
  await page.reload();
  await openOptionalOnboardingBackground(page);
  await expect(page.getByRole("region", { name: "仓库事实" })).toContainText(
    "synthetic-owner/restored-repository",
  );
  await expect(
    page.getByRole("region", { name: "项目背景", exact: true }),
  ).toContainText("用户陈述");

  await openOptionalOnboardingBackground(page);
  await page.getByLabel("核心目标").fill("Ship the synthetic MVP");
  await openOptionalOnboardingBackground(page);
  await page
    .getByLabel("当前阶段目标")
    .fill("Complete deterministic calibration");
  await page.getByLabel("正式状态").selectOption("in_development");
  await page.getByLabel("当前阻碍（可选）").fill("Fixture-only blocker");
  await page.getByRole("button", { name: "保存项目背景" }).click();
  await expect(page.getByRole("status")).toHaveText("项目背景已保存");
  await expect(page.getByRole("region", { name: "已选择仓库", exact: true }).getByText("已添加", { exact: true })).toBeVisible();

  await page.reload();
  await openOptionalOnboardingBackground(page);
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

  await openOptionalOnboardingBackground(page);
  await page
    .getByLabel("当前阶段目标")
    .fill("Repeat submission updates the same active project");
  await page.getByRole("button", { name: "保存项目背景" }).click();
  await expect(page.getByRole("status")).toHaveText("项目背景已保存");

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

  // A saved project remains the same project when all background is unconfirmed.
  const clear = await request.post("http://127.0.0.1:54334/__fixture/unconfirmed-project", { data: { project_id: "15555555-5555-4555-8555-555555555555" } });
  expect(clear.status()).toBe(200);
  await page.reload();
  await openOptionalOnboardingBackground(page);
  await expect(page.getByLabel("核心目标")).toHaveValue("");
  await expect(page.getByLabel("当前阶段目标")).toHaveValue("");
  await expect(page.getByLabel("正式状态")).toHaveValue("");
  await expect(page.getByRole("region", { name: "已选择仓库", exact: true })).toContainText("已添加 · 背景未确认");
  await expect(page.getByRole("region", { name: "进入已有项目" })).toContainText("synthetic-owner/restored-repository");
  await expect(page.getByRole("region", { name: "进入已有项目" }).getByRole("link", { name: "进入项目" })).toHaveAttribute("href", "/project-galaxy?mode=connected&project=15555555-5555-4555-8555-555555555555");
  await page.getByRole("button", { name: "保存项目背景" }).click();
  expect(await page.getByLabel("核心目标").evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(false);
  const unconfirmed = await (await request.get("http://127.0.0.1:54334/__fixture/state")).json();
  expect(unconfirmed).toMatchObject({ project_count: 1, active_project_count: 1, project_write_calls: 2, sync_started: false });
  expect(externalBrowserRequests).toEqual([]);
  expect((await request.post("http://127.0.0.1:54334/__fixture/project-context-flag", { data: { value: "" } })).ok()).toBe(true);
});
