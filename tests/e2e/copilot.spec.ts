import { expect, test } from "@playwright/test";

function isLocalRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl);

  return hostname === "127.0.0.1" || hostname === "localhost";
}

test("clears project-scoped evidence without external requests at 360px", async ({
  page,
}) => {
  const nonLocalRequests: string[] = [];

  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/copilot");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Copilot Workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("数据来源")).toContainText(
    "Demo · 演示数据 · 完全虚构",
  );
  await expect(page.getByText("本阶段不生成答案，也不调用 AI 模型。")).toBeVisible();

  const switchForm = page.getByRole("form", {
    name: "切换 Copilot 上下文",
  });
  await switchForm.getByRole("textbox", { name: "项目 ID" }).fill("project-atlas");
  const switchButton = switchForm.getByRole("button", {
    name: "切换并校准上下文",
  });
  await switchButton.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/action=switch/);
  await expect(page.getByText("project-atlas")).toBeVisible();
  await expect(page.getByText("暂无证据引用")).toBeVisible();
  await expect(page.getByText("项目已切换，旧引用已清除")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
  expect(nonLocalRequests).toEqual([]);
});

test("keeps evidence controls in vertical reading order at 768px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/copilot");

  const evidenceForm = page.getByRole("form", { name: "添加证据引用" });
  await evidenceForm
    .getByRole("textbox", { name: "证据引用 ID" })
    .fill("evidence-freshness\nevidence-decision\nevidence-goal");
  await evidenceForm.getByRole("button", { name: "更新本地引用" }).click();

  const evidenceRegion = page.getByRole("region", { name: "证据引用" });
  await expect(evidenceRegion.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("status")).toContainText(
    "本地证据引用已更新；未发送到外部服务。",
  );

  const layout = await page.evaluate(() => {
    const context = document.querySelector<HTMLElement>(
      'section[aria-labelledby="copilot-context-title"]',
    );
    const evidence = document.querySelector<HTMLElement>(
      'section[aria-labelledby="copilot-evidence-title"]',
    );

    if (!context || !evidence) {
      return { verticalOrder: false, withinViewport: false };
    }

    const contextBox = context.getBoundingClientRect();
    const evidenceBox = evidence.getBoundingClientRect();

    return {
      verticalOrder: evidenceBox.top >= contextBox.bottom,
      withinViewport:
        contextBox.left >= 0 &&
        contextBox.right <= document.documentElement.clientWidth &&
        evidenceBox.left >= 0 &&
        evidenceBox.right <= document.documentElement.clientWidth,
    };
  });

  expect(layout).toEqual({ verticalOrder: true, withinViewport: true });
});
