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

  await page.setViewportSize({ width: 390, height: 844 });
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
  await expect(page.getByText("演示数据 · 完全虚构")).toBeVisible();
  await expect(page.getByText("演示数据版本 1.0.0")).toBeVisible();

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
