> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_plan
execution_ready: true
module_id: MOD-ART-03
plan_file_id: PF-ART-03
approved_ids: [ART-REC-003, ART-REC-004, ART-REC-008]
baseline_observed_at: 2026-09-04T16:35:12+08:00
baseline_fingerprint: "b6891bdf-registry-f88e9024-module-boundary-e64360f6"
project_lifecycle: ZERO_TO_ONE
work_unit_mode: NEW_CAPABILITY_EXPLORATION
planning_scope: SINGLE_WORK_UNIT
simulated_customer_inputs: []
external_gate: none
gate_ids: []
---

# 五面板视觉换装执行计划

## 目标、范围与非目标

在 Command Deck 试装通过后，把共享深空舰桥语言推广到项目星图、航行日志、任务中枢、决策档案和 AI 副驾驶。只修改面板自有 CSS Module 和对应测试，不改变查询、View Model、URL、表单、空态语义或 Feature Registry。

## 架构和接口

每个 Feature 是自己 CSS Module 的唯一 writer，消费共享 Token；状态必须同时保留文字/图标/颜色。模块边界仍由 `module-boundaries` 合同约束，禁止面板反向依赖 Command Deck 样式。

## 基线、依赖与失效条件

依赖 MOD-ART-02 验收 PASS。任一面板存在未识别的同文件用户修改、Feature Registry 哈希漂移、公共 View Model 变化或测试基线失败时，只暂停受影响 Work Unit 及其下游。

## 并行策略与重新批准门槛

五个 Work Unit 在共同 Token 与试装合同冻结后可并行，各自文件互斥。新增面板、改变状态分类、修改数据库字段或跨 Feature 抽象须重新批准。

## Task 1：项目星图换装

**Work unit ID:** `WU-ART-03-01`<br>
**Task ID:** `TASK-ART-03-01`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/features/project-galaxy/project-galaxy.module.css`
- Modify: `src/features/project-galaxy/ProjectGalaxyPanel.test.tsx`
- Modify: `src/features/project-galaxy/RepositoryRemovalPanel.test.tsx`
- Test: `src/features/project-galaxy/ProjectGalaxyPanel.test.tsx`
- Test: `src/features/project-galaxy/RepositoryRemovalPanel.test.tsx`

**Interfaces:** Input：既有项目节点、生命周期与选中态；Output：星图式层级、保持可读与可选的状态视觉。

**Dependencies:** MOD-ART-02<br>
**Parallel:** 可与 WU-ART-03-02～05 并行。

- [ ] 先添加 active/paused/completed 状态具有可读文本或无障碍名称的测试；预期当前合同通过或暴露精确缺口。
- [ ] 将背景、节点、坐标线、详情卡和 repository-removal 区域改为共享 Token；不得使用图片承载项目名或状态。
- [ ] 验证项目选择、删除确认、空态和错误态行为不变；运行聚焦测试，预期通过。
- [ ] 在 `1440x900`、`390x844` 检查节点不遮挡关键操作，长项目名可换行。

**User-visible effect:** 项目星图呈现深空坐标舱视觉。<br>
**Observation entry:** `/project-galaxy`。<br>
**Stop conditions:** 需要改节点数据结构或交互算法。<br>
**Rollback:** 回退本 Work Unit 两个文件；主题仍可切 legacy。<br>
**Completion evidence:** 聚焦测试、两视口截图与提交哈希。<br>
**Review gate:** 状态不能只靠发光颜色识别。

## Task 2：航行日志换装

**Work unit ID:** `WU-ART-03-02`<br>
**Task ID:** `TASK-ART-03-02`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/features/flight-log/flight-log.module.css`
- Modify: `src/features/flight-log/FlightLogPanel.test.tsx`
- Test: `src/features/flight-log/FlightLogPanel.test.tsx`

**Interfaces:** Input：时间线记录、筛选和空态；Output：舰船日志时间线视觉，数据顺序不变。

**Dependencies:** MOD-ART-02<br>
**Parallel:** 可与其他面板 Work Unit 并行。

- [ ] 增加筛选、时间、空态和错误态仍可访问的行为断言。
- [ ] 使用共享 Token 重绘时间线、筛选条和日志卡；禁止改变排序、分页与记录正文。
- [ ] 运行聚焦测试和移动视口检查；预期全部通过且长日志正文不溢出。

**User-visible effect:** 日志成为可扫描的航行记录舱。<br>
**Observation entry:** `/flight-log`。<br>
**Stop conditions:** 样式依赖更改日志数据或日期格式。<br>
**Rollback:** 回退两个文件。<br>
**Completion evidence:** 测试、两视口截图与提交哈希。<br>
**Review gate:** 时间与状态信息须保留文字层级。

