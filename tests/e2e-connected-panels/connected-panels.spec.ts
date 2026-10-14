import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const identities = {
  alpha: {
    userId: "11111111-1111-4111-8111-111111111111",
    projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
  beta: {
    userId: "22222222-2222-4222-8222-222222222222",
    projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
} as const;

function observeNonLocalRequests(page: Page) {
  const requests: string[] = [];

  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      requests.push(request.url());
    }
  });

  return requests;
}

async function useIdentity(
  context: BrowserContext,
  identity: (typeof identities)[keyof typeof identities],
) {
  await context.addCookies([
    {
      name: "connected-panel-verified-user",
      value: identity.userId,
      url: "http://127.0.0.1:3006",
      httpOnly: true,
      sameSite: "Strict",
    },
    {
      name: "connected-panel-project",
      value: identity.projectId,
      url: "http://127.0.0.1:3006",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

async function narrowViewport(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
          document.documentElement.clientWidth &&
        document.body.scrollWidth <= document.body.clientWidth,
    ),
  ).toBe(true);
}

for (const scenario of ["unconfirmed", "legacy-v1", "legacy-v2"] as const) {
  test(`T05 ${scenario} 项目背景与当前或历史简报可读`, async ({ context, page }) => {
    const nonLocalRequests = observeNonLocalRequests(page);
    await useIdentity(context, identities.beta);
    await context.addCookies([{ name: "connected-panel-scenario", value: scenario, url: "http://127.0.0.1:3006", httpOnly: true, sameSite: "Strict" }]);
    if (scenario === "unconfirmed") {
      await page.goto(`/project-galaxy?mode=connected&project=${identities.beta.projectId}`);
      await expect(page.getByRole("main").getByText("Beta Connected Project", { exact: true })).toBeVisible();
      await expect(page.getByText("核心目标未确认", { exact: true })).toBeVisible();
      await expect(page.getByText("当前阶段目标未确认", { exact: true })).toBeVisible();
      await expect(page.getByText("Beta 用户的确定性 Connected 活动")).toBeVisible();
    }
    await page.goto(`/copilot?mode=connected&projectId=${identities.beta.projectId}`);
    const brief = page.getByRole("region", { name: "项目简报", exact: true });
    await expect(brief).toBeVisible();
    await expect(brief).toContainText("虚构项目已完成导航基线");
    if (scenario === "unconfirmed") {
      await expect(brief).toContainText("仓库记录（github_issue，摘录）");
      await expect(brief).toContainText("该记录不代表用户确认项目背景。");
      for (const text of ["核心目标未确认", "当前阶段目标未确认", "正式状态未确认"]) await expect(brief.getByText(text, { exact: true })).toBeVisible();
      await expect(brief.getByRole("region", { name: "官方状态" })).toContainText("未确认");
    } else await expect(brief.getByRole("region", { name: "官方状态" })).toContainText("in_development");
    expect(nonLocalRequests).toEqual([]);
  });
}

test("selects an authorized Project Galaxy project and denies both cross-user directions", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);

  await useIdentity(context, identities.alpha);
  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.alpha.projectId}`,
  );
  await expect(page.getByLabel("数据来源")).toContainText("Connected Mode");
  await expect(page.getByRole("main").getByText("Alpha Connected Project", { exact: true })).toBeVisible();
  await expect(page.getByText("Beta Connected Project")).not.toBeVisible();
  await expect(page.getByText("Authorization revoked")).toBeVisible();
  await expect(page.getByText("GitHub 授权已撤销，同步已停止。")).toBeVisible();
  await expect(page.getByText("Alpha 用户的确定性 Connected 活动")).toBeVisible();

  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.beta.projectId}`,
  );
  await expect(page.getByText("没有可显示的项目")).toBeVisible();
  await expect(page.getByText("Beta Connected Project")).not.toBeVisible();

  await useIdentity(context, identities.beta);
  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.beta.projectId}`,
  );
  await expect(page.getByRole("main").getByText("Beta Connected Project", { exact: true })).toBeVisible();
  await expect(page.getByText("Alpha Connected Project")).not.toBeVisible();

  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.alpha.projectId}`,
  );
  await expect(page.getByText("没有可显示的项目")).toBeVisible();
  await expect(page.getByText("Alpha Connected Project")).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(nonLocalRequests).toEqual([]);
});

