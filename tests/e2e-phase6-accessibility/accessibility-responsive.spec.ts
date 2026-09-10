import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

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
    // Both project readers must settle before this test leaves the page.
    await expect(page.getByTestId("project-stable-id")).toContainText(identity.projectId);
    await expect(page.locator("dt").filter({ hasText: /^projects$/ }).locator("..").locator("dd")).toHaveText("1");

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

// Resolve through the installed dependency graph; no CDN or absolute pnpm store path.
const projectRequire = createRequire(path.resolve("package.json"));
const eslintRequire = createRequire(projectRequire.resolve("eslint-config-next"));
const accessibilityRequire = createRequire(eslintRequire.resolve("eslint-plugin-jsx-a11y"));
const axePath = accessibilityRequire.resolve("axe-core/axe.min.js");
const axeSource = readFileSync(axePath, "utf8");
const axeSha256 = createHash("sha256").update(axeSource).digest("hex");

const artPages = [
  { id: "command-deck", route: "/", heading: "EXECUTOR", operation: "打开项目星图演示入口" },
  { id: "project-galaxy", route: "/project-galaxy", heading: "Project Galaxy", operation: "查看演示建议边界" },
  { id: "flight-log", route: "/flight-log", heading: "Flight Log", operation: "应用筛选" },
  { id: "mission-control", route: "/mission-control", heading: "Mission Control", operation: "接受建议" },
  { id: "decision-archive", route: "/decision-archive", heading: "Decision Archive", operation: "生成本地记录预览" },
  { id: "copilot", route: "/copilot", heading: "Copilot Workspace", operation: "切换并校准上下文" },
] as const;
type ArtPage = (typeof artPages)[number];
type ArtTheme = "deep-space" | "legacy";
type ArtEvidence = { [key: string]: unknown };

async function attachArtEvidence(name: string, value: unknown) {
  await test.info().attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}

async function expectArtTheme(page: Page, theme: ArtTheme) {
  // Wait for local route/chunk requests before exercising hydrated controls;
  // this is document readiness, not an animation-completion delay.
  await page.waitForLoadState("networkidle");
  await page.getByRole("main").waitFor({ state: "visible" });
  await page.evaluate(async () => { await document.fonts.ready; });
  // The per-context response fixture selects the existing server theme in both
  // HTML and RSC before hydration. Never race React by mutating the live root.
  await expect(page.locator("html")).toHaveAttribute("data-executor-theme", theme);
  await expect(page.locator("body")).toHaveCSS(
    "background-color", theme === "deep-space" ? "rgb(3, 7, 17)" : "rgb(242, 244, 241)",
  );
}

async function artFocusEvidence(target: Locator) {
  await expect(target).toBeFocused();
  const result = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const points = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]].map(([x, y]) => {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      const hit = document.elementFromPoint(point.x, point.y);
      return { ...point, hit: hit?.tagName ?? null, unobscured: hit === element || (hit !== null && element.contains(hit)) };
    });
    return {
      tag: element.tagName, name: element.getAttribute("aria-label") ?? element.textContent?.trim(),
      bbox: { x: box.x, y: box.y, width: box.width, height: box.height },
      viewport: { width: innerWidth, height: innerHeight }, points,
      focused: document.activeElement === element, focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor, opacity: style.opacity,
      inViewport: box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
    };
  });
  expect.soft(result.inViewport, "键盘焦点矩形必须完整处于视口").toBe(true);
  expect.soft(result.points.every((point) => point.unobscured), "焦点中心与四个内侧采样点不得被遮挡").toBe(true);
  expect.soft(result.focusVisible, "必须是真实键盘产生的可见焦点").toBe(true);
  expect.soft(result.outlineStyle, "焦点轮廓必须可见").not.toBe("none");
  expect.soft(result.outlineWidth).toBeGreaterThan(0);
  return result;
}