## Task 3：任务中枢换装

**Work unit ID:** `WU-ART-03-03`<br>
**Task ID:** `TASK-ART-03-03`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/features/mission-control/mission-control.module.css`
- Modify: `src/features/mission-control/MissionControlPanel.test.tsx`
- Test: `src/features/mission-control/MissionControlPanel.test.tsx`

**Interfaces:** Input：任务分组、优先级与状态；Output：控制台式任务编排视觉，操作合同不变。

**Dependencies:** MOD-ART-02<br>
**Parallel:** 可与其他面板 Work Unit 并行。

- [ ] 增加任务状态、按钮与空态的可访问断言。
- [ ] 使用共享 Token 重绘任务轨道、统计卡和操作区；warning/danger/success 必须同时有文字或图标语义。
- [ ] 运行聚焦测试并以键盘完成主要任务路径；预期无焦点丢失。

**User-visible effect:** 任务面板成为任务中枢舱。<br>
**Observation entry:** `/mission-control`。<br>
**Stop conditions:** 需要修改任务状态机或按钮行为。<br>
**Rollback:** 回退两个文件。<br>
**Completion evidence:** 测试、键盘记录、两视口截图与提交哈希。<br>
**Review gate:** 优先级不可仅靠色相区分。

## Task 4：决策档案换装

**Work unit ID:** `WU-ART-03-04`<br>
**Task ID:** `TASK-ART-03-04`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/features/decision-archive/decision-archive.module.css`
- Modify: `src/features/decision-archive/DecisionArchivePanel.test.tsx`
- Test: `src/features/decision-archive/DecisionArchivePanel.test.tsx`

**Interfaces:** Input：决策条目、时间和证据；Output：档案柜式证据层级，内容与顺序不变。

**Dependencies:** MOD-ART-02<br>
**Parallel:** 可与其他面板 Work Unit 并行。

- [ ] 增加决策标题、日期、证据链接和空态的行为断言。
- [ ] 使用共享 Token 重绘筛选、条目、证据区与选中态，确保正文对比度和长链接换行。
- [ ] 运行聚焦测试、键盘导航和两视口检查；预期全部通过。

**User-visible effect:** 决策内容呈现为可追溯舰桥档案。<br>
**Observation entry:** `/decision-archive`。<br>
**Stop conditions:** 需要改变决策 Schema 或证据来源。<br>
**Rollback:** 回退两个文件。<br>
**Completion evidence:** 测试、两视口截图与提交哈希。<br>
**Review gate:** 装饰不能降低长文本阅读效率。

## Task 5：AI 副驾驶换装并完成五面板回归

**Work unit ID:** `WU-ART-03-05`<br>
**Task ID:** `TASK-ART-03-05`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/features/copilot/copilot-workspace.module.css`
- Modify: `src/features/copilot/CopilotWorkspacePanel.test.tsx`
- Test: `src/features/copilot/CopilotWorkspacePanel.test.tsx`

**Interfaces:** Input：AI 建议、证据、输入和反馈；Output：紫色 AI 辅助语义，绝不把建议伪装为系统决定。

**Dependencies:** MOD-ART-02；最终回归依赖 WU-ART-03-01～04<br>
**Parallel:** 样式可并行，最终回归必须等待全部面板完成。

- [ ] 增加“AI 建议”标签、证据、输入框、发送按钮和错误态可访问断言。
- [ ] 用 `--space-ai` 作为辅助色，只用于 AI 来源标记；正文和操作仍使用共享前景/焦点 Token。
- [ ] 运行聚焦测试，验证 Preview/Connected 两模式内容和交互不变。
- [ ] 五个 Work Unit 完成后运行六个核心 UI 测试文件，预期不少于基线 48 项全部通过；运行 `pnpm typecheck`、`pnpm lint`、`pnpm build`，预期退出码 0。
- [ ] 对五页面各生成桌面/移动截图，由非实现者做跨面板一致性审核。

**User-visible effect:** AI 区域成为清晰但不越权的副驾驶舱。<br>
**Observation entry:** `/copilot`，以及五页面回归入口。<br>
**Stop conditions:** AI 来源或证据边界因视觉调整变模糊、任一面板测试回归。<br>
**Rollback:** 回退本文件；若共享缺陷则按影响范围回退对应 Work Unit。<br>
**Completion evidence:** 六组 UI 测试、构建、十张截图、审查记录与提交哈希。<br>
**Review gate:** AI 建议、系统状态、用户决策三类语义必须可区分。

## 模块 Definition of Done

五面板各自完成行为、桌面/移动和键盘验证；不少于基线 48 项核心 UI 测试通过；公共契约与 Feature Registry 无变化；状态与 AI 语义不依赖单一颜色。
