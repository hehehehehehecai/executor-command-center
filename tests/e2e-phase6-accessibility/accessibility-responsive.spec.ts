import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  cleanupPhase5Identity,
  seedPhase5Identity,
  type Phase5Identity,
} from "../e2e-core-journeys/phase5-fixture";

const routes = [
  "/",
  "/onboarding",
  "/mission-control",
  "/project-galaxy",
  "/copilot",
  "/decision-archive",
  "/flight-log",
  "/auth/error",
] as const;

const viewports = [320, 375, 768, 1280] as const;

const alphaIdentity = {
  userId: "11111111-1111-4111-8111-111111111111",
  projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;

async function useConnectedIdentity(
  context: BrowserContext,
  identity = alphaIdentity,
) {
  await context.addCookies([
    {
      name: "connected-panel-verified-user",
      value: identity.userId,
      url: "http://127.0.0.1:3016",
      httpOnly: true,
      sameSite: "Strict",
    },
    {
      name: "connected-panel-project",
      value: identity.projectId,
      url: "http://127.0.0.1:3016",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

async function signIn(page: Page, identity: Phase5Identity) {
  const controlToken = process.env.PHASE5_E2E_CONTROL_TOKEN;
  if (!controlToken) throw new Error("phase6_control_token_missing");
  await page.goto("/");
  const status = await page.evaluate(
    async ({ email, password, token }) => {
      const response = await fetch("/api/testing/phase5/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-phase5-e2e-control-token": token,
        },
        body: JSON.stringify({ email, password }),
      });
      await response.json();
      return response.status;
    },
    { email: identity.email, password: identity.password, token: controlToken },
  );
  expect(status).toBe(200);
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

type RuntimeObservation = {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  nonLocalRequests: string[];
  expectedNavigationAbortPaths: Set<string>;
};

const runtimeObservations = new WeakMap<Page, RuntimeObservation>();

test.beforeEach(async ({ page }) => {
  const observation: RuntimeObservation = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    nonLocalRequests: [],
    expectedNavigationAbortPaths: new Set<string>(),
  };
  runtimeObservations.set(page, observation);
  page.on("console", (message) => {
    if (message.type() === "error") observation.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => observation.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const errorText = request.failure()?.errorText ?? "unknown";
    const isExpectedNavigationAbort =
      errorText === "net::ERR_ABORTED" &&
      (url.pathname.startsWith("/__nextjs_font/") ||
        observation.expectedNavigationAbortPaths.has(url.pathname));
    if (!isExpectedNavigationAbort) {
      observation.requestFailures.push(`${request.url()}:${errorText}`);
    }
  });
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      observation.nonLocalRequests.push(request.url());
    }
  });
});

test.afterEach(async ({ page }) => {
  const observation = runtimeObservations.get(page);
  expect(observation?.consoleErrors ?? [], "browser console errors").toEqual([]);
  expect(observation?.pageErrors ?? [], "browser page errors").toEqual([]);
  expect(observation?.requestFailures ?? [], "unhandled request failures").toEqual([]);
  expect(observation?.nonLocalRequests ?? [], "non-local requests").toEqual([]);
});

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return [
      Number.parseInt(value[1] + value[1], 16),
      Number.parseInt(value[2] + value[2], 16),
      Number.parseInt(value[3] + value[3], 16),
    ];
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return [
      Number.parseInt(value.slice(1, 3), 16),
      Number.parseInt(value.slice(3, 5), 16),
      Number.parseInt(value.slice(5, 7), 16),
    ];
  }
  const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`unsupported_color:${value}`);
  return channels as [number, number, number];
}

function durationInMilliseconds(value: string) {
  if (value.endsWith("ms")) return Number.parseFloat(value);
  if (value.endsWith("s")) return Number.parseFloat(value) * 1_000;
  throw new Error(`unsupported_duration:${value}`);
}

test("A11Y-LANDMARK-01 exposes a skip link, one named main and a continuous heading outline", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const main = page.getByRole("main");
    await expect(main, route).toHaveCount(1);
    await expect(main, route).toHaveAttribute("id", "main-content");
    await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);

    const outlineIsContinuous = await page.locator("h1, h2, h3, h4, h5, h6").evaluateAll((nodes) => {
      const levels = nodes.map((node) => Number(node.tagName.slice(1)));
      return levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1);
    });
    expect(outlineIsContinuous, route).toBe(true);
  }

  await page.goto("/");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "桌面主导航" })).toHaveCount(1);
  await expect(page.getByRole("banner").locator("xpath=ancestor::main")).toHaveCount(0);
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "跳到主要内容" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  await useConnectedIdentity(page.context());
  await page.goto(`/project-galaxy?mode=connected&project=${alphaIdentity.projectId}`);
  const connectedMain = page.getByRole("main");
  await expect(connectedMain.getByRole("button", { name: "启动首次同步" })).toBeVisible();
  await expect(connectedMain.getByRole("button", { name: "移除仓库数据" })).toBeVisible();
});

