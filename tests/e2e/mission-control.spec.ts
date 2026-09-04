import { expect, test } from "@playwright/test";

function isLocalRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl);

  return hostname === "127.0.0.1" || hostname === "localhost";
}

test("shows fictional recorded tasks, five local states and a draft at 360px", async ({
  page,
}) => {
  const nonLocalRequests: string[] = [];

  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/mission-control");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Mission Control" }),
  ).toBeVisible();
  await expect(page.getByLabel("数据来源")).toContainText(
    "Demo · 演示数据 · 完全虚构",
  );
  await expect(page.getByLabel("数据来源")).toContainText("Preview Mode");
  await expect(page.getByRole("region", { name: "已记录任务" })).toBeVisible();
  await expect(page.getByRole("region", { name: "系统建议" })).toBeVisible();

  for (const status of [
    "suggested",
    "accepted",
    "snoozed",
    "dismissed",
    "completed",
  ]) {
    await expect(
      page.locator(`[data-suggestion-status="${status}"]`),
    ).toHaveCount(1);
  }

  await expect(page.getByRole("textbox", { name: "Issue 草稿标题" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Issue 草稿正文" })).toBeVisible();
  await expect(
    page.getByText("只生成本地草稿，不会创建 GitHub Issue。"),
  ).toBeVisible();

  const draftDisclosure = page.getByText("查看本地 Issue 草稿");
  await draftDisclosure.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Issue 草稿标题" })).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Issue 草稿标题" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
  expect(nonLocalRequests).toEqual([]);
});

test("keeps both Mission Control regions readable in vertical order at 768px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/mission-control");

  const layout = await page.evaluate(() => {
    const regions = Array.from(
      document.querySelectorAll<HTMLElement>(
        'section[aria-labelledby="recorded-tasks-title"], section[aria-labelledby="suggestions-title"]',
      ),
    );
    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));

    if (regions.length !== 2 || articles.length === 0) {
      return { verticalOrder: false, withinViewport: false };
    }

    const [recorded, suggestions] = regions;
    const recordedBox = recorded!.getBoundingClientRect();
    const suggestionsBox = suggestions!.getBoundingClientRect();

    return {
      verticalOrder: suggestionsBox.top >= recordedBox.bottom,
      withinViewport: articles.every((article) => {
        const box = article.getBoundingClientRect();
        return box.left >= 0 && box.right <= document.documentElement.clientWidth;
      }),
    };
  });

  expect(layout).toEqual({ verticalOrder: true, withinViewport: true });
});