async function tabToArtOperation(page: Page, target: Locator, evidence: ArtEvidence) {
  await expect(target).toBeVisible();
  const steps: unknown[] = [];
  for (let count = 0; count < 100; count += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      evidence.keyboardSteps = steps;
      evidence.focus = await artFocusEvidence(target);
      return;
    }
    await page.keyboard.press("Tab");
    steps.push(await page.evaluate(() => {
      const active = document.activeElement;
      return { tag: active?.tagName, name: active?.getAttribute("aria-label") ?? active?.textContent?.trim().slice(0, 160), href: active?.getAttribute("href") };
    }));
  }
  evidence.keyboardSteps = steps;
  throw new Error("art_primary_not_reachable_after_100_real_tabs");
}

async function measureArtAppearance(page: Page) {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("art_color_conversion_unavailable");
    const rgba = (color: string): Rgba => {
      if (!CSS.supports("color", color)) throw new Error(`art_unsupported_color:${color}`);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const blend = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [0, 1, 2].map((index) => (foreground[index] * foreground[3] + background[index] * background[3] * (1 - foreground[3])) / alpha).concat(alpha) as Rgba;
    };
    const light = (value: Rgba) => value.slice(0, 3).reduce((sum, part, index) => {
      const c = part / 255;
      return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const ratio = (a: Rgba, b: Rgba) => (Math.max(light(a), light(b)) + 0.05) / (Math.min(light(a), light(b)) + 0.05);
    const root = getComputedStyle(document.documentElement);
    const token = (name: string) => rgba(root.getPropertyValue(name).trim());
    const background = token("--background");
    const surface = blend(token("--surface"), background);
    const tokenPairs = [
      { id: "foreground_background", foreground: token("--foreground"), background, minimum: 4.5, reference: 18.76 },
      { id: "muted_background", foreground: token("--muted"), background, minimum: 4.5, reference: 9.97 },
      { id: "border_surface", foreground: token("--border"), background: surface, minimum: 3, reference: 3.23 },
      { id: "focus_background", foreground: token("--focus"), background, minimum: 3, reference: 9.07 },
    ].map((pair) => ({ ...pair, ratio: ratio(blend(pair.foreground, pair.background), pair.background), rounded: Number(ratio(blend(pair.foreground, pair.background), pair.background).toFixed(2)) }));
    const visible = (element: Element) => {
      const s = getComputedStyle(element);
      const closed = element.closest("details:not([open])");
      const summary = closed?.querySelector(":scope > summary");
      const inClosedContent = closed !== null && element !== closed && element !== summary && !summary?.contains(element);
      return !inClosedContent && element.checkVisibility() && element.getClientRects().length > 0 && s.visibility === "visible" && s.display !== "none" && s.opacity !== "0";
    };
    const describe = (element: Element) => ({ tag: element.tagName, id: element.id, className: element.getAttribute("class"), text: element.textContent?.trim().slice(0, 160) });
    const paint = (element: Element) => {
      const ancestors: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
      let result = background;
      const layers = ancestors.map((node) => {
        const style = getComputedStyle(node);
        const color = rgba(style.backgroundColor);
        result = blend(color, result);
        return { tag: node.tagName, id: node.id, color, backgroundImage: style.backgroundImage, opacity: style.opacity };
      });
      return { rgba: result, layers, pixelExact: layers.every((layer) => layer.backgroundImage === "none" && layer.opacity === "1") };
    };
    const texts = Array.from(document.querySelectorAll("body *")).filter((element) => visible(element) && Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())).map((element) => {
      const style = getComputedStyle(element);
      const bg = paint(element);
      const foreground = rgba(style.color);
      const isStatus = element.closest('[data-status-kind], [data-content-kind], [data-freshness-status], [data-feedback-kind], [role="status"], [role="alert"]') !== null;
      const large = Number.parseFloat(style.fontSize) >= 24 || (Number.parseFloat(style.fontSize) >= 18.66 && Number.parseInt(style.fontWeight) >= 700);
      return { ...describe(element), foreground, background: bg, ratio: ratio(blend(foreground, bg.rgba), bg.rgba), minimum: isStatus || !large ? 4.5 : 3, isStatus, large };
    });
    const surfaces = Array.from(document.querySelectorAll("main *, .workspace-navigation, .workspace-inspector")).filter(visible).map((element) => {
      const color = rgba(getComputedStyle(element).backgroundColor);
      return { ...describe(element), color, effectiveBackground: paint(element) };
    }).filter((entry) => entry.color[3] > 0 && entry.color[3] < 1);
    const controls = Array.from(document.querySelectorAll("button, input:not([type=hidden]), select, textarea, summary")).filter(visible).map((element) => {
      const style = getComputedStyle(element);
      const bg = paint(element);
      const border = rgba(style.borderTopColor);
      const outside = paint(element.parentElement ?? document.documentElement);
      const borderOutsideRatio = ratio(blend(border, bg.rgba), outside.rgba);
      const fillOutsideRatio = ratio(bg.rgba, outside.rgba);
      // A solid button can be identified by its contrasting fill even when its
      // border uses that same color. Preserve all three measured pairs.
      return { ...describe(element), borderWidth: Number.parseFloat(style.borderTopWidth), border, background: bg, outside, borderInsideRatio: ratio(blend(border, bg.rgba), bg.rgba), borderOutsideRatio, fillOutsideRatio, ratio: Math.max(borderOutsideRatio, fillOutsideRatio), disabled: element.matches(":disabled") };
    });
    return { theme: document.documentElement.dataset.executorTheme, tokenPairs, texts, surfaces, controls, method: "浏览器canvas解析颜色（含color-mix）；逐祖先按alpha合成；8位颜色精度。背景图/非1透明度记录为非像素精确，axe不完整项另存。" };
  });
}

