import { expect, test } from "@playwright/test";

function isLocalRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl);

  return hostname === "127.0.0.1" || hostname === "localhost";
}

test("shows the fictional Project Galaxy in a readable 360px flow", async ({
  page,
}) => {
  const nonLocalRequests: string[] = [];

  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/project-galaxy");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Project Galaxy" }),
  ).toBeVisible();
  await expect(page.getByLabel("数据来源")).toContainText(
    "演示数据 · 完全虚构",
  );
  await expect(page.getByLabel("数据来源")).toContainText("Preview Mode");

  const fact = page.locator('[data-status-kind="fact"]');
  const suggestion = page.locator('[data-status-kind="suggestion"]');

  await expect(fact.getByText("Official Status")).toBeVisible();
  await expect(fact.getByText("官方事实")).toBeVisible();
  await expect(suggestion.getByText("Suggested Status")).toBeVisible();
  await expect(suggestion.getByText("系统建议")).toBeVisible();
  await expect(suggestion).toContainText("建议不会修改 Official Status。");

  for (const name of [
    "项目身份",
    "核心目标",
    "当前阶段目标",
    "当前阻碍",
    "最近活动",
    "数据新鲜度",
  ]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }

  const statusFlow = await page.evaluate(() => {
    const factElement = document.querySelector<HTMLElement>(
      '[data-status-kind="fact"]',
    );
    const suggestionElement = document.querySelector<HTMLElement>(
      '[data-status-kind="suggestion"]',
    );

    if (!factElement || !suggestionElement) {
      return false;
    }

    return (
      factElement.getBoundingClientRect().bottom <=
      suggestionElement.getBoundingClientRect().top
    );
  });

  expect(statusFlow).toBe(true);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "返回 Command Deck" })).toBeFocused();
  expect(nonLocalRequests).toEqual([]);
});

test("uses the wider two-column status layout at 768px", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/project-galaxy");

  const statusAlignment = await page.evaluate(() => {
    const factElement = document.querySelector<HTMLElement>(
      '[data-status-kind="fact"]',
    );
    const suggestionElement = document.querySelector<HTMLElement>(
      '[data-status-kind="suggestion"]',
    );

    if (!factElement || !suggestionElement) {
      return false;
    }

    const factBox = factElement.getBoundingClientRect();
    const suggestionBox = suggestionElement.getBoundingClientRect();

    return (
      Math.abs(factBox.top - suggestionBox.top) < 1 &&
      factBox.right <= suggestionBox.left
    );
  });

  expect(statusAlignment).toBe(true);
  await expect(page.getByRole("region", { name: "数据新鲜度" })).toContainText(
    "Fresh",
  );
});
