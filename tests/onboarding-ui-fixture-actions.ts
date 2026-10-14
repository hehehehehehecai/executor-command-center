import type { Page } from "@playwright/test";

export async function openOnboardingSection(page: Page, name: string) {
  const summary = page.locator("summary").filter({ hasText: new RegExp(`^${name}$`) });
  if (await summary.count() === 0) return;
  if (await summary.locator("xpath=..").getAttribute("open") === null) await summary.click();
}

export async function openOptionalOnboardingBackground(page: Page) {
  await openOnboardingSection(page, "添加仓库与授权管理");
  await openOnboardingSection(page, "可选：补充项目背景");
  await openOnboardingSection(page, "按需补充阶段目标、状态与阻碍");
}
