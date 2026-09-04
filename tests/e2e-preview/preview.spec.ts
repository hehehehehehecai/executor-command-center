import { expect, test } from "@playwright/test";

const serverOnlyVariableNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
] as const;

test("verifies the unauthenticated fictional Preview without external integrations", async ({
  page,
  request,
  baseURL,
}) => {
  if (!baseURL) {
    throw new Error("PREVIEW_BASE_URL is required by vercel-preview.v1.2");
  }

  const previewOrigin = new URL(baseURL).origin;
  const outsidePreviewRequests: string[] = [];
  const browserMessages: string[] = [];

  page.on("request", (browserRequest) => {
    if (new URL(browserRequest.url()).origin !== previewOrigin) {
      outsidePreviewRequests.push(browserRequest.url());
    }
  });
  page.on("console", (message) => browserMessages.push(message.text()));

  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "EXECUTOR" })).toBeVisible();
  await expect(page.getByText("演示数据 · 完全虚构")).toBeVisible();
  await expect(page.getByText("演示数据版本 1.1.0")).toBeVisible();
  await expect(page.getByText("Preview project")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(
    page.getByText(/请登录|登录后|连接成功|同步成功|Connected Mode/i),
  ).toHaveCount(0);

  const html = await page.content();
  const scriptSources = await page.locator("script[src]").evaluateAll((scripts) =>
    scripts.map((script) => (script as HTMLScriptElement).src),
  );
  const downloadedJavaScript = await Promise.all(
    scriptSources
      .filter((source) => new URL(source).origin === previewOrigin)
      .map(async (source) => (await request.get(source)).text()),
  );
  const browserSurface = [html, ...downloadedJavaScript, ...browserMessages].join(
    "\n",
  );

  for (const variableName of serverOnlyVariableNames) {
    expect(browserSurface).not.toContain(variableName);
  }

  expect(outsidePreviewRequests).toEqual([]);
});