async function inspectArtMotion(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("html, body, body *")).flatMap((element) => {
    if (element.getClientRects().length === 0) return [];
    return [null, "::before", "::after"].flatMap((pseudo) => {
      const style = getComputedStyle(element, pseudo);
      if (pseudo && (style.content === "none" || style.content === "normal")) return [];
      const milliseconds = (value: string) => value.split(",").map((item) => Number.parseFloat(item) * (item.trim().endsWith("ms") ? 1 : 1000));
      return [{ tag: element.tagName, id: element.id, className: element.getAttribute("class"), pseudo, animationName: style.animationName, animationMs: milliseconds(style.animationDuration), transitionMs: milliseconds(style.transitionDuration), animationDelayMs: milliseconds(style.animationDelay), transitionDelayMs: milliseconds(style.transitionDelay), iterations: style.animationIterationCount, scrollBehavior: style.scrollBehavior }];
    });
  }));
}

async function scanArtAxe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { version: string; run: () => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[]; incomplete: unknown[]; passes: unknown[]; inapplicable: unknown[] }> } }).axe;
    return { version: axe.version, ...await axe.run() };
  });
}

async function checkArtSemantics(page: Page, definition: ArtPage) {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: definition.heading, exact: true })).toBeVisible();
  const outline = await page.locator("h1,h2,h3,h4,h5,h6").evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));
  expect.soft(outline.every((level, index) => index === 0 || level <= outline[index - 1] + 1), "标题层级连续").toBe(true);
  if (definition.id === "command-deck") {
    await expect(page.getByLabel("Preview 数据说明")).toContainText("演示");
  } else {
    await expect(page.locator('[data-panel-mode="preview"]')).toContainText("完全虚构");
  }
  const selectors = '[data-status-kind], [data-content-kind], [data-freshness-status], [data-candidate-status], [data-feedback-kind], [role="status"], [role="alert"]';
  // These are business-state contracts. The framework's initially empty route
  // announcer lives outside main; the independent axe scan still includes it.
  const states = await page.getByRole("main").locator(selectors).evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName, role: node.getAttribute("role"), text: node.textContent?.trim(), attributes: Object.fromEntries(Array.from(node.attributes).filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value])) })));
  for (const state of states) expect.soft(state.text, "状态必须含可读文本").toBeTruthy();
  if (definition.id === "project-galaxy") {
    await expect(page.locator('[data-status-kind="fact"]')).toContainText("官方事实");
    await expect(page.locator('[data-status-kind="suggestion"]')).toContainText("系统建议");
  }
  if (definition.id === "mission-control") {
    await expect(page.locator('[data-content-kind="recorded-fact"]').first()).toContainText("事实");
    await expect(page.locator('[data-content-kind="suggestion"]').first()).toContainText("建议");
  }
  if (definition.id === "decision-archive") {
    await expect(page.locator('[data-content-kind="candidate"]').first()).toContainText("Candidate");
    await expect(page.locator('[data-content-kind="confirmed-record"]').first()).toContainText("用户确认记录");
  }
  if (definition.id === "copilot") await expect(page.getByText("追问暂未启用", { exact: true })).toBeVisible();
  return { outline, states };
}

