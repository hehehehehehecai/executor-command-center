import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { verifiedContainerName } from "../../scripts/isolated-test-target.mjs";
import { cleanupPhase5Identity, prepareCompletedSync, seedPhase5Identity, type Phase5Identity } from "./phase5-fixture";

const viewports = [{ id: "desktop", width: 1440, height: 900, case: 19 }, { id: "mobile", width: 390, height: 844, case: 20 }] as const;
const sourceMessage = "整理仓库说明，补齐项目导入流程的验证记录";
function fixtureSql(sql: string) {
  const result = spawnSync("docker", ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", "exec", verifiedContainerName(), "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

for (const viewport of viewports) {
  test("T12 实际 " + viewport.id + " 中文层级、键盘来源与窄屏画面", async ({ page }, testInfo) => {
    let actor: Phase5Identity | undefined;
    const root = process.env.T12_EVIDENCE_DIR;
    if (!root) throw new Error("t12_evidence_dir_missing");
    const observations: unknown[] = [];
    await page.addInitScript(() => {
      const observedWindow = window as typeof window & { t12FocusEvents: unknown[] };
      observedWindow.t12FocusEvents = [];
      const record = (event: string, node?: Element | null) => {
        if (observedWindow.t12FocusEvents.length >= 100) return;
        observedWindow.t12FocusEvents.push({ event, at: performance.now(), tag: node?.tagName, id: node?.id, hidden: node?.hasAttribute("hidden"), activeId: document.activeElement?.id, activeTag: document.activeElement?.tagName, hash: location.hash });
      };
      document.addEventListener("focusin", event => record("focusin", event.target as Element));
      document.addEventListener("focusout", event => record("focusout", event.target as Element));
      window.addEventListener("pageshow", () => record("pageshow"));
      new MutationObserver(mutations => {
        for (const mutation of mutations) record("hidden-change", mutation.target as Element);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    });
    const sourceId = "c".repeat(40);
    const sourceRowId = crypto.randomUUID();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await testInfo.attach("t12-before-creation-contract", { body: JSON.stringify({ at: new Date().toISOString(), batch: process.env.EXECUTOR_TEST_EXECUTION_BATCH_ID, viewport, caseId: "T12-N-" + viewport.id, subjectIntent: viewport.case, sourceId, sourceRowId, lineage: "t12-owned-copilot-journey", real_case_count: 0 }), contentType: "application/json" });
    try {
      actor = await seedPhase5Identity(viewport.case);
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const profile = await client.rpc("save_project_calibration", { p_user_id: actor.userId, p_selected_repository_id: actor.selectedRepositoryId, p_core_goal: "把仓库改动整理成清楚的项目进展", p_current_stage_goal: "核验简报中的来源与阅读顺序", p_status: "in_development", p_current_blocker: null });
      expect(profile.error).toBeNull();
      const selected = await client.rpc("ensure_selected_github_repository", { p_user_id: actor.userId, p_github_installation_id: actor.installationId, p_github_repository_id: actor.repositoryId + 1000, p_owner_login: actor.repositoryFullName.split("/")[0], p_name: "second-owned-project", p_full_name: actor.repositoryFullName.split("/")[0] + "/second-owned-project", p_visibility: "private", p_is_private: true, p_is_fork: false, p_is_archived: false, p_is_disabled: false, p_default_branch: "main" });
      expect(selected.error).toBeNull();
      const second = await client.rpc("save_project_calibration", { p_user_id: actor.userId, p_selected_repository_id: selected.data.id, p_core_goal: "另一本人项目", p_current_stage_goal: "等待同步资料", p_status: "in_development", p_current_blocker: null });
      expect(second.error).toBeNull();
      const secondProjectId = second.data.id as string;
      await testInfo.attach("t12-registered-owned-subjects", { body: JSON.stringify({ at: new Date().toISOString(), userId: actor.userId, projects: [actor.projectId, secondProjectId], installationId: actor.installationId, sourceRowId, sourceId, source: "原SDK返回的本人项目；既有observer绑定创建/实际结果，SQL前保存" }), contentType: "application/json" });
      expect([actor.userId, actor.projectId, sourceRowId].every(id => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
      const occurredAt = new Date().toISOString();
      fixtureSql("insert into public.github_commits(id,project_id,github_object_id,message,committed_at,source_updated_at,source_version) select '" + sourceRowId + "'::uuid,id,'" + sourceId + "','" + sourceMessage + "','" + occurredAt + "'::timestamptz,'" + occurredAt + "'::timestamptz,'t12-local-v1' from public.projects where id='" + actor.projectId + "'::uuid and user_id='" + actor.userId + "'::uuid;");
      await prepareCompletedSync(actor);
      await page.goto("/");
      const login = await page.request.post("/api/testing/phase5/session", { headers: { origin: "http://127.0.0.1:3015", "x-phase5-e2e-control-token": process.env.PHASE5_E2E_CONTROL_TOKEN! }, data: { email: actor.email, password: actor.password } });
      expect(login.status()).toBe(200); await login.body();
      await page.goto("/copilot?projectId=" + actor.projectId);
      await expect(page.getByRole("heading", { level: 1, name: "AI 副驾驶" })).toBeVisible();
      await expect(page.getByText("当前项目暂无已完成简报。")).toBeVisible();
      await page.getByRole("button", { name: "生成项目简报", exact: true }).click();
      await expect(page.getByRole("region", { name: "项目简报", exact: true })).toBeVisible();
      await expect(page).toHaveURL(/briefId=/);
      await page.evaluate(() => document.fonts.ready);
      const main = page.locator("#main-content");
      const reading = await main.locator("[data-copilot-section]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-copilot-section")));
      expect(reading).toEqual(["project", "recent", "attention", "next", "sources"]);
      await expect(main.getByText("仅列出简报记录的进行中工作；暂未提供额外行动建议。")).toBeVisible();
      const visibleText = await main.innerText();
      expect(visibleText).not.toMatch(/Shell|Feature ID|schema|Fingerprint|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      const geometry = await page.evaluate(() => {
        const recent = document.querySelector('[data-copilot-section="recent"]')!;
        const title = recent.querySelector("h2")!.getBoundingClientRect();
        const summary = recent.querySelector('[aria-label="摘要"] p')!.getBoundingClientRect();
        return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, mainWidth: document.getElementById("main-content")!.getBoundingClientRect().width, theme: document.documentElement.dataset.executorTheme, firstScreen: { recentTitle: { top: title.top, bottom: title.bottom }, summary: { top: summary.top, bottom: summary.bottom } } };
      });
      expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(geometry.bodyWidth).toBeLessThanOrEqual(viewport.width);
      if (viewport.id === "mobile") {
        expect(geometry.firstScreen.recentTitle.top).toBeGreaterThanOrEqual(0);
        expect(geometry.firstScreen.recentTitle.bottom).toBeLessThanOrEqual(viewport.height);
        expect(geometry.firstScreen.summary.bottom).toBeLessThanOrEqual(viewport.height);
      }
      const require = createRequire(path.join(process.cwd(), "package.json"));
      const jsxA11y = require.resolve("eslint-plugin-jsx-a11y", { paths: [path.dirname(require.resolve("eslint-config-next"))] });
      const axeSource = readFileSync(require.resolve("axe-core/axe.min.js", { paths: [path.dirname(jsxA11y)] }), "utf8");
      await page.addScriptTag({ content: axeSource });
      const a11y = await main.evaluate(async node => {
        const api = (window as unknown as { axe: { run(node: Element, options: unknown): Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[]; incomplete: unknown[] }> } }).axe;
        return api.run(node, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      });
      expect(a11y.violations).toEqual([]);
      const png = path.join(root, "screenshots", "copilot-" + viewport.id + ".png");
      mkdirSync(path.dirname(png), { recursive: true });
      await page.screenshot({ path: png, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
      const provenance = { at: new Date().toISOString(), caseId: "T12-N-" + viewport.id, viewport, url: page.url(), mode: "connected", dataKind: "固定本地真实持久合成资料，非真实用户体验认可", userAcceptance: "待验收", state: "已验证简报，技术详情默认折叠", geometry, readingOrder: reading, screenshot: png, bytes: readFileSync(png).length, sha256: createHash("sha256").update(readFileSync(png)).digest("hex"), a11y, sourceFreeze: process.env.EXECUTOR_TEST_TARGET_FILE };
      writeFileSync(path.join(root, "screenshot-" + viewport.id + "-provenance.json"), JSON.stringify(provenance, null, 2));
      await testInfo.attach("t12-actual-screenshot-and-a11y", { body: JSON.stringify(provenance), contentType: "application/json" });
      const sourceLink = main.getByRole("region", { name: "来源与更新时间", exact: true }).getByRole("link").filter({ hasText: sourceMessage });
      await page.keyboard.press("Tab"); await sourceLink.focus(); await expect(sourceLink).toBeFocused();
      const focusStyle = await sourceLink.evaluate(node => ({ style: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }));
      expect(focusStyle.style).not.toBe("none"); expect(parseFloat(focusStyle.width)).toBeGreaterThanOrEqual(2);
      await page.keyboard.press("Enter");
      const detail = page.getByRole("complementary", { name: "来源详情", exact: true });
      await expect(detail).toBeVisible();
      await testInfo.attach("t12-source-focus-observation", { body: JSON.stringify(await page.evaluate(() => ({ at: new Date().toISOString(), url: location.href, hash: location.hash, activeTag: document.activeElement?.tagName, activeId: document.activeElement?.id, readyState: document.readyState, events: (window as typeof window & { t12FocusEvents: unknown[] }).t12FocusEvents }))), contentType: "application/json" });
      await expect(detail).toBeFocused(); await expect(detail).toContainText(sourceMessage);
      await expect(detail.getByRole("link", { name: "查看原始来源" })).toHaveAttribute("href", "https://github.com/" + actor.repositoryFullName + "/commit/" + sourceId);
      const diagnostic = page.locator("details").filter({ has: page.getByText("简报核验与技术详情", { exact: true }) }).locator("summary").first();
      await diagnostic.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("region", { name: "Freshness", exact: true })).toBeVisible();
      const selector = page.getByRole("combobox", { name: "选择项目", exact: true });
      await selector.selectOption(secondProjectId); await selector.focus(); await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "切换项目", exact: true })).toBeFocused(); await page.keyboard.press("Enter");
      await expect(page.getByText("当前项目暂无已完成简报。")).toBeVisible();
      await expect(page.getByRole("complementary", { name: "来源详情", exact: true })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "来源与更新时间", exact: true }).getByRole("link")).toHaveCount(0);
      observations.push({ keyboardSource: "focus→Enter→真实fragment详情焦点", focusStyle, safeOriginalHref: "https://github.com/" + actor.repositoryFullName + "/commit/" + sourceId, keyboardDiagnostic: "summary focus→Enter，Freshness可见", keyboardOwnedProjectSwitch: "选择本人第二项目→Tab→Enter，旧详情/来源清除", secondProjectId, screenshot: provenance });
      await testInfo.attach("t12-keyboard-and-source-results", { body: JSON.stringify(observations), contentType: "application/json" });
    } finally {
      await cleanupPhase5Identity(actor);
      await testInfo.attach("t12-cleanup-complete", { body: JSON.stringify({ at: new Date().toISOString(), userId: actor?.userId, method: "原账号删除流程，仅当前事前登记新主体，审计回执依原合同保留" }), contentType: "application/json" });
    }
  });
}
