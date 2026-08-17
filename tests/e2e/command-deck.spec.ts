import { expect, test } from "@playwright/test";
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