async function exerciseArtPrimary(page: Page, definition: ArtPage, evidence: ArtEvidence) {
  if (definition.id === "decision-archive") {
    const inputs: ArtEvidence[] = [];
    for (const [name, value] of [["决定内容", "ART 可访问性合成决定"], ["确认原因", "仅验证本地键盘预览"]]) {
      const step: ArtEvidence = { name };
      await tabToArtOperation(page, page.getByRole("textbox", { name, exact: true }), step);
      await page.keyboard.type(value);
      inputs.push(step);
    }
    evidence.formInputs = inputs;
  }
  const operation = definition.id === "command-deck"
    ? page.getByRole("link", { name: definition.operation, exact: true })
    : definition.id === "project-galaxy"
      ? page.locator("summary").filter({ hasText: definition.operation })
      : page.getByRole("button", { name: definition.operation, exact: true }).first();
  await tabToArtOperation(page, operation, evidence);
  await page.keyboard.press("Enter");
  if (definition.id === "command-deck") await expect(page).toHaveURL(/\/project-galaxy$/);
  if (definition.id === "project-galaxy") {
    await expect(operation.locator("..")).toHaveAttribute("open", "");
    await expect(page.getByText("此交互只展开本地说明；不会接受建议或修改 Official Status。", { exact: true })).toBeVisible();
  }
  if (definition.id === "flight-log") {
    await expect(page).toHaveURL(/[?&]apply=1(?:&|$)/);
    await expect(page.getByRole("heading", { name: "Flight Log 时间线", exact: true })).toBeVisible();
  }
  if (definition.id === "mission-control") {
    await expect(page).toHaveURL(/[?&]nextStatus=accepted(?:&|$)/);
    await expect(page.getByLabel("本地 Issue 草稿").first()).toBeVisible();
  }
  if (definition.id === "decision-archive") {
    await expect(page).toHaveURL(/[?&]action=manual(?:&|$)/);
    await expect(page.getByRole("main")).toContainText("ART 可访问性合成决定");
  }
  if (definition.id === "copilot") {
    await expect(page).toHaveURL(/[?&]action=switch(?:&|$)/);
    await expect(page.getByRole("heading", { name: "当前上下文", exact: true })).toBeVisible();
  }
  evidence.resultUrl = page.url();
}

