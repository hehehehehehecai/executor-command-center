import { expect, test } from "@playwright/test";

test("shows the EXECUTOR brand on the home page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "EXECUTOR" }),
  ).toBeVisible();
  await expect(page.getByText("Command Your Projects", { exact: true })).toBeVisible();
});
