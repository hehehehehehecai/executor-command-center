> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_plan
execution_ready: true
module_id: MOD-ART-02
plan_file_id: PF-ART-02
approved_ids: [ART-REC-003, ART-REC-004, ART-REC-005]
baseline_observed_at: 2026-09-04T16:35:12+08:00
baseline_fingerprint: "b6891bdf-globals-e942480a-registry-f88e9024"
project_lifecycle: ZERO_TO_ONE
work_unit_mode: NEW_CAPABILITY_EXPLORATION
planning_scope: SINGLE_WORK_UNIT
simulated_customer_inputs: []
external_gate: none
gate_ids: []
---

# Command Deck 舰桥试装执行计划

## 目标、范围与非目标

以首页 Command Deck 为唯一首发试装面，验证共享视觉合同能否在不改变导航、路由、数据加载和五面板入口的条件下形成“舰桥总览”。本模块不推广到五面板，不修改 Feature Registry、Panel Query、View Model 或业务文案。

## 架构和接口

试装层只消费 `src/shared/visual-system` 暴露的 CSS Token。组件现有 props、URL 和测试定位器保持不变；新增样式仅通过 CSS Module 类名和稳定的 `data-visual-zone` 观察点接入。

## 基线、假设与失效条件

依赖 MOD-ART-01 已通过 GATE-ART-001。`command-deck-page.tsx`、`command-deck-navigation.tsx`、首页路由或五面板 ID 漂移时停止；不得覆盖工作树中用户已有修改。

## 依赖、并行和重新批准门槛

依赖 MOD-ART-01。更改首页信息架构、导航顺序、Feature 数量、文案或远程资源需重新批准。试装验收通过后才能启动 MOD-ART-03。

## Task 1：先锁定舰桥壳层行为

**Work unit ID:** `WU-ART-02-01`<br>
**Task ID:** `TASK-ART-02-01`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/features/command-deck/command-deck-page.test.tsx`
- Create: `src/features/command-deck/command-deck-navigation.test.tsx`
- Test: `src/features/command-deck/command-deck-page.test.tsx`
- Test: `src/features/command-deck/command-deck-navigation.test.tsx`

**Interfaces:** Input：既有首页数据和导航项；Output：稳定 `data-visual-zone`、原有标题/链接/焦点行为不变的测试合同。

**Dependencies:** MOD-ART-01（含 GATE-ART-001 已 PASS）<br>
**Parallel:** 与样式实现串行，先产生失败测试。

- [ ] 为 `command-deck-page.test.tsx` 增加 `command-deck-shell`、`command-deck-main` 与 `command-deck-support` 观察区断言；运行聚焦测试，预期因观察点不存在而失败。
- [ ] 为导航测试增加当前路由、键盘可达和五个稳定 Feature 链接断言；预期现有链接顺序和 URL 不变。
- [ ] 记录失败输出，确认失败只来自新视觉观察点而非数据或导航回归。

**User-visible effect:** 无；先冻结行为。<br>
**Observation entry:** `/` 的 DOM 与键盘路径。<br>
**Stop conditions:** 新测试必须依赖业务重构、现有链接不稳定或基础测试已失败。<br>
**Rollback:** 回退本 Task 新增测试断言。<br>
**Completion evidence:** 精确失败测试输出和行为合同审查记录。<br>
**Review gate:** 独立确认测试没有快照化动态业务内容。

## Task 2：实现 Command Deck 深空舰桥壳层

**Work unit ID:** `WU-ART-02-02`<br>
**Task ID:** `TASK-ART-02-02`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Create: `src/features/command-deck/command-deck.module.css`
- Modify: `src/features/command-deck/command-deck-page.tsx`
- Modify: `src/features/command-deck/command-deck-navigation.tsx`
- Test: `src/features/command-deck/command-deck-page.test.tsx`
- Test: `src/features/command-deck/command-deck-navigation.test.tsx`

**Interfaces:** Input：共享 Token 和既有组件 props；Output：CSS Module 舰桥布局、语义观察区和可回退的组件类名。

**Dependencies:** TASK-ART-02-01<br>
**Parallel:** 不与同文件 writer 并行。

- [ ] 在 `command-deck.module.css` 定义侧边导航、主舱、支援舱、卡片边框、状态光点和断点；所有色值只能引用 `--space-*` 或兼容变量。
- [ ] 在两个组件中接入 CSS Module 与 `data-visual-zone`，不改变 JSX 内容顺序、链接、事件处理和 props。
- [ ] 保持文字、图标、颜色三重状态表达；装饰层设置 `pointer-events: none`、`aria-hidden` 对应的伪元素或无障碍安全实现。
- [ ] 运行两份聚焦测试，预期通过；运行 `pnpm typecheck`、`pnpm lint`，预期退出码 0。
- [ ] 在 deep-space 与 legacy 环境各运行首页一次；预期 legacy 仍可读、无水平溢出。

**User-visible effect:** 首页成为附图语义下的三舱舰桥工作台。<br>
**Observation entry:** `/`。<br>
**Stop conditions:** 必须更改业务 DOM 顺序、产生点击遮挡、低于 320px 时主导航不可达。<br>
**Rollback:** 设置 `NEXT_PUBLIC_EXECUTOR_THEME=legacy`；必要时回退三个本 Task 文件。<br>
**Completion evidence:** 测试、lint/typecheck、两主题截图和提交哈希。<br>
**Review gate:** 对照批准附图检查“深空、控制台、细边框、证据层级”，不要求像素复刻。

## Task 3：完成试装浏览器验收

**Work unit ID:** `WU-ART-02-03`<br>
**Task ID:** `TASK-ART-02-03`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `tests/e2e/command-deck.spec.ts`
- Test: `tests/e2e/command-deck.spec.ts`

**Interfaces:** Input：两主题首页；Output：桌面/移动、键盘、路由和无溢出的可重复浏览器验收。

**Dependencies:** TASK-ART-02-02<br>
**Parallel:** 可与纯文档审查并行，不与首页组件修改并行。

- [ ] 增加 `1440x900` 与 `390x844` 两个视口的视觉区存在、主导航可达和页面无横向溢出断言。
- [ ] 验证五个导航链接仍到达原路由，Preview/Connected 文案与数据不被样式遮挡。
- [ ] 开启 `prefers-reduced-motion: reduce`，验证动画和过渡时长被关闭或显著缩短。
- [ ] 运行 `pnpm exec playwright test tests/e2e/command-deck.spec.ts --project=chromium`；预期全部通过。
- [ ] 由非实现者审阅桌面、移动、legacy 三张试装截图，记录通过或精确缺陷。

**User-visible effect:** 无新增功能；试装达到可推广质量。<br>
**Observation entry:** `/` 桌面、移动和 legacy。<br>
**Stop conditions:** 视觉缺陷需要改动业务契约或试装方向偏离批准参考。<br>
**Rollback:** 回退本 Task E2E 改动，不绕过失败断言。<br>
**Completion evidence:** Playwright 报告、三张截图、独立审查记录。<br>
**Review gate:** MOD-ART-03 开始前必须获得试装验收 PASS。

## 模块 Definition of Done

首页行为测试与浏览器测试通过；三舱壳层在桌面、移动、Reduced Motion、deep-space 和 legacy 下可用；五个 Feature 身份、顺序与路由未改变。