async function exerciseArtNavigation(page: Page, definition: ArtPage, theme: ArtTheme, mobile: boolean, evidence: ArtEvidence) {
  if (new URL(page.url()).pathname !== "/") {
    const back: ArtEvidence = {};
    await tabToArtOperation(page, page.getByRole("link", { name: "返回 Command Deck", exact: true }), back);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("http://127.0.0.1:3016/");
    evidence.returnHome = back;
  }
  await expectArtTheme(page, theme);
  const destination = definition.id === "command-deck" ? "/project-galaxy" : definition.route;
  if (mobile) {
    const trigger = page.getByRole("button", { name: "打开主导航", exact: true });
    const open: ArtEvidence = {};
    await tabToArtOperation(page, trigger, open);
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "EXECUTOR 导航" });
    await expect(drawer).toBeVisible();
    const drawerMotion = await inspectArtMotion(page);
    if (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      expect.soft(drawerMotion.filter((item) => [...item.animationMs, ...item.transitionMs].some((value) => value > 0.01) || item.scrollBehavior !== "auto"), "打开导航后真实元素仍满足减少动态").toEqual([]);
    }
    evidence.drawerMotion = drawerMotion;
    const close = drawer.getByRole("button", { name: "关闭主导航" });
    const last = drawer.getByRole("link", { name: "Copilot AI 副驾驶", exact: true });
    const initial = await artFocusEvidence(close);
    await page.keyboard.press("Shift+Tab");
    const reverseWrap = await artFocusEvidence(last);
    await page.keyboard.press("Tab");
    const forwardWrap = await artFocusEvidence(close);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    const restored = await artFocusEvidence(trigger);
    await page.keyboard.press("Enter");
    await expect(close).toBeFocused();
    const route: ArtEvidence = {};
    await tabToArtOperation(page, drawer.locator(`a[href="${destination}"]`), route);
    await page.keyboard.press("Enter");
    await expect(drawer).toBeHidden();
    evidence.mobile = { open, initial, reverseWrap, forwardWrap, restored, route };
  } else {
    const navigation = page.getByRole("navigation", { name: "桌面主导航", exact: true });
    await expect(navigation).toBeVisible();
    const route: ArtEvidence = {};
    await tabToArtOperation(page, navigation.locator(`a[href="${destination}"]`), route);
    await page.keyboard.press("Enter");
    evidence.desktop = route;
  }
  await expect(page).toHaveURL(`http://127.0.0.1:3016${destination}`);
  const browserHistory = { destination: page.url(), returned: "" };
  await page.goBack();
  await expect(page).toHaveURL("http://127.0.0.1:3016/");
  browserHistory.returned = page.url();
  evidence.browserHistory = browserHistory;
}

