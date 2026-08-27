import { expect, test } from "@playwright/test";

test("completes synthetic GitHub sign-in, restores the session, and grants no repository access", async ({
  page,
  request,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (browserRequest) => {
    const hostname = new URL(browserRequest.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      externalRequests.push(browserRequest.url());
    }
  });

  await page.goto("/");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();

  await expect(page).toHaveURL("http://127.0.0.1:3000/onboarding");
  await expect(
    page.getByRole("heading", { name: "GitHub 身份登录成功" }),
  ).toBeVisible();
  await expect(page.getByText("not_registered", { exact: true })).toBeVisible();
  await expect(page.getByText("none", { exact: true })).toHaveCount(2);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "GitHub 身份登录成功" }),
  ).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3000/onboarding");

  const fixtureStateResponse = await request.get(
    "http://127.0.0.1:54331/__fixture/state",
  );
  expect(fixtureStateResponse.ok()).toBe(true);
  expect(await fixtureStateResponse.json()).toEqual({
    fixture_id: "valid_github_auth_user",
    fixture_version: "1.0.0",
    source_type: "synthetic",
    provider: "github",
    contains_real_secret: false,
    real_github_called: false,
    real_private_data_used: false,
    provider_token_persisted: false,
    installation_created: false,
    repository_access: "none",
    internal_user_count: 1,
    identity_ensure_calls: 2,
  });
  expect(externalRequests).toEqual([]);
});
