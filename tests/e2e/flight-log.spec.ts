import { expect, test } from "@playwright/test";

function isLocalRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl);

  return hostname === "127.0.0.1" || hostname === "localhost";
}

test("shows and filters the fictional Flight Log at 360px", async ({ page }) => {
  const nonLocalRequests: string[] = [];

  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/flight-log");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Flight Log" }),
  ).toBeVisible();
  await expect(page.getByLabel("数据来源")).toContainText(
    "Demo · 演示数据 · 完全虚构",
  );
  await expect(page.getByLabel("数据来源")).toContainText("Preview Mode");
  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(
    page.getByRole("status", { name: "Flight Log 数据新鲜度" }),
  ).toContainText("Fresh");

  const originalLinks = page.getByRole("link", { name: "查看原始记录" });
  await expect(originalLinks).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(originalLinks.nth(index)).toHaveAttribute("href", /^https:/);
  }
  await expect(page.getByText("原始链接不可用")).toBeVisible();

  const form = page.getByRole("search", { name: "筛选航行日志" });
  const checkboxes = form.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(6);

  for (let index = 0; index < 6; index += 1) {
    await checkboxes.nth(index).uncheck();
  }

  const issueCheckbox = form.getByRole("checkbox", { name: "Issue" });
  await issueCheckbox.focus();
  await page.keyboard.press("Space");
  await expect(issueCheckbox).toBeChecked();
  await form.getByRole("combobox", { name: "时间范围" }).selectOption("24h");
  await form.getByRole("button", { name: "应用筛选" }).click();

  await expect(page).toHaveURL(/apply=1/);
  await expect(page).toHaveURL(/type=issue/);
  await expect(page).toHaveURL(/range=24h/);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByText("关闭虚构 Issue #42：移动端筛选复核")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
  expect(nonLocalRequests).toEqual([]);
});

test("keeps the Flight Log controls and timeline readable at 768px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/flight-log");

  const layout = await page.evaluate(() => {
    const form = document.querySelector<HTMLElement>(
      'form[aria-label="筛选航行日志"]',
    );
    const fieldset = form?.querySelector<HTMLElement>("fieldset");
    const select = form?.querySelector<HTMLElement>("select");
    const button = form?.querySelector<HTMLElement>('button[type="submit"]');
    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));

    if (!form || !fieldset || !select || !button || articles.length !== 6) {
      return { aligned: false, withinViewport: false };
    }

    const fieldsetBox = fieldset.getBoundingClientRect();
    const selectBox = select.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const withinViewport = articles.every((article) => {
      const box = article.getBoundingClientRect();
      return box.left >= 0 && box.right <= document.documentElement.clientWidth;
    });

    return {
      aligned:
        fieldsetBox.left < selectBox.left && selectBox.right <= buttonBox.left,
      withinViewport,
    };
  });

  expect(layout).toEqual({ aligned: true, withinViewport: true });
  await expect(page.getByRole("region", { name: "Flight Log 时间线" })).toBeVisible();
});
