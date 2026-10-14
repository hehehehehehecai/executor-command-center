> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_plan
execution_ready: true
module_id: MOD-ART-01
plan_file_id: PF-ART-01
approved_ids: [ART-REC-001, ART-REC-002, ART-REC-004, ART-REC-005, ART-REC-006, ART-REC-008]
baseline_observed_at: 2026-09-04T16:35:12+08:00
baseline_fingerprint: "b6891bdf-globals-e942480a-registry-f88e9024"
project_lifecycle: ZERO_TO_ONE
work_unit_mode: NEW_CAPABILITY_EXPLORATION
planning_scope: SINGLE_WORK_UNIT
simulated_customer_inputs: []
external_gate: none
gate_ids: [GATE-ART-001]
---

# 视觉合同与 Token 执行计划

## 目标、范围与非目标

建立共享视觉系统、主题解析和深空/legacy Token。非目标是修改 Feature Registry、View Model、数据、权限和业务组件结构。

## 架构和接口

`parseExecutorTheme(value: string | undefined): "deep-space" | "legacy"` 是唯一 TypeScript 接口。CSS 通过根节点 `data-executor-theme` 映射既有 `--background` 等兼容变量。

## 基线、假设与失效条件

基线见路线图。`globals.css`、`layout.tsx`、测试配置或 Feature Registry 漂移时停止并重新核验。

## 依赖、并行和重新批准门槛

无前置模块。引入第三方主题库、远程字体或修改 Feature 契约必须重新批准。

## 事件门禁与局部保护

| gate_id | protected_work_unit | trigger_event | semantic_type | evidence_set | result_state | pass_next_action | fail_next_action | merge_identity |
|---|---|---|---|---|---|---|---|---|
| GATE-ART-001 | WU-ART-01-02，共享 Token 与根主题 | 首个消费者开始依赖新的共享视觉变量之前 | CONTRACT_OR_BASELINE_FREEZE | HEAD、globals.css/registry 哈希、48项 UI 基线、12张页面基线截图清单 | PENDING | 执行 TASK-ART-01-02 与下游试装 | 停止共享样式写入，恢复基线并修订合同 | NONE |

## Task 1：冻结视觉基线与合同

