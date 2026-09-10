import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { chromium, expect, test, type Page } from "@playwright/test";

// These cases catch missing, clipped, displaced or restyled real page content.
// Baselines are reviewed separately; matching pixels never grants art approval.
const pages = [
  { id: "command-deck", route: "/", heading: "EXECUTOR", content: "Helios Archive" },
  { id: "project-galaxy", route: "/project-galaxy", heading: "Project Galaxy", content: "Aurora Cartography" },
  { id: "flight-log", route: "/flight-log", heading: "Flight Log", content: "Flight Log 时间线" },
  { id: "mission-control", route: "/mission-control", heading: "Mission Control", content: "已记录任务" },
  { id: "decision-archive", route: "/decision-archive", heading: "Decision Archive", content: "Candidate" },
  { id: "copilot", route: "/copilot", heading: "Copilot Workspace", content: "项目简报" },
] as const;

const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
] as const;

const fixedTime = "2026-08-18T01:00:00.000Z";
const renderer = { executable: chromium.executablePath(), sha256: "b798f9e53a98d29eb7f36f8c409f905d3184780a04d2bcb56989067194784bd1" };
const fonts = [
  { file: "STXINGKA.TTF", family: "STXingkai", sha256: "7f901dfb0526d542740264fb5ba8dfe483293ad060270d273593e2f04a69d080" },
  { file: "NotoSansSC-VF.ttf", family: "Noto Sans SC", sha256: "763146584cf0710223441356b4395e279021b0806c196614377a7a0174ae074a" },
] as const;

test.beforeAll(async ({ browser, request }) => {
  expect(process.platform, "This baseline requires the frozen Win32 renderer").toBe("win32");
  expect(browser.version(), "Review baselines before changing Chromium").toBe("149.0.7827.55");
  expect(createHash("sha256").update(readFileSync(renderer.executable)).digest("hex"), "Frozen Chromium executable").toBe(renderer.sha256);
  const browserSession = await browser.newBrowserCDPSession();
  try {
    const commandLine = await browserSession.send("Browser.getBrowserCommandLine");
    expect(path.resolve(commandLine.arguments[0]).toLowerCase(), "Actual launched renderer").toBe(path.resolve(renderer.executable).toLowerCase());
  } finally {
    await browserSession.detach();
  }
  const windowsDirectory = process.env.WINDIR ?? process.env.SystemRoot;
  expect(windowsDirectory, "A Windows font directory is required").toBeTruthy();
  for (const font of fonts) {
    const bytes = readFileSync(path.join(windowsDirectory!, "Fonts", font.file));
    expect(createHash("sha256").update(bytes).digest("hex"), font.family).toBe(font.sha256);
  }
  // Native development tooling is not part of the product. No product DOM/CSS is hidden.
  const response = await request.post("/__nextjs_disable_dev_indicator");
  expect(response.status(), "Use the local Preview development server").toBe(204);
});

async function renderedFonts(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    const observations = [];
    for (const [selector, family] of [["h1", "STXingkai"], ["main p", "Noto Sans SC"]]) {
      const { nodeIds } = await session.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector });
      let found = false;
      for (const [index, nodeId] of nodeIds.entries()) {
        const result = await session.send("CSS.getPlatformFontsForNode", { nodeId });
        // Responsive shells can keep hidden paragraphs in the DOM; inspect rendered glyphs.
        if (result.fonts.length === 0) continue;
        expect(result.fonts.every((font) => font.familyName === family && !font.isCustomFont), `${selector}: no fallback fonts`).toBe(true);
        observations.push({ selector, matchedNodeIndex: index, expected: family, fonts: result.fonts });
        found = true;
        break;
      }
      expect(found, `${selector}: rendered text is required`).toBe(true);
    }
    return observations;
  } finally {
    await session.detach();
  }
}

for (const viewport of viewports) {
  test.describe(viewport.id, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    for (const definition of pages) {
      test(`${definition.id}-${viewport.id}`, async ({ page, context, browser }, testInfo) => {
        const origin = new URL(testInfo.project.use.baseURL!).origin;
        const runtime = { consoleErrors: [] as string[], pageErrors: [] as string[], failedRequests: [] as string[], nonLocalRequests: [] as string[] };
        page.on("console", (message) => { if (message.type() === "error") runtime.consoleErrors.push(message.text()); });
        page.on("pageerror", (error) => runtime.pageErrors.push(error.message));
        page.on("requestfailed", (request) => runtime.failedRequests.push(`${request.url()}:${request.failure()?.errorText}`));
        await context.route("**/*", async (route) => {
          if (new URL(route.request().url()).origin !== origin) {
            runtime.nonLocalRequests.push(route.request().url());
            await route.abort();
          } else {
            await route.continue();
          }
        });
        await page.clock.setFixedTime(new Date(fixedTime));
        const response = await page.goto(definition.route);
        expect(response?.status()).toBe(200);
        await expect(page).toHaveURL(origin + definition.route);
        await expect(page.locator("html")).toHaveAttribute("data-executor-theme", "deep-space");
        await expect(page.getByRole("main")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1, name: definition.heading, exact: true })).toBeVisible();
        await expect(page.locator("body")).toContainText(definition.content);
        await expect(page.locator("body")).toContainText("演示数据");
        if (definition.id === "command-deck") {
          await expect(page.getByLabel("Preview 数据说明")).toContainText("完全虚构");
          if (viewport.id === "mobile") await expect(page.getByRole("button", { name: "打开主导航" })).toBeVisible();
          else await expect(page.getByRole("navigation", { name: "桌面主导航" })).toBeVisible();
        } else {
          await expect(page.locator('[data-panel-mode="preview"]')).toContainText("完全虚构");
          await expect(page.getByRole("link", { name: "返回 Command Deck", exact: true })).toHaveAttribute("href", "/");
        }
        await page.waitForLoadState("networkidle");
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.images, (image) => image.decode()));
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        });
        const actualFonts = await renderedFonts(page);
        const geometry = await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
          bodyWidth: document.body.scrollWidth,
          text: document.body.innerText,
          time: new Date().toISOString(),
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        }));
        expect(geometry.document.width).toBeLessThanOrEqual(viewport.width);
        expect(geometry.bodyWidth).toBeLessThanOrEqual(viewport.width);
        expect(geometry.document.height).toBeGreaterThan(0);
        expect(geometry.time).toBe(fixedTime);
        expect(geometry.reducedMotion).toBe(true);
        expect(runtime).toEqual({ consoleErrors: [], pageErrors: [], failedRequests: [], nonLocalRequests: [] });
        const snapshot = `${definition.id}-${viewport.id}-chromium-win32.png`;
        await testInfo.attach("visual-context", {
          body: JSON.stringify({ page: definition.id, viewport, url: page.url(), snapshot, theme: "deep-space", fixedTime, fixture: "existing static Preview data; no HTML/RSC replacement", browser: browser.version(), renderer, fonts, actualFonts, geometry, runtime, mask: [] }, null, 2),
          contentType: "application/json",
        });
        await testInfo.attach("rendered-page", {
          body: await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" }),
          contentType: "image/png",
        });
        await expect(page).toHaveScreenshot(snapshot, { fullPage: true });
        expect(runtime).toEqual({ consoleErrors: [], pageErrors: [], failedRequests: [], nonLocalRequests: [] });
      });
    }
  });
}
