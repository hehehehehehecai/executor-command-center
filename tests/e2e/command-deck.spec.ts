import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { featureRegistry } from "../../src/shared/features/feature-registry";

function isLocalRequest(requestUrl: string) {
  const { hostname } = new URL(requestUrl);

  return hostname === "127.0.0.1" || hostname === "localhost";
}

test("shows the fictional Command Deck without non-local requests at narrow width", async ({
  page,
}) => {
  const nonLocalRequests: string[] = [];

  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await expect(
    page.getByRole("heading", { level: 1, name: "EXECUTOR" }),
  ).toBeVisible();
  await expect(
    page.getByText("Command Your Projects", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Command Deck" }),
  ).toBeVisible();
  const navigationTrigger = page.getByRole("button", { name: "打开主导航" });
  await expect(navigationTrigger).toBeVisible();
  await expect(navigationTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("navigation", { name: "桌面主导航" }),
  ).toBeHidden();
  const previewContract = page.getByLabel("Preview 数据说明");
  await expect(
    previewContract.getByText("演示数据 · 完全虚构"),
  ).toBeVisible();
  await expect(previewContract.getByText("演示数据版本 1.1.0")).toBeVisible();

  const panels = page.getByRole("article");
  const links = page.getByRole("link", { name: /^打开.+演示入口$/ });

  await expect(panels).toHaveCount(5);
  await expect(links).toHaveCount(5);

  for (const [index, feature] of featureRegistry.entries()) {
    const panel = panels.nth(index);

    await expect(
      panel.getByRole("heading", { name: feature.title }),
    ).toBeVisible();
    await expect(
      panel.getByText(feature.subtitle, { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("演示数据", { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("link", {
        name: `打开${feature.subtitle}演示入口`,
      }),
    ).toHaveAttribute("href", feature.route);
  }

  await navigationTrigger.click();
  await expect(navigationTrigger).toHaveAttribute("aria-expanded", "true");

  const mobileNavigation = page.getByRole("navigation", {
    name: "移动主导航",
  });
  await expect(mobileNavigation).toBeVisible();

  for (const feature of featureRegistry) {
    await expect(
      mobileNavigation.getByRole("link", {
        name: `${feature.title} ${feature.subtitle}`,
      }),
    ).toHaveAttribute("href", feature.route);
  }

  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toBeHidden();
  await expect(navigationTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(navigationTrigger).toBeFocused();

  const mobileFlow = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(".workspace-main");
    const inspector = document.querySelector<HTMLElement>(".workspace-inspector");
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".command-panel"),
    );

    if (!workspace || !inspector || cards.length !== 5) {
      return false;
    }

    return (
      workspace.getBoundingClientRect().top < inspector.getBoundingClientRect().top &&
      cards.every(
        (card, index) =>
          index === 0 ||
          cards[index - 1].getBoundingClientRect().top <
            card.getBoundingClientRect().top,
      )
    );
  });

  expect(mobileFlow).toBe(true);

  await expect(
    page.getByText(/请登录|登录后|连接成功|同步成功|Connected Mode/i),
  ).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      document.body.scrollWidth > document.body.clientWidth,
  );

  expect(hasHorizontalOverflow).toBe(false);
  expect(nonLocalRequests).toEqual([]);
});

test("renders the Command Deck as a three-column workspace at desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const desktopNavigation = page.getByRole("navigation", {
    name: "桌面主导航",
  });
  const workspace = page.getByRole("region", { name: "Command Deck 工作区" });
  const inspector = page.getByRole("complementary", { name: "舰桥上下文" });

  await expect(desktopNavigation).toBeVisible();
  await expect(workspace).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(page.getByRole("button", { name: "打开主导航" })).toBeHidden();

  const columnOrder = await page.evaluate(() => {
    const navigation = document.querySelector<HTMLElement>(
      ".workspace-navigation",
    );
    const workspace = document.querySelector<HTMLElement>(".workspace-main");
    const inspector = document.querySelector<HTMLElement>(".workspace-inspector");

    if (!navigation || !workspace || !inspector) {
      return false;
    }

    const navigationBox = navigation.getBoundingClientRect();
    const workspaceBox = workspace.getBoundingClientRect();
    const inspectorBox = inspector.getBoundingClientRect();

    return navigationBox.left < workspaceBox.left && workspaceBox.left < inspectorBox.left;
  });

  expect(columnOrder).toBe(true);
});