test("A11Y-DRAWER-01 traps focus in mobile navigation and restores the trigger", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "打开主导航" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("dialog", { name: "EXECUTOR 导航" });
  await expect(drawer).toBeVisible();
  const close = drawer.getByRole("button", { name: "关闭主导航" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("link", { name: "Copilot AI 副驾驶" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(page.locator("[data-navigation-backdrop]")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("A11Y-CONFIRM-01 contains repository confirmation focus and background interaction", async ({ context, page }) => {
  await useConnectedIdentity(context);
  await page.goto(`/project-galaxy?mode=connected&project=${alphaIdentity.projectId}`);

  const trigger = page.getByRole("button", { name: "移除仓库数据" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "确认移除仓库数据" });
  await expect(dialog).toBeVisible();
  const confirmation = dialog.getByRole("textbox", { name: "确认文本" });
  const cancel = dialog.getByRole("button", { name: "取消" });
  await expect(confirmation).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmation).toBeFocused();
  const backgroundTrigger = page.locator("button", { hasText: "移除仓库数据" }).first();
  expect(await backgroundTrigger.evaluate((element) => element.closest("[inert]") !== null)).toBe(true);
  await backgroundTrigger.evaluate((element) => element.focus());
  await expect(confirmation).toBeFocused();
  const triggerBox = await backgroundTrigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  if (triggerBox) {
    await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  }
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("A11Y-CONFIRM-02 contains account deletion focus and background interaction", async ({ page }) => {
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(61);
    await signIn(page, identity);
    await page.goto("/onboarding");

    const trigger = page.getByRole("button", { name: "申请删除账户" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "确认申请删除账户" });
    const confirmation = dialog.getByRole("textbox", { name: "确认文本" });
    const cancel = dialog.getByRole("button", { name: "取消" });
    await expect(confirmation).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirmation).toBeFocused();

    const backgroundLink = page.locator('a[href="/"]', { hasText: "返回 Command Deck" });
    expect(await backgroundLink.evaluate((element) => element.closest("[inert]") !== null)).toBe(true);
    await backgroundLink.evaluate((element) => element.focus());
    await expect(confirmation).toBeFocused();
    const linkBox = await backgroundLink.boundingBox();
    expect(linkBox).not.toBeNull();
    if (linkBox) {
      await page.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
    }
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    // Unmount the account-status reader before fixture cleanup revokes this synthetic session.
    runtimeObservations.get(page)?.expectedNavigationAbortPaths.add("/api/account-deletion");
    await page.goto("/");
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("A11Y-CONTRAST-01 keeps text, controls and focus indicators at AA contrast", async ({ page }) => {
  await page.goto("/");
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      background: root.getPropertyValue("--background").trim(),
      surface: root.getPropertyValue("--surface").trim(),
      foreground: root.getPropertyValue("--foreground").trim(),
      muted: root.getPropertyValue("--muted").trim(),
      border: root.getPropertyValue("--border").trim(),
      focus: root.getPropertyValue("--focus").trim(),
    };
  });

  expect(contrast(parseRgb(colors.foreground), parseRgb(colors.background))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(parseRgb(colors.muted), parseRgb(colors.background))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(parseRgb(colors.border), parseRgb(colors.surface))).toBeGreaterThanOrEqual(3);
  expect(contrast(parseRgb(colors.focus), parseRgb(colors.background))).toBeGreaterThanOrEqual(3);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  expect(await page.getByRole("link", { name: "跳到主要内容" }).evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
});

test("A11Y-MOTION-01 reduces authored animation, transition and smooth scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reduced = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.animationDuration = "3s";
    probe.style.transitionDuration = "3s";
    probe.style.scrollBehavior = "smooth";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
      scrollBehavior: style.scrollBehavior,
    };
    probe.remove();
    return result;
  });

  expect(durationInMilliseconds(reduced.animationDuration)).toBeLessThanOrEqual(0.01);
  expect(durationInMilliseconds(reduced.transitionDuration)).toBeLessThanOrEqual(0.01);
  expect(reduced.scrollBehavior).toBe("auto");
});

test("A11Y-STATE-01 exposes failed states with a reason, next step and alert semantics", async ({ page }) => {
  for (const route of ["mission-control", "project-galaxy", "copilot", "decision-archive", "flight-log"]) {
    await page.goto(`/${route}?mode=unsupported`);
    const main = page.getByRole("main");
    await expect(main).toHaveAttribute("data-ui-state", "failed");
    await expect(main.getByRole("alert")).toContainText("原因");
    await expect(main.getByText(/下一步/)).toBeVisible();
    await expect(main.getByRole("link", { name: "返回 Command Deck" })).toHaveAttribute("href", "/");
  }
});

test("A11Y-CONTENT-KIND-01 distinguishes facts, suggestions, Candidates and confirmed records in text", async ({ page }) => {
  await page.goto("/mission-control");
  await expect(page.locator('[data-content-kind="recorded-fact"]').first()).toContainText("事实");
  await expect(page.locator('[data-content-kind="suggestion"]').first()).toContainText("建议");

  await page.goto("/decision-archive");
  await expect(page.locator('[data-content-kind="candidate"]').first()).toContainText("Candidate");
  await expect(page.locator('[data-content-kind="confirmed-record"]').first()).toContainText("用户确认记录");
});

test("A11Y-RESPONSIVE-01 keeps all primary routes within 320/375/768/desktop viewports", async ({ page }) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("main"), `${route} at ${width}px`).toBeVisible();
      await expectNoHorizontalOverflow(page).catch((error: unknown) => {
        throw new Error(`horizontal_overflow:${route}:${width}px`, { cause: error });
      });
    }
  }
});
