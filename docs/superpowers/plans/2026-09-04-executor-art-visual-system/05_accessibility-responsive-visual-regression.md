> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_plan
execution_ready: true
module_id: MOD-ART-05
plan_file_id: PF-ART-05
approved_ids: [ART-REC-005, ART-REC-008, ART-REC-009]
baseline_observed_at: 2026-09-04T16:35:12+08:00
baseline_fingerprint: "b6891bdf-playwright-3855ead1-a11y-d4279d2f"
project_lifecycle: ZERO_TO_ONE
work_unit_mode: NEW_CAPABILITY_EXPLORATION
planning_scope: SINGLE_WORK_UNIT
simulated_customer_inputs: []
external_gate: none
gate_ids: []
---

# 可访问性、响应式与视觉回归执行计划

## 目标、范围与非目标

把批准的可访问性、响应式、Reduced Motion 和视觉一致性变成自动门。覆盖首页与五面板的桌面/移动两视口、deep-space/legacy、Preview/Connected 可用路径；不通过降低阈值、隐藏失败元素或批准动态像素差来获得绿灯。

## 架构和接口

视觉基线由独立 Playwright 配置与 `toHaveScreenshot` 管理，快照仅覆盖稳定壳层；动态时间、随机数据和外部状态通过固定 fixture 或 mask 排除。可访问性沿用现有 Phase 6 配置，新增对比度证据与 Reduced Motion 行为。

## 基线、依赖与失效条件

依赖 MOD-ART-02、03、04。当前配置哈希见路线图。Playwright 版本、字体渲染环境、视口、主题 Token 或页面数据 fixture 漂移会使相关快照失效，必须人工审查差异后更新。

## Task 1：扩展可访问性与响应式合同

**Work unit ID:** `WU-ART-05-01`<br>
**Task ID:** `TASK-ART-05-01`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `tests/e2e-phase6-accessibility/accessibility-responsive.spec.ts`
- Test: `tests/e2e-phase6-accessibility/accessibility-responsive.spec.ts`

**Interfaces:** Input：六页面、两视口、两主题；Output：键盘、焦点、溢出、Reduced Motion 和可访问性扫描证据。

**Dependencies:** MOD-ART-02、MOD-ART-03<br>
**Parallel:** 可与视觉回归配置编写并行，最终验证串行。

- [ ] 为六页面建立 `1440x900` 与 `390x844` 参数化测试；验证无横向溢出、主操作可见、焦点不被遮挡。
- [ ] 对 deep-space 和 legacy 执行键盘主路径与现有可访问性扫描；严重/关键违规必须为 0。
- [ ] 注入 `prefers-reduced-motion: reduce`，验证动画/过渡关闭且功能不依赖动画完成。
- [ ] 记录设计 Token 对比度证据：正文/背景 18.76、弱化文字/背景 9.97、边框/表面 3.23、焦点/背景 9.07，状态色正文用途均不低于 4.5:1。
- [ ] 运行 `pnpm exec playwright test -c playwright.phase6-accessibility.config.ts`；预期全部通过。

**User-visible effect:** 键盘、低视力和减少动态偏好用户可稳定使用新主题。<br>
**Observation entry:** 六页面两视口。<br>
**Stop conditions:** 需要排除真实交互元素、降低既有无障碍门槛或使用颜色作为唯一状态。
**Rollback:** 回退测试扩展；不修改扫描器阈值。<br>
**Completion evidence:** Playwright 报告、axe 结果、对比度表和提交哈希。<br>
**Review gate:** 非实现者复核焦点、状态和移动导航。

## Task 2：建立稳定视觉回归配置

**Work unit ID:** `WU-ART-05-02`<br>
**Task ID:** `TASK-ART-05-02`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Create: `playwright.visual-regression.config.ts`
- Create: `tests/e2e-visual/executor-visual.spec.ts`
- Create: `scripts/run-visual-regression.mjs`
- Test: `tests/e2e-visual/executor-visual.spec.ts`

**Interfaces:** Input：固定主题、视口和稳定 fixture；Output：可重复的六页面壳层截图差异。

**Dependencies:** MOD-ART-02、03、04<br>
**Parallel:** 配置可并行；首次快照必须等待五面板样式冻结。

- [ ] 先写六页面/两视口测试并运行 `pnpm test:e2e:visual -- --project=chromium`；预期因快照不存在而失败并生成候选结果。
- [ ] 配置单 worker、固定 locale/timezone/colorScheme、禁用动画和一致的 device scale；脚本只编排 Playwright，不修改业务数据。
- [ ] 每页只截图稳定壳层，动态时间和连接状态用固定 fixture；mask 只能用于经审查的非决定性内容。
- [ ] 在干净的连续两次运行中验证零差异；预期第二次退出码 0。
- [ ] 人工检查图像是否覆盖遮挡、截断、对齐、焦点与状态语义，不以像素通过替代语义审查。

**User-visible effect:** 无；后续视觉漂移会被 CI 捕获。<br>
**Observation entry:** Playwright HTML 报告与截图差异。<br>
**Stop conditions:** 基线依赖公网、真实时间、随机值或本机未固定字体。<br>
**Rollback:** 删除新配置/测试/脚本，不更新快照来掩盖缺陷。<br>
**Completion evidence:** 两次连续运行记录、HTML 报告和配置哈希。<br>
**Review gate:** 快照更新必须附差异说明和独立批准。

## Task 3：生成并审核 12 张权威基线快照

**Work unit ID:** `WU-ART-05-03`<br>
**Task ID:** `TASK-ART-05-03`<br>
**Task kind:** `non_code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Artifacts:**
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/command-deck-desktop-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/command-deck-mobile-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/project-galaxy-desktop-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/project-galaxy-mobile-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/flight-log-desktop-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/flight-log-mobile-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/mission-control-desktop-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/mission-control-mobile-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/decision-archive-desktop-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/decision-archive-mobile-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/copilot-desktop-chromium-win32.png`
- Create: `tests/e2e-visual/executor-visual.spec.ts-snapshots/copilot-mobile-chromium-win32.png`
- Create: `docs/design/art-system/visual-regression-approval.md`

**Interfaces:** Input：冻结实现；Output：12 张 Win32 Chromium 权威快照和逐页审核表。

**Dependencies:** TASK-ART-05-01、TASK-ART-05-02、MOD-ART-03 全部完成<br>
**Parallel:** 不与任何 UI 样式 writer 并行。

- [ ] 在固定环境用显式 `--update-snapshots` 生成 12 张候选快照；计算 SHA-256。
- [ ] 非实现者逐张对照附图风格合同、行为测试和移动布局，在审核表记录 PASS/FAIL 与理由。
- [ ] 只把全部 PASS 的候选快照纳入基线；随后连续运行两次，预期均为 0 差异。
- [ ] 运行六个核心 UI 测试、Phase 6 可访问性、视觉回归、`art:verify`、typecheck、lint、build；预期全部通过。

**User-visible effect:** 无；形成发布前视觉证据。<br>
**Observation entry:** 12 张快照和审核表。<br>
**Stop conditions:** 任一快照未审、动态内容未固定或完整回归失败。<br>
**Rollback:** 删除未批准候选快照并保留失败报告。<br>
**Completion evidence:** 快照哈希、独立审核表和全量命令输出。<br>
**Review gate:** 全部 12 张必须具名审核，不得批量默认批准。

## 模块 Definition of Done

六页面两视口、两主题、键盘、Reduced Motion、严重/关键无障碍违规、12 张权威快照和完整回归全部通过；任何基线更新都有差异说明和独立审查。