test("keeps overview cards in one vertical column across the drawer breakpoint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "打开主导航" })).toBeVisible();

  const cardTops = await page
    .locator(".command-panel")
    .evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).getBoundingClientRect().top),
    );

  expect(cardTops).toHaveLength(5);
  expect(cardTops.every((top, index) => index === 0 || cardTops[index - 1] < top))
    .toBe(true);
});

const frozenDestinations = [
  { id: "project-galaxy", route: "/project-galaxy", name: "Project Galaxy 项目星图", heading: "Project Galaxy" },
  { id: "flight-log", route: "/flight-log", name: "Flight Log 航行日志", heading: "Flight Log" },
  { id: "mission-control", route: "/mission-control", name: "Mission Control 任务中枢", heading: "Mission Control" },
  { id: "decision-archive", route: "/decision-archive", name: "Decision Archive 决策档案", heading: "Decision Archive" },
  { id: "copilot", route: "/copilot", name: "Copilot AI 副驾驶", heading: "Copilot Workspace" },
] as const;

const contractViewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

async function settleBrowser(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function observeBrowser(page: Page) {
  const observations = {
    nonLocalRequests: [] as string[],
    pageErrors: [] as string[],
    consoleErrors: [] as string[],
    failedRequests: [] as string[],
    httpErrors: [] as { url: string; status: number }[],
  };
  page.on("request", (request) => {
    if (!isLocalRequest(request.url())) observations.nonLocalRequests.push(request.url());
  });
  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") observations.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => observations.failedRequests.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      observations.httpErrors.push({ url: response.url(), status: response.status() });
    }
  });
  await page.route("**/*", (route) =>
    isLocalRequest(route.request().url()) ? route.continue() : route.abort(),
  );
  return observations;
}

async function expectHealthyBrowser(
  page: Page,
  testInfo: TestInfo,
  observations: Awaited<ReturnType<typeof observeBrowser>>,
) {
  await testInfo.attach("browser-observations", {
    body: JSON.stringify({
      ...observations,
      url: page.url(),
      browser: page.context().browser()?.version(),
      theme: await page.locator("html").getAttribute("data-executor-theme"),
      recordedAt: new Date().toISOString(),
    }),
    contentType: "application/json",
  });
  expect(observations).toEqual({
    nonLocalRequests: [], pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [],
  });
}

async function openContractHome(page: Page) {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "EXECUTOR", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-executor-theme", process.env.NEXT_PUBLIC_EXECUTOR_THEME ?? "deep-space",
  );
  await settleBrowser(page);
}

async function expectNoContractOverflow(page: Page) {
  expect(await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    body: document.body.scrollWidth > document.body.clientWidth,
  }))).toEqual({ document: false, body: false });
}

