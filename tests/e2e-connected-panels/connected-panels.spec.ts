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
  await expect(page.getByText("Alpha Connected Project")).toBeVisible();
  await expect(page.getByText("Beta Connected Project")).not.toBeVisible();

  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.beta.projectId}`,
  );
  await expect(page.getByText("没有可显示的项目")).toBeVisible();
  await expect(page.getByText("Beta Connected Project")).not.toBeVisible();

  await useIdentity(context, identities.beta);
  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.beta.projectId}`,
  );
  await expect(page.getByText("Beta Connected Project")).toBeVisible();
  await expect(page.getByText("Alpha Connected Project")).not.toBeVisible();

  await page.goto(
    `/project-galaxy?mode=connected&project=${identities.alpha.projectId}`,
  );
  await expect(page.getByText("没有可显示的项目")).toBeVisible();
  await expect(page.getByText("Alpha Connected Project")).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
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
    await expect(page.getByText(/Connected 数据暂时不可用。|没有可显示的项目/)).toBeVisible();
    await expect(page.getByText("Demo · 演示数据 · 完全虚构")).not.toBeVisible();
  }

  expect(nonLocalRequests).toEqual([]);
});
