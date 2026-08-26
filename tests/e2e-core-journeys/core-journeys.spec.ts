import { expect, test, type Page } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

import {
  cleanupPhase5Identity,
  advanceAccountDeletionDue,
  prepareCompletedSync,
  seedPhase5Identity,
  type Phase5Identity,
} from "./phase5-fixture";

function collectBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => requestFailures.push(request.url()));
  return { consoleErrors, pageErrors, requestFailures };
}

async function signIn(page: Page, identity: Phase5Identity) {
  const controlToken = process.env.PHASE5_E2E_CONTROL_TOKEN;
  if (!controlToken) throw new Error("phase5_control_token_missing");
  await page.goto("/");
  const status = await page.evaluate(
    async ({ credentials, token }) => {
      const response = await fetch("/api/testing/phase5/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-phase5-e2e-control-token": token,
        },
        body: JSON.stringify(credentials),
      });
      await response.json();
      return response.status;
    },
    {
      credentials: { email: identity.email, password: identity.password },
      token: controlToken,
    },
  );
  expect(status).toBe(200);
}

async function postSyntheticWebhook(
  page: Page,
  input: { readonly deliveryId: string; readonly eventName: string; readonly payload: unknown },
) {
  const body = JSON.stringify(input.payload);
  const signature = `sha256=${createHmac("sha256", "phase5-synthetic-webhook-secret")
    .update(body)
    .digest("hex")}`;
  return page.evaluate(
    async (request) => {
      const response = await fetch("/api/github/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": request.deliveryId,
          "x-github-event": request.eventName,
          "x-hub-signature-256": request.signature,
        },
        body: request.body,
      });
      return { status: response.status, payload: await response.json() };
    },
    { ...input, body, signature },
  );
}

async function syntheticProviderCallCount(pathname: string) {
  const response = await fetch("http://127.0.0.1:4015/__fixture/state");
  const payload = (await response.json()) as {
    calls?: Array<{ pathname?: unknown }>;
  };
  return (payload.calls ?? []).filter((call) => call.pathname === pathname).length;
}

test("E2E-01 explores the fictional Demo without external side effects", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const nonLocalRequests: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      nonLocalRequests.push(request.url());
    }
  });
  await page.goto("/");
  await expect(page.getByLabel("Preview 数据说明")).toContainText(
    "演示数据 · 完全虚构",
  );
  await page.getByRole("link", { name: "打开项目星图演示入口" }).click();
  await expect(page.getByRole("heading", { name: "Project Galaxy" })).toBeVisible();
  await expect(page.getByLabel("数据来源")).toContainText("Preview Mode");
  expect(nonLocalRequests).toEqual([]);
  expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
});

test("E2E-02 establishes a real local Supabase session and renders owned onboarding data", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(2);
    await page.goto("/");
    const untrustedSessionStatus = await page.evaluate(async (credentials) => {
      const response = await fetch("/api/testing/phase5/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      });
      return response.status;
    }, { email: identity.email, password: identity.password });
    expect(untrustedSessionStatus).toBe(404);
    await signIn(page, identity);

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "GitHub 身份登录成功" })).toBeVisible();
    await expect(page.getByText("GitHub App Installation 已连接")).toBeVisible();
    await expect(
      page
        .getByLabel("已选择仓库", { exact: true })
        .getByText(identity.repositoryFullName, { exact: true }),
    ).toBeVisible();
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 404 (Not Found)",
    ]);
    expect(errors.requestFailures).toHaveLength(1);
    expect(new URL(errors.requestFailures[0]).pathname).toBe(
      "/api/testing/phase5/session",
    );
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-03 starts First Sync from the connected project UI and exposes the durable run receipt", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(3);
    await signIn(page, identity);
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "启动首次同步" }).click();
    await expect(page.getByRole("status", { name: "同步操作结果" })).toContainText(
      "first_sync_accepted",
    );
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-04 ingests a signed incremental webhook and replays it without duplicate dispatch", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(4);
    await signIn(page, identity);
    const deliveryId = randomUUID();
    const request = {
      deliveryId,
      eventName: "issues",
      payload: {
        action: "opened",
        installation: { id: identity.installationNumericId },
        repository: {
          id: identity.repositoryId,
          full_name: identity.repositoryFullName,
        },
        issue: { id: 9_540_004, body: "synthetic-discarded-body" },
      },
    } as const;
    await expect(postSyntheticWebhook(page, request)).resolves.toMatchObject({
      status: 202,
      payload: { result: "accepted", code: "github_webhook_accepted" },
    });
    await expect(postSyntheticWebhook(page, request)).resolves.toMatchObject({
      status: 200,
      payload: { result: "duplicate", code: "github_webhook_duplicate" },
    });
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-05 requests Manual Resync from the connected project UI", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(5);
    await signIn(page, identity);
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "手动重同步" }).click();
    await expect(page.getByRole("status", { name: "同步操作结果" })).toContainText(
      "manual_resync_accepted",
    );
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-06 confirms and persists the official project status through Onboarding", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(6);
    await signIn(page, identity);
    await page.goto("/onboarding");
    const calibration = page.getByRole("region", { name: "项目校准" });
    await calibration.getByLabel("正式状态").selectOption("polishing");
    await calibration.getByLabel("当前阶段目标").fill("Phase 5 E2E 可观察终态");
    await calibration.getByRole("button", { name: "保存项目校准" }).click();
    await expect(calibration.getByRole("status")).toContainText("项目校准已保存");
    await page.reload();
    await expect(calibration.getByLabel("正式状态")).toHaveValue("polishing");
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-07 accepts an action suggestion and exposes a local Issue Draft boundary", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  await page.goto("/mission-control");
  await page.getByRole("button", { name: "接受建议" }).click();
  await expect(page.getByRole("status")).toContainText("建议状态已在本地更新");
  await expect(page.getByRole("textbox", { name: "Issue 草稿标题" })).toBeVisible();
  await expect(page.getByText("只生成本地草稿，不会创建 GitHub Issue。")).toBeVisible();
  expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
});

