import { expect, test } from "@playwright/test";

function isLocalRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl);

  return hostname === "127.0.0.1" || hostname === "localhost";
}

test("confirms a fictional Candidate with a required reason at 360px", async ({
  page,
}) => {
  const nonLocalRequests: string[] = [];

  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/decision-archive");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Decision Archive" }),
  ).toBeVisible();
  await expect(page.getByLabel("数据来源")).toContainText(
    "Demo · 演示数据 · 完全虚构",
  );
  await expect(page.getByRole("region", { name: "决策候选" })).toBeVisible();
  await expect(page.getByRole("region", { name: "正式决策记录" })).toBeVisible();
  await expect(page.locator("[data-candidate-status]")).toHaveCount(2);

  const confirmForm = page.getByRole("form", {
    name: "确认候选：采用虚构的分阶段发布策略",
  });
  const reason = confirmForm.getByRole("textbox", { name: "用户确认原因" });
  await reason.focus();
  await reason.fill("用户确认先降低虚构发布风险");
  const confirmButton = confirmForm.getByRole("button", {
    name: "确认并生成本地记录",
  });
  await confirmButton.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/action=confirm/);
  await expect(page.getByRole("status")).toContainText(
    "Candidate 已在本地确认并生成 Record 预览；未持久化。",
  );
  await expect(page.locator("[data-candidate-status]")).toHaveCount(2);
  await expect(page.locator('[data-candidate-status="confirmed"]')).toHaveCount(2);
  await expect(page.getByText("来源 Candidate：candidate-release-window")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
  expect(nonLocalRequests).toEqual([]);
});

test("keeps manual creation, Candidates and Records readable at 768px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/decision-archive");

  const layout = await page.evaluate(() => {
    const manual = document.querySelector<HTMLElement>(
      'section[aria-labelledby="manual-decision-title"]',
    );
    const candidates = document.querySelector<HTMLElement>(
      'section[aria-labelledby="decision-candidates-title"]',
    );
    const records = document.querySelector<HTMLElement>(
      'section[aria-labelledby="decision-records-title"]',
    );
    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));

    if (!manual || !candidates || !records || articles.length === 0) {
      return { verticalOrder: false, withinViewport: false };
    }

    const manualBox = manual.getBoundingClientRect();
    const candidatesBox = candidates.getBoundingClientRect();
    const recordsBox = records.getBoundingClientRect();

    return {
      verticalOrder:
        candidatesBox.top >= manualBox.bottom && recordsBox.top >= candidatesBox.bottom,
      withinViewport: articles.every((article) => {
        const box = article.getBoundingClientRect();
        return box.left >= 0 && box.right <= document.documentElement.clientWidth;
      }),
    };
  });

  expect(layout).toEqual({ verticalOrder: true, withinViewport: true });
  await expect(
    page.getByRole("form", { name: "手动创建决策记录" }),
  ).toBeVisible();
});
