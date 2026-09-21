import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const sources = [
  { name: "base", url: "/copilot", feedback: null },
  { name: "error", url: "/copilot?mode=preview&action=switch&featureId=unknown-feature&projectId=", feedback: "未知面板，未改变当前上下文。" },
] as const;
const modes = ["skip-mouse", "skip-keyboard", "no-skip-mouse"] as const;
const projectId = "20000000-0000-4000-8000-000000000002";
const targetId = "copilot-selected-evidence";

async function ready(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function tabTo(page: Page, target: Locator, trace: unknown[]) {
  for (let index = 0; index < 60; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
    trace.push(await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      id: document.activeElement?.id,
      text: document.activeElement?.tagName === "BODY" ? "BODY" : document.activeElement?.textContent,
    })));
  }
  throw new Error("真实Tab未到达目标");
}

async function record(page: Page, label: string) {
  return page.evaluate((step) => {
    const target = document.querySelector<HTMLElement>('aside[aria-label="已聚焦 Evidence"]');
    const heading = target?.querySelector("h3");
    const box = target?.getBoundingClientRect();
    const titleBox = heading?.getBoundingClientRect();
    const rect = box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom, right: box.right } : null;
    return {
      step, url: location.href, historyState: history.state,
      scroll: { x: scrollX, y: scrollY }, viewport: { width: innerWidth, height: innerHeight },
      active: { tag: document.activeElement?.tagName, id: document.activeElement?.id },
      target: { rect, id: target?.id ?? null, tabIndex: target?.tabIndex ?? null,
        identity: target ? [...target.querySelectorAll("dd")].map((node) => node.textContent) : [],
        intersects: Boolean(box && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth),
        titleInViewport: Boolean(titleBox && titleBox.top >= 0 && titleBox.bottom <= innerHeight && titleBox.left >= 0 && titleBox.right <= innerWidth),
        focused: Boolean(target && document.activeElement === target),
      },
      feedback: document.querySelector('[data-feedback-kind="error"]')?.textContent ?? null,
      overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
    };
  }, label);
}

test.beforeEach(async ({ context, baseURL }, testInfo) => {
  const external: string[] = [];
  testInfo.annotations.push({ type: "fixture", description: "既有本地Preview；真实数据样本0" });
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) await route.continue();
    else { external.push(route.request().url()); await route.abort(); }
  });
  context.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin && !external.includes(request.url())) external.push(request.url());
  });
  (testInfo as typeof testInfo & { external: string[] }).external = external;
});

test.afterEach(async ({ context }, testInfo) => {
  await context.unroute("**/*");
  const external = (testInfo as typeof testInfo & { external: string[] }).external;
  await testInfo.attach("external-requests", { body: JSON.stringify(external), contentType: "application/json" });
  expect(external).toEqual([]);
});

for (const viewport of viewports) {
  for (const source of sources) {
    for (const mode of modes) {
      test(`detail ${viewport.width} ${source.name} ${mode}: restores history and focuses evidence`, async ({ page }, testInfo) => {
        const observations: unknown[] = [];
        const trace: unknown[] = [];
        try {
          await page.setViewportSize(viewport);
          await page.goto(source.url);
          await ready(page);
          await expect(page.getByRole("heading", { name: "Copilot Workspace", level: 1 })).toBeVisible();
          if (source.feedback) await expect(page.locator('[data-feedback-kind="error"]')).toHaveText(source.feedback);
          const sourceText = await page.locator("#main-content").textContent();
          if (mode !== "no-skip-mouse") {
            await page.keyboard.press("Tab");
            await expect(page.locator(".skip-link")).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(page.locator("#main-content")).toBeFocused();
          }
          const sourceUrl = page.url();
          observations.push(await record(page, "source"));
          const detail = page.getByRole("complementary", { name: "已聚焦 Evidence", exact: true });

          async function activate(region: string, kind: string, id: string) {
            const link = page.getByRole("region", { name: region, exact: true }).getByRole("link", { name: `查看证据 · ${kind} · ${id}`, exact: true });
            const tuple = JSON.stringify([kind, id, projectId]);
            if (mode === "skip-keyboard") {
              await tabTo(page, link, trace);
              await expect(link).toBeFocused();
              await page.keyboard.press("Enter");
            } else await link.click();
            await page.waitForURL((url) => url.searchParams.get("selectedEvidence") === tuple);
            await ready(page);
            await expect(detail.locator("dd")).toHaveText([kind, id, projectId]);
            const observation = await record(page, region);
            observations.push(observation);
            expect.soft(new URL(page.url()).hash).toBe(`#${targetId}`);
            expect.soft(observation.target).toMatchObject({ id: targetId, tabIndex: -1, intersects: true, titleInViewport: true, focused: true });
            expect.soft(observation.overflow).toBe(false);
          }

          await activate("摘要", "github_issue", "fictional-issue-42");
          const selectedUrl = page.url();
          await page.goBack();
          await expect(page).toHaveURL(sourceUrl);
          await ready(page);
          observations.push(await record(page, "back"));
          expect.soft(await page.locator("#main-content").textContent()).toBe(sourceText);
          await expect.soft(detail).toHaveCount(0);
          if (source.feedback) await expect.soft(page.locator('[data-feedback-kind="error"]')).toHaveText(source.feedback);
          else await expect.soft(page.locator("[data-feedback-kind]")).toHaveCount(0);
          await page.goForward();
          await expect(page).toHaveURL(selectedUrl);
          await ready(page);
          await expect(detail.locator("dd")).toHaveText(["github_issue", "fictional-issue-42", projectId]);
          const forward = await record(page, "forward");
          observations.push(forward);
          expect.soft(forward.target).toMatchObject({ intersects: true, titleInViewport: true, focused: true });
          await activate("官方状态", "project_profile", "fictional-profile");
          await activate("Freshness", "freshness", "fictional-freshness");
          await activate("已完成变更", "github_issue", "fictional-issue-42");
          await activate("进行中工作", "github_issue", "fictional-issue-42");
        } finally {
          await testInfo.attach("navigation-observations", { body: JSON.stringify({ viewport, source, mode, observations, trace }), contentType: "application/json" });
        }
      });
    }
  }

  for (const route of ["/", "/project-galaxy", "/flight-log", "/mission-control", "/decision-archive", "/copilot"]) {
    test(`shared skip ${viewport.width} ${route}: hidden until focus and enters main`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await ready(page);
      const skip = page.locator(".skip-link");
      const initial = await skip.boundingBox();
      expect(initial).not.toBeNull();
      expect(initial!.y + initial!.height).toBeLessThanOrEqual(0);
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused();
      const focused = await skip.boundingBox();
      expect(focused).not.toBeNull();
      expect(focused!.y).toBeGreaterThanOrEqual(0);
      expect(focused!.y + focused!.height).toBeLessThanOrEqual(viewport.height);
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
      const after = await record(page, "skip-enter");
      expect(new URL(page.url()).hash).toBe("#main-content");
      expect(after.overflow).toBe(false);
      await testInfo.attach("skip-observations", { body: JSON.stringify({ route, viewport, initial, focused, after }), contentType: "application/json" });
    });
  }
}