test("E2E-08 creates a user-confirmed Decision Record preview without remote writes", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  await page.goto("/decision-archive");
  const form = page.getByRole("form", { name: "手动创建决策记录" });
  await form.getByLabel("决定内容").fill("Phase 5 使用合成边界完成验证");
  await form.getByLabel("确认原因").fill("用户明确确认本地 E2E 证据");
  await form.getByRole("button", { name: "生成本地记录预览" }).click();
  await expect(page.getByRole("status")).toContainText("未持久化");
  await expect(page.getByText("Phase 5 使用合成边界完成验证")).toBeVisible();
  expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
});

test("E2E-09 generates a validated Brief through the UI and reports quota consumption", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(9);
    await prepareCompletedSync(identity);
    const providerCallsBefore = await syntheticProviderCallCount("/chat/completions");
    await signIn(page, identity);
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "生成 Validated Brief" }).click();
    await expect(page.getByRole("status", { name: "Brief 生成结果" })).toContainText(
      "generated · energy 3",
    );
    await page.getByRole("button", { name: "生成 Validated Brief" }).click();
    await expect(page.getByRole("status", { name: "Brief 生成结果" })).toContainText(
      "cache_hit · energy 0",
    );
    expect(await syntheticProviderCallCount("/chat/completions")).toBe(
      providerCallsBefore + 1,
    );
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-10 refunds the reservation after a synthetic Provider failure", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(10);
    await prepareCompletedSync(identity);
    await fetch("http://127.0.0.1:4015/__fixture/mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ai: "failure" }),
    });
    await signIn(page, identity);
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "生成 Validated Brief" }).click();
    await expect(
      page.getByText("Brief 生成失败：project_brief_provider_failure"),
    ).toBeVisible();
    await fetch("http://127.0.0.1:4015/__fixture/mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ai: "success" }),
    });
    await page.getByRole("button", { name: "生成 Validated Brief" }).click();
    await expect(page.getByRole("status", { name: "Brief 生成结果" })).toContainText(
      "generated · energy 3",
    );
    expect(errors.pageErrors).toEqual([]);
    expect(errors.requestFailures).toEqual([]);
    expect(errors.consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 502 (Bad Gateway)",
    ]);
  } finally {
    await fetch("http://127.0.0.1:4015/__fixture/mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ai: "success" }),
    });
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-12A removes repository-derived data through the strong-confirmation UI", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(12);
    await signIn(page, identity);
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "移除仓库数据" }).click();
    await page.getByLabel("确认文本").fill(`REMOVE ${identity.projectId}`);
    await page.getByRole("button", { name: "确认移除仓库数据" }).click();
    await expect(page.getByRole("status")).toContainText("仓库数据已移除");
    await expect(page.getByRole("status")).toContainText("SOURCE_REMOVED");
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-11 applies trusted Installation revocation and blocks new Sync in the UI", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(11);
    await signIn(page, identity);
    const revoked = await postSyntheticWebhook(page, {
      deliveryId: randomUUID(),
      eventName: "installation",
      payload: {
        action: "deleted",
        installation: { id: identity.installationNumericId },
      },
    });
    expect(revoked).toMatchObject({ status: 202, payload: { result: "accepted" } });
    await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/account-deletion" && response.status() === 200,
      ),
      page.goto("/onboarding"),
    ]);
    await expect(page.getByText("GitHub App Installation 已撤销")).toBeVisible();
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "启动首次同步" }).click();
    await expect(page.getByText("同步请求未能完成，可安全重试。")).toBeVisible();
    expect(errors.pageErrors).toEqual([]);
    expect(errors.requestFailures).toEqual([]);
    expect(errors.consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 409 (Conflict)",
    ]);
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-12B deletes only the selected project subtree through the stronger UI", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(16);
    await signIn(page, identity);
    await page.goto(`/project-galaxy?mode=connected&project=${identity.projectId}`);
    await page.getByRole("button", { name: "删除整个项目" }).click();
    await page.getByLabel("确认文本").fill(`DELETE ${identity.projectId}`);
    await page.getByRole("button", { name: "确认删除整个项目" }).click();
    await expect(page.getByRole("status")).toContainText("项目已删除");
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-13 requests seven-day account deletion and immediately shows the freeze window", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(13);
    await signIn(page, identity);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "申请删除账户" }).click();
    await page.getByLabel("确认文本").fill(`DELETE ACCOUNT ${identity.userId}`);
    await page.getByRole("button", { name: "确认申请删除" }).click();
    await expect(page.getByRole("status")).toContainText("七天恢复窗口截止");
    await expect(page.getByRole("status")).toContainText("已冻结");
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-14 cancels account deletion inside the recovery window", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(14);
    await signIn(page, identity);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "申请删除账户" }).click();
    await page.getByLabel("确认文本").fill(`DELETE ACCOUNT ${identity.userId}`);
    await page.getByRole("button", { name: "确认申请删除" }).click();
    await expect(page.getByRole("button", { name: "撤销删除申请" })).toBeVisible();
    await page.getByRole("button", { name: "撤销删除申请" }).click();
    await expect(page.getByText("账户当前为正常状态。")).toBeVisible();
    expect(errors).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [] });
  } finally {
    await cleanupPhase5Identity(identity);
  }
});