test("binds repository removal confirmation and waits for the completed API result", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  const submittedBodies: unknown[] = [];
  await useIdentity(context, identities.alpha);
  await page.route(
    `**/api/projects/${identities.alpha.projectId}/repository-removal`,
    async (route) => {
      submittedBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          operation: {
            operationId: "33333333-3333-4333-8333-333333333333",
            projectId: identities.alpha.projectId,
            mode: "REMOVE_REPOSITORY_DATA",
            status: "completed",
            outcome: "executed",
            counts: {
              deleted: { github_commits: 2 },
              preserved: { projects: 1 },
              invalidated: { evidence_links: 3 },
            },
            safelyRetryable: true,
            completedAt: "2026-08-25T01:00:00.000Z",
          },
        }),
      });
    },
  );

  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.alpha.projectId}`,
  );
  await expect(page.getByRole("button", { name: "移除仓库数据" })).toBeVisible();
  await expect(page.getByRole("button", { name: "删除整个项目" })).toBeVisible();

  await page.getByRole("button", { name: "删除整个项目" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "确认删除整个项目" });
  await expect(deleteDialog).toContainText(`DELETE ${identities.alpha.projectId}`);
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  expect(submittedBodies).toEqual([]);

  await page.getByRole("button", { name: "移除仓库数据" }).click();
  const removeDialog = page.getByRole("dialog", { name: "确认移除仓库数据" });
  const submit = removeDialog.getByRole("button", { name: "确认移除仓库数据" });
  await expect(submit).toBeDisabled();
  await removeDialog.getByLabel("确认文本").fill(
    `REMOVE ${identities.alpha.projectId}`,
  );
  await submit.click();
  await expect(page.getByText("仓库数据已移除")).toBeVisible();
  await expect(page.getByText(/3 条 Evidence Link/)).toBeVisible();
  expect(submittedBodies).toHaveLength(1);
  expect(submittedBodies[0]).toMatchObject({
    projectId: identities.alpha.projectId,
    mode: "REMOVE_REPOSITORY_DATA",
    confirmation: {
      projectId: identities.alpha.projectId,
      text: `REMOVE ${identities.alpha.projectId}`,
    },
  });
  expect(nonLocalRequests).toEqual([]);
});

test("filters the Connected Flight Log by exact type and UTC window", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);
  await useIdentity(context, identities.alpha);
  await page.goto("/flight-log?mode=connected");

  await expect(page.getByLabel("数据来源")).toContainText("Connected Mode");
  await expect(page.getByRole("article")).toHaveCount(2);
  const form = page.getByRole("search", { name: "筛选航行日志" });
  for (const checkbox of await form.getByRole("checkbox").all()) {
    await checkbox.uncheck();
  }
  const issue = form.getByRole("checkbox", { name: "Issue" });
  await issue.focus();
  await page.keyboard.press("Space");
  await form.getByRole("combobox", { name: "时间范围" }).selectOption("24h");
  const apply = form.getByRole("button", { name: "应用筛选" });
  await apply.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByText("相同标题的 Connected 事件")).toBeVisible();
  await expect(page.getByText("Beta project issue")).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(nonLocalRequests).toEqual([]);
});

test("accepts a Connected suggestion without changing recorded task facts", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);
  await useIdentity(context, identities.alpha);
  await page.goto("/mission-control?mode=connected");

  const recordedTasks = page.getByRole("region", { name: "已记录任务" });
  await expect(recordedTasks.getByText("Alpha 已记录事实任务")).toHaveCount(1);
  await expect(page.locator('[data-suggestion-status="suggested"]')).toHaveCount(1);
  const accept = page.getByRole("button", { name: "接受建议" });
  await accept.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-suggestion-status="accepted"]')).toHaveCount(1);
  await expect(recordedTasks.getByText("Alpha 已记录事实任务")).toHaveCount(1);
  await expect(page.getByText("Beta 已记录事实任务")).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(nonLocalRequests).toEqual([]);
});

test("renders a read-only Connected Issue draft with suggestion lineage", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);
  await useIdentity(context, identities.alpha);
  await page.goto(
    "/mission-control?mode=connected&action=transition&suggestionId=suggestion-alpha&nextStatus=accepted",
  );

  await expect(page.getByRole("textbox", { name: "Issue 草稿标题" })).toHaveValue(
    "Alpha 本地 Issue 草稿",
  );
  await expect(page.getByRole("textbox", { name: "Issue 草稿标题" })).toHaveAttribute(
    "readonly",
  );
  await expect(page.getByText("来源建议 ID：suggestion-alpha")).toBeVisible();
  await expect(page.getByText(/suggestion-beta/)).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(nonLocalRequests).toEqual([]);
});

test("creates a local Connected DecisionRecord with actor and creation lineage", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);
  await useIdentity(context, identities.beta);
  await page.goto("/decision-archive?mode=connected");

  const form = page.getByRole("form", { name: "手动创建决策记录" });
  await form.getByRole("textbox", { name: "决定内容" }).fill("Connected E2E 手动决策");
  await form.getByRole("textbox", { name: "确认原因" }).fill("Beta 用户明确确认");
  const submit = form.getByRole("button", { name: "生成本地记录预览" });
  await submit.focus();
  await page.keyboard.press("Enter");

  const record = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Connected E2E 手动决策" }),
  });
  await expect(record).toContainText("创建方式：手动创建");
  await expect(record).toContainText("connected-beta-captain");
  await expect(record).not.toContainText("connected-alpha-captain");
  await expectNoHorizontalOverflow(page);
  expect(nonLocalRequests).toEqual([]);
});

test("keeps Connected Copilot evidence isolated for both users", async ({
  context,
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);

  await useIdentity(context, identities.alpha);
  await page.goto("/copilot?mode=connected");
  await expect(page.getByText("evidence-alpha-project")).toBeVisible();
  await expect(page.getByText("evidence-beta-project")).not.toBeVisible();

  await useIdentity(context, identities.beta);
  await page.goto("/copilot?mode=connected");
  await expect(page.getByText("evidence-beta-project")).toBeVisible();
  await expect(page.getByText("evidence-alpha-project")).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(nonLocalRequests).toEqual([]);
});

test("fails Connected routes closed without an authorized fixture session or Preview fallback", async ({
  page,
}) => {
  const nonLocalRequests = observeNonLocalRequests(page);
  await narrowViewport(page);

  for (const route of [
    "/project-galaxy?mode=connected",
    "/flight-log?mode=connected",
    "/mission-control?mode=connected",
    "/decision-archive?mode=connected",
    "/copilot?mode=connected",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("complementary", { name: "当前账号" }).getByRole("alert")).toContainText("账号服务尚未配置");
    const main = page.getByRole("main");
    await expect(main).toHaveAttribute("data-ui-state", "failed");
    await expect(main.getByRole("alert")).toContainText("暂时无法确认当前账号");
    await expect(main.getByText(/下一步/)).toBeVisible();
    await expect(main.getByRole("link", { name: "重试读取", exact: true })).toHaveAttribute("href", route);
    await expect(page.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toHaveCount(0);
    await expect(main).not.toContainText("Alpha Connected Project");
    await expect(main).not.toContainText("Beta Connected Project");
    await expect(page.getByRole("navigation", { name: "桌面主导航" })).toHaveCount(0);
    await expect(page.getByText("Demo · 演示数据 · 完全虚构")).not.toBeVisible();
  }

  expect(nonLocalRequests).toEqual([]);
});