test.describe("Command Deck browser contract", () => {
  test.use({
    locale: "zh-CN", timezoneId: "Asia/Shanghai", deviceScaleFactor: 1,
    colorScheme: "light", serviceWorkers: "block",
  });

  for (const viewport of contractViewports) {
    test(`keeps the three visual zones and Preview identity at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      const observations = await observeBrowser(page);
      await page.setViewportSize(viewport);
      await openContractHome(page);

      const shell = page.locator('[data-visual-zone="command-deck-shell"]');
      const main = page.locator('[data-visual-zone="command-deck-main"]');
      const support = page.locator('[data-visual-zone="command-deck-support"]');
      for (const zone of [shell, main, support]) {
        await expect(zone).toHaveCount(1);
        await expect(zone).toBeVisible();
      }
      expect(await shell.evaluate((element) => element === document.querySelector(".command-deck-shell"))).toBe(true);
      expect(await main.evaluate((element) => element === document.querySelector(".workspace-main"))).toBe(true);
      expect(await support.evaluate((element) => element === document.querySelector(".workspace-inspector"))).toBe(true);
      await expect(shell.getByRole("banner")).toHaveCount(1);
      await expect(shell.getByRole("main")).toHaveCount(1);
      await expect(main).toHaveAttribute("aria-label", "Command Deck 工作区");
      await expect(main.getByRole("heading", { name: "Command Deck", level: 2, exact: true })).toBeVisible();
      await expect(main.getByRole("article")).toHaveCount(5);
      await expect(support).toHaveAttribute("aria-label", "舰桥上下文");
      await expect(support.getByRole("heading", { name: "舰桥上下文", level: 2, exact: true })).toBeVisible();
      await expect(support.getByText("Preview Shell", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Preview 数据说明")).toContainText("演示数据 · 完全虚构");
      await expect(page.getByLabel("Preview 数据说明")).toContainText("演示数据版本 1.1.0");
      await expect(main.getByText("Helios Archive", { exact: true })).toBeVisible();
      expect(await page.locator(".command-panel").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-feature-id"))))
        .toEqual(frozenDestinations.map((destination) => destination.id));
      await expect(page.getByText(/请登录|登录后|连接成功|同步成功|Connected Mode/i)).toHaveCount(0);
      await expectNoContractOverflow(page);

      const screenshot = testInfo.outputPath(`command-deck-${viewport.width}x${viewport.height}.png`);
      await settleBrowser(page);
      await page.screenshot({
        path: screenshot, fullPage: true, animations: "disabled",
        style: "nextjs-portal {visibility:hidden!important}",
      });
      await testInfo.attach("formal-home", { path: screenshot, contentType: "image/png" });
      await testInfo.attach("formal-home-metadata", {
        body: JSON.stringify({
          route: "/", url: page.url(), viewport, dpr: 1,
          theme: await page.locator("html").getAttribute("data-executor-theme"),
          browser: page.context().browser()?.version(), capturedAt: new Date().toISOString(),
          fonts: await page.evaluate(() => ({
            body: getComputedStyle(document.body).fontFamily,
            heading: getComputedStyle(document.querySelector("h1")!).fontFamily,
          })),
        }), contentType: "application/json",
      });

      const mobile = viewport.width === 390;
      if (mobile) await page.getByRole("button", { name: "打开主导航", exact: true }).click();
      const navigation = page.getByRole("navigation", { name: mobile ? "移动主导航" : "桌面主导航", exact: true });
      await expect(navigation).toBeVisible();
      expect(await navigation.getByRole("link").evaluateAll((elements) => elements.map((element) => element.getAttribute("href"))))
        .toEqual(["/", ...frozenDestinations.map((destination) => destination.route)]);
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(navigation.getByRole("link", { name: "舰桥总览", exact: true })).toHaveAttribute("aria-current", "page");
      if (mobile) await page.keyboard.press("Escape");
      await expectHealthyBrowser(page, testInfo, observations);
    });

    test(`opens all five Preview destinations through navigation at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
      test.setTimeout(60_000);
      const observations = await observeBrowser(page);
      await page.setViewportSize(viewport);
      await openContractHome(page);
      expect(baseURL).toBeTruthy();
      const landings: { route: string; url: string; heading: string; status: number; mode: string | null }[] = [];

      for (const destination of frozenDestinations) {
        await test.step(`navigate to ${destination.route} and return home`, async () => {
          const mobile = viewport.width === 390;
          if (mobile) await page.getByRole("button", { name: "打开主导航", exact: true }).click();
          const navigation = page.getByRole("navigation", { name: mobile ? "移动主导航" : "桌面主导航", exact: true });
          const responsePromise = page.waitForResponse((response) =>
            new URL(response.url()).pathname === destination.route && response.request().method() === "GET",
          );
          await navigation.getByRole("link", { name: destination.name, exact: true }).click();
          const response = await responsePromise;
          expect(response.status()).toBe(200);
          await expect(page).toHaveURL(new URL(destination.route, baseURL).href);
          const heading = page.getByRole("heading", { name: destination.heading, level: 1, exact: true });
          await expect(heading).toBeVisible();
          const disclosure = page.getByLabel("数据来源", { exact: true });
          await expect(disclosure).toHaveAttribute("data-panel-mode", "preview");
          await expect(disclosure).toContainText("Preview Mode");
          await expect(disclosure.getByText("Demo · 演示数据 · 完全虚构", { exact: true })).toBeVisible();
          await expect(page.getByText("Connected Mode", { exact: true })).toHaveCount(0);
          await page.waitForLoadState("networkidle");
          landings.push({ route: destination.route, url: page.url(), heading: (await heading.textContent())!.trim(), status: response.status(), mode: await disclosure.getAttribute("data-panel-mode") });
          await page.goBack();
          await expect(page).toHaveURL(new URL("/", baseURL).href);
          await expect(page.getByRole("heading", { name: "EXECUTOR", level: 1, exact: true })).toBeVisible();
          await page.waitForLoadState("networkidle");
        });
      }
      expect(landings.map((landing) => landing.route)).toEqual(frozenDestinations.map((destination) => destination.route));
      await testInfo.attach("route-landings", { body: JSON.stringify(landings), contentType: "application/json" });
      await expectHealthyBrowser(page, testInfo, observations);
    });

    test(`honors reduced motion at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      const observations = await observeBrowser(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      await openContractHome(page);
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
      await settleBrowser(page);

      const motion = await page.evaluate(() => {
        const milliseconds = (duration: string) => duration.split(",").map((part) => {
          const value = part.trim();
          return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
        });
        const elements = [document.documentElement, document.body, ...document.querySelectorAll(".command-deck-shell, .command-deck-shell *")];
        return {
          matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
          samples: elements.flatMap((element) => [null, "::before", "::after"].map((pseudo) => {
            const style = getComputedStyle(element, pseudo);
            return { tag: element.tagName, id: element.id, pseudo,
              animationsMs: milliseconds(style.animationDuration), transitionsMs: milliseconds(style.transitionDuration), scrollBehavior: style.scrollBehavior };
          })),
        };
      });
      expect(motion.matches).toBe(true);
      for (const sample of motion.samples) {
        expect(sample.animationsMs.every((duration) => Number.isFinite(duration) && duration <= 0.01)).toBe(true);
        expect(sample.transitionsMs.every((duration) => Number.isFinite(duration) && duration <= 0.01)).toBe(true);
        expect(sample.scrollBehavior).toBe("auto");
      }
      await expectNoContractOverflow(page);
      await testInfo.attach("reduced-motion", { body: JSON.stringify(motion), contentType: "application/json" });
      await expectHealthyBrowser(page, testInfo, observations);
    });
  }

  for (const width of [390, 320]) {
    test(`keeps native drawer keyboard and scrolling behavior at ${width}px`, async ({ page }, testInfo) => {
      const observations = await observeBrowser(page);
      await page.setViewportSize({ width, height: 844 });
      await openContractHome(page);
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
      await page.keyboard.press("Tab");
      const trigger = page.getByRole("button", { name: "打开主导航", exact: true });
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeFocused();
      const originalOverflow = await page.evaluate(() => document.body.style.overflow);
      await page.evaluate(() => { document.body.style.overflow = "scroll"; });
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "EXECUTOR 导航", exact: true });
      const close = dialog.getByRole("button", { name: "关闭主导航", exact: true });
      const links = dialog.getByRole("navigation", { name: "移动主导航", exact: true }).getByRole("link");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(close).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      await page.keyboard.press("Shift+Tab");
      await expect(links.last()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(links.nth(0)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(links.nth(1)).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(links.nth(0)).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("scroll");
      await page.evaluate(() => { document.body.style.overflow = "clip"; });
      await page.keyboard.press("Enter");
      await expect(close).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("clip");
      await page.evaluate((value) => { document.body.style.overflow = value; }, originalOverflow);
      await settleBrowser(page);
      await expectNoContractOverflow(page);
      await testInfo.attach("keyboard-contract", {
        body: JSON.stringify({ width, nativeTriggerReachable: true, forwardWrap: true, reverseWrap: true, interiorForwardTab: true, interiorReverseTab: true, escapeFocusRestored: true, scrollRestored: true, reopenedClipRestored: true, scriptedFocusCalls: 0 }),
        contentType: "application/json",
      });
      await expectHealthyBrowser(page, testInfo, observations);
    });
  }
});