test("E2E-15 completes due account deletion through business cleanup and local Auth Admin", async ({
  page,
}) => {
  const errors = collectBrowserErrors(page);
  let identity: Phase5Identity | undefined;
  try {
    identity = await seedPhase5Identity(15);
    await signIn(page, identity);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "申请删除账户" }).click();
    await page.getByLabel("确认文本").fill(`DELETE ACCOUNT ${identity.userId}`);
    const requestReceipt = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/account-deletion" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "确认申请删除" }).click();
    const requestPayload = (await (await requestReceipt).json()) as {
      account?: { operationId?: unknown };
    };
    const operationId = requestPayload.account?.operationId;
    expect(typeof operationId).toBe("string");
    advanceAccountDeletionDue(operationId as string);
    const untrustedExecutionStatus = await page.evaluate(async (id) => {
      const response = await fetch("/api/testing/phase5/account-deletion/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: id }),
      });
      return response.status;
    }, operationId as string);
    expect(untrustedExecutionStatus).toBe(404);
    const controlToken = process.env.PHASE5_E2E_CONTROL_TOKEN;
    if (!controlToken) throw new Error("phase5_control_token_missing");
    const partialFailure = await page.evaluate(async ({ id, token }) => {
      const response = await fetch("/api/testing/phase5/account-deletion/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-phase5-e2e-control-token": token,
        },
        body: JSON.stringify({ operationId: id, simulateAuthFailure: true }),
      });
      return { status: response.status, payload: await response.json() };
    }, { id: operationId as string, token: controlToken });
    expect(partialFailure).toMatchObject({
      status: 200,
      payload: { status: "deletion_failed", outcome: "failed" },
    });
    const completion = await page.evaluate(async ({ id, token }) => {
      const response = await fetch("/api/testing/phase5/account-deletion/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-phase5-e2e-control-token": token,
        },
        body: JSON.stringify({ operationId: id }),
      });
      return { status: response.status, payload: await response.json() };
    }, { id: operationId as string, token: controlToken });
    expect(completion).toMatchObject({
      status: 200,
      payload: { status: "deleted", outcome: "completed" },
    });
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "尚未登录" })).toBeVisible();
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 404 (Not Found)",
    ]);
    expect(errors.requestFailures).toHaveLength(1);
    expect(new URL(errors.requestFailures[0]).pathname).toBe(
      "/api/testing/phase5/account-deletion/execute",
    );
  } finally {
    await cleanupPhase5Identity(identity);
  }
});