test.describe("ART 六页面双主题与响应式合同", () => {
  test.setTimeout(120_000);
  for (const definition of artPages) {
    for (const theme of ["deep-space", "legacy"] as const) {
      for (const viewport of [{ id: "desktop", width: 1440, height: 900 }, { id: "mobile", width: 390, height: 844 }] as const) {
        test(`ART-A11Y-${definition.id}-${theme}-${viewport.id}`, async ({ page, context }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          // Fulfilled document fixtures otherwise have an unknown IP address
          // space in Chromium. Authorize only this disposable loopback origin.
          await context.grantPermissions(["local-network-access"], { origin: "http://127.0.0.1:3016" });
          const themeResponses: { url: string; mime: string; replacements: number }[] = [];
          await context.route("**/*", async (route) => {
            if (!["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)) {
              await route.abort("blockedbyclient");
              return;
            }
            if (route.request().isNavigationRequest() || route.request().headers().rsc === "1") {
              const response = await route.fetch({ maxRedirects: 0 });
              const mime = response.headers()["content-type"] ?? "";
              if (mime.includes("text/html") || mime.includes("text/x-component")) {
                let body = await response.text();
                let replacements = 0;
                for (const sourceTheme of ["deep-space", "legacy"] as const) {
                  if (sourceTheme === theme) continue;
                  // Exact root key only: HTML, RSC JSON, and HTML-escaped RSC.
                  for (const [from, to] of [
                    [`data-executor-theme="${sourceTheme}"`, `data-executor-theme="${theme}"`],
                    [`"data-executor-theme":"${sourceTheme}"`, `"data-executor-theme":"${theme}"`],
                    [`\\"data-executor-theme\\":\\"${sourceTheme}\\"`, `\\"data-executor-theme\\":\\"${theme}\\"`],
                  ]) {
                    replacements += body.split(from).length - 1;
                    body = body.replaceAll(from, to);
                  }
                }
                themeResponses.push({ url: route.request().url(), mime, replacements });
                await route.fulfill({ response, body });
              } else {
                await route.fulfill({ response });
              }
              return;
            }
            await route.continue();
          });
          const evidence: ArtEvidence = { pageId: definition.id, mode: "preview", theme, viewport, themeFixture: "仅HTML/RSC根主题键一致选择现有样式；不改DOM/CSS/业务数据", themeResponses, axeSource: { sha256: axeSha256, resolution: "eslint-config-next → eslint-plugin-jsx-a11y → axe-core/axe.min.js" }, observations: [] };
          const observations: ArtEvidence[] = [];
          evidence.observations = observations;
          try {
            for (const motion of ["no-preference", "reduce"] as const) {
              const observation: ArtEvidence = { motion, operation: definition.operation };
              observations.push(observation);
              await test.step(motion, async () => {
                try {
                  await page.emulateMedia({ reducedMotion: motion });
                  await page.goto(definition.route);
                  await expectArtTheme(page, theme);
                  observation.url = page.url();
                  observation.actualMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
                  expect.soft(observation.actualMotion).toBe(motion === "reduce");
                  observation.semantics = await checkArtSemantics(page, definition);
                  const overflow = await page.evaluate(() => ({ html: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.scrollWidth - document.body.clientWidth }));
                  observation.overflow = overflow;
                  expect.soft(overflow.html).toBeLessThanOrEqual(0);
                  expect.soft(overflow.body).toBeLessThanOrEqual(0);
                  const axe = await scanArtAxe(page);
                  observation.axe = { version: axe.version, violations: axe.violations.length, incomplete: axe.incomplete.length, passes: axe.passes.length, inapplicable: axe.inapplicable.length };
                  await attachArtEvidence(`axe-${motion}`, axe);
                  expect.soft(axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical"), "axe serious/critical违规必须为0，所有违规和incomplete均保留").toEqual([]);
                  const appearance = await measureArtAppearance(page);
                  await attachArtEvidence(`contrast-${motion}`, appearance);
                  observation.contrast = { tokens: appearance.tokenPairs, textCount: appearance.texts.length, statusTextCount: appearance.texts.filter((item) => item.isStatus).length, alphaSurfaceCount: appearance.surfaces.length, nonPixelExactTextCount: appearance.texts.filter((item) => !item.background.pixelExact).length };
                  for (const pair of appearance.tokenPairs) expect.soft(pair.ratio, pair.id).toBeGreaterThanOrEqual(pair.minimum);
                  expect.soft(appearance.texts.filter((item) => item.ratio < item.minimum), "实际文字/状态与alpha合成背景对比度").toEqual([]);
                  expect.soft(appearance.controls.filter((item) => !item.disabled && item.borderWidth > 0 && item.ratio < 3), "实际可操作控件边界对比度至少3").toEqual([]);
                  const motionRows = await inspectArtMotion(page);
                  await attachArtEvidence(`motion-${motion}`, motionRows);
                  observation.motionElementCount = motionRows.length;
                  if (motion === "reduce") {
                    expect.soft(motionRows.filter((item) => [...item.animationMs, ...item.transitionMs].some((value) => value > 0.01) || item.scrollBehavior !== "auto"), "真实元素与伪元素的减少动态合同").toEqual([]);
                  }
                  const primary: ArtEvidence = {};
                  observation.primary = primary;
                  await exerciseArtPrimary(page, definition, primary);
                  await expectArtTheme(page, theme);
                  const afterPrimaryMotion = await inspectArtMotion(page);
                  await attachArtEvidence(`motion-after-primary-${motion}`, afterPrimaryMotion);
                  if (motion === "reduce") {
                    expect.soft(afterPrimaryMotion.filter((item) => [...item.animationMs, ...item.transitionMs].some((value) => value > 0.01) || item.scrollBehavior !== "auto"), "完成主操作后的真实元素仍满足减少动态").toEqual([]);
                  }
                  const navigation: ArtEvidence = {};
                  observation.navigation = navigation;
                  await exerciseArtNavigation(page, definition, theme, viewport.id === "mobile", navigation);
                  observation.completed = true;
                } catch (error) {
                  observation.completed = false;
                  observation.failure = error instanceof Error ? error.message : String(error);
                  expect.soft(false, `${motion}行为失败：${String(observation.failure)}`).toBe(true);
                }
              });
            }
          } finally {
            const runtime = runtimeObservations.get(page);
            evidence.runtime = runtime ? { ...runtime, expectedNavigationAbortPaths: [...runtime.expectedNavigationAbortPaths] } : null;
            evidence.browser = page.context().browser()?.version();
            await attachArtEvidence("art-contract", evidence);
          }
        });
      }
    }
  }
});