**Work unit ID:** `WU-ART-01-01`<br>
**Task ID:** `TASK-ART-01-01`<br>
**Task kind:** `non_code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Artifacts:**
- Create: `docs/design/art-system/visual-baseline.md`
- Create: `docs/design/art-system/baseline-sha256.txt`

**Interfaces:** Input：当前 HEAD、附图、六页面与现有 Token；Output：色值、对比度、页面截图和禁止项的冻结清单。

**Dependencies:** none<br>
**Parallel:** 与其他写任务互斥，完成后才能触发 GATE-ART-001。

- [ ] 运行 `git status --short --untracked-files=no`，把输出和观察时间写入 `visual-baseline.md`；预期只记录，不清理工作树。
- [ ] 运行 `pnpm typecheck` 与六个既有 UI 测试文件；预期退出码 0、48 项通过。
- [ ] 以 `1440x900`、`390x844` 捕获 `/`、`/project-galaxy`、`/flight-log`、`/mission-control`、`/decision-archive`、`/copilot`；预期 12 张基线均存在并在清单中有 SHA-256。
- [ ] 计算设计规格、关键配置和截图 SHA-256；预期 `baseline-sha256.txt` 每行均为 64 位小写十六进制加规范相对路径。

**User-visible effect:** 无界面变化。<br>
**Observation entry:** `docs/design/art-system/visual-baseline.md`<br>
**Stop conditions:** 页面无法启动、基线测试失败或工作树出现目标文件重叠修改。<br>
**Rollback:** 删除本 Task 新建的两份未提交基线文件；不触碰用户文件。<br>
**Completion evidence:** 基线文件哈希与 GATE-ART-001 审核票据。<br>
**Review gate:** 独立复核截图覆盖、哈希和附图转译是否一致。

## Task 2：实现主题解析和共享 Token

**Work unit ID:** `WU-ART-01-02`<br>
**Task ID:** `TASK-ART-01-02`<br>
**Task kind:** `code`<br>
**Requires gate:** `GATE-ART-001`<br>
**Task execution state:** `BLOCKED_BY_GATE`

**Files:**
- Create: `src/shared/visual-system/theme.ts`
- Create: `src/shared/visual-system/theme.test.ts`
- Create: `src/shared/visual-system/tokens.css`
- Create: `src/shared/visual-system/theme.css`
- Create: `src/shared/visual-system/index.ts`
- Modify: `src/app/layout.tsx`
- Modify: `.env.example`
- Test: `src/shared/visual-system/theme.test.ts`

**Interfaces:** Input：`NEXT_PUBLIC_EXECUTOR_THEME`；Output：`ExecutorTheme` 与根 `data-executor-theme`。

**Dependencies:** TASK-ART-01-01、GATE-ART-001<br>
**Parallel:** 与 TASK-ART-01-03 串行；本 Task 先定义接口。

- [ ] 在 `theme.test.ts` 写断言：缺失值返回 `deep-space`、`legacy` 原样返回、其他值返回 `legacy`；运行 `pnpm exec vitest run src/shared/visual-system/theme.test.ts --maxWorkers=1`，预期因模块不存在而失败。
- [ ] 在 `theme.ts` 实现 `export type ExecutorTheme = "deep-space" | "legacy"` 和精确三分支解析；在 `index.ts` 只导出该类型和函数。
- [ ] 在 `tokens.css` 写入设计规格中的 13 个 `--space-*` Token；在 `theme.css` 为两个主题映射现有 `--background`、`--foreground`、`--surface`、`--surface-muted`、`--muted`、`--border`、`--accent`、`--focus`。
- [ ] 在 `layout.tsx` 使用解析函数设置 `<html data-executor-theme={theme}>`，在 `.env.example` 增加 `NEXT_PUBLIC_EXECUTOR_THEME=deep-space`；运行聚焦测试，预期退出码 0。
- [ ] 运行 `pnpm typecheck` 与 `pnpm lint`；预期退出码均为 0。

**User-visible effect:** 根页面获得可切换的深空或 legacy Token。<br>
**Observation entry:** 浏览器根节点 `data-executor-theme`。<br>
**Stop conditions:** 需要客户端脚本、远程资源或业务数据才能解析主题。<br>
**Rollback:** 将环境值设为 `legacy`；若解析本身失败，回退本 Task 文件并恢复 `layout.tsx`。<br>
**Completion evidence:** 聚焦测试、typecheck、lint 和提交哈希。<br>
**Review gate:** 主题未知值必须失败关闭，且不读取 Secret。

## Task 3：让全局样式消费共享视觉系统

**Work unit ID:** `WU-ART-01-03`<br>
**Task ID:** `TASK-ART-01-03`<br>
**Task kind:** `code`<br>
**Requires gate:** `GATE-ART-001`<br>
**Task execution state:** `BLOCKED_BY_GATE`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/page.test.tsx`
- Test: `src/app/page.test.tsx`

**Interfaces:** Input：`tokens.css`、`theme.css`；Output：现有全局类名保持不变并消费兼容变量。

**Dependencies:** TASK-ART-01-02<br>
**Parallel:** `globals.css` 为本计划唯一 writer，其他模块不得并行修改。

- [ ] 在 `page.test.tsx` 增加根主题属性与 legacy 值测试；运行该测试，预期因尚未接线而失败。
- [ ] 在 `globals.css` 顶部依次导入 Tailwind、`../shared/visual-system/tokens.css`、`../shared/visual-system/theme.css`，移除重复根色值并为深空主题增加程序化星点/网格装饰层。
- [ ] 保留全部现有类名、焦点规则、移动 Drawer 和 Reduced Motion 规则；运行 `pnpm exec vitest run src/app/page.test.tsx src/features/command-deck/command-deck-page.test.tsx --maxWorkers=1`，预期通过。
- [ ] 运行 `pnpm typecheck`、`pnpm lint` 和 `pnpm build`；预期退出码 0。

**User-visible effect:** 全局表面切换为深空舰桥基础皮肤，业务内容和导航结构不变。<br>
**Observation entry:** `/` 与 `/onboarding`。<br>
**Stop conditions:** 任一现有类名被删除、Reduced Motion 失效或 onboarding 不可读。<br>
**Rollback:** 设置 legacy 并恢复 `globals.css` 基线哈希版本。<br>
**Completion evidence:** 两组测试、构建和桌面/移动截图。<br>
**Review gate:** 独立对比 DOM、键盘路径和 before/after 截图。

## 模块 Definition of Done

GATE-ART-001 为 PASS；主题解析、Token、根映射和 legacy 回退均有测试；无新依赖；Feature Registry 和 Panel Query 未修改。
