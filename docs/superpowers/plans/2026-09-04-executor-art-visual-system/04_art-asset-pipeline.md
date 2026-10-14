> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_plan
execution_ready: true
module_id: MOD-ART-04
plan_file_id: PF-ART-04
approved_ids: [ART-REC-002, ART-REC-006, ART-REC-007]
baseline_observed_at: 2026-09-04T16:35:12+08:00
baseline_fingerprint: "b6891bdf-package-aaf7050f-lock-a3c6eacc"
project_lifecycle: ZERO_TO_ONE
work_unit_mode: NEW_CAPABILITY_EXPLORATION
planning_scope: SINGLE_WORK_UNIT
simulated_customer_inputs: []
external_gate: none
gate_ids: []
---

# 美术资产管线执行计划

## 目标、范围与非目标

建立可审计的美术资产准入、清单与自动校验管线。首个版本只使用 CSS 程序化星点、网格、辉光和几何装饰；附图仅是风格证据，不进入仓库。任何未来生成图只能是装饰资产，不能承载项目名、状态、数值、按钮、证据或导航。

## 架构和接口

权威清单为 `public/art/executor/asset-manifest.json`。校验器读取清单与目录，验证唯一 ID、相对路径、用途、许可来源、SHA-256、尺寸、文件大小、替代策略和 `contentBearing=false`。初始清单为空，`mode=css-procedural`。

## 基线、依赖与失效条件

依赖 MOD-ART-01 Token 合同，不依赖五面板完成。`package.json` 由本模块唯一修改并一次性加入 `art:verify` 与后续视觉回归脚本入口，避免跨模块共享 writer。目录出现未登记图像、远程 URL 或许可不明资产时停止。

## 重新批准门槛

生产图进入首发、生成图包含真实内容、单资产超过 300 KiB、引入新格式/运行时加载器或外部 CDN 都需重新批准。

## Task 1：冻结资产政策与空清单

**Work unit ID:** `WU-ART-04-01`<br>
**Task ID:** `TASK-ART-04-01`<br>
**Task kind:** `non_code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Artifacts:**
- Create: `docs/design/art-system/asset-policy.md`
- Create: `public/art/executor/asset-manifest.json`

**Interfaces:** Input：批准附图和 ART-REC-007；Output：首发 CSS-only 规则和未来装饰资产字段合同。

**Dependencies:** MOD-ART-01<br>
**Parallel:** 可与 MOD-ART-02/03 并行。

- [ ] 在政策中写明允许用途、禁止承载内容、来源/许可、尺寸、大小、格式、懒加载与 fallback 规则。
- [ ] 创建 `schemaVersion: 1`、`mode: "css-procedural"`、`assets: []` 的清单；禁止复制临时附图或历史工作台图片。
- [ ] 记录附图 SHA-256 与本地临时来源只作为设计证据，不形成生产资产许可。

**User-visible effect:** 无；首发继续使用 CSS 装饰。<br>
**Observation entry:** 资产政策和清单。<br>
**Stop conditions:** 无法确认某资产来源或内容是否纯装饰。<br>
**Rollback:** 删除两份未提交新文件。<br>
**Completion evidence:** 政策审查记录与清单哈希。<br>
**Review gate:** 由非实现者确认真实信息只来自 DOM 文本和数据。

## Task 2：以测试驱动实现资产校验器

**Work unit ID:** `WU-ART-04-02`<br>
**Task ID:** `TASK-ART-04-02`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Create: `scripts/verify-art-assets.mjs`
- Create: `scripts/verify-art-assets.test.mjs`
- Modify: `package.json`
- Test: `scripts/verify-art-assets.test.mjs`

**Interfaces:** Input：资产目录与 JSON 清单；Output：退出码 0 或逐文件机器可读错误。

**Dependencies:** TASK-ART-04-01<br>
**Parallel:** `package.json` 是全包唯一 writer，本 Task 同时注册 `art:verify` 与 `test:e2e:visual`。

- [ ] 先写临时 fixture 测试：空清单通过；未登记文件、重复 ID、绝对/越界路径、`contentBearing=true`、缺许可、哈希不符、超 300 KiB 分别失败；运行 `node --test scripts/verify-art-assets.test.mjs`，预期因实现不存在而失败。
- [ ] 实现只读校验器，禁止下载、转换或修改资产；错误输出包含规则 ID 与规范相对路径。
- [ ] 在 `package.json` 添加 `art:verify` 和 `test:e2e:visual`，不改依赖与 lockfile。
- [ ] 运行单元测试与 `pnpm art:verify`；预期测试全部通过、空清单退出码 0。
- [ ] 运行 `pnpm typecheck`、`pnpm lint`；预期退出码 0。

**User-visible effect:** 无；CI 可阻断未经登记的图片。<br>
**Observation entry:** 命令行规则 ID。<br>
**Stop conditions:** 实现要求新 npm 依赖、网络或写入资产目录。<br>
**Rollback:** 回退脚本与 `package.json` 变更。<br>
**Completion evidence:** Node 测试、`art:verify` 输出、package 哈希与提交哈希。<br>
**Review gate:** 校验器必须默认拒绝未知文件，而不是静默忽略。

## Task 3：接入仓库验证链

**Work unit ID:** `WU-ART-04-03`<br>
**Task ID:** `TASK-ART-04-03`<br>
**Task kind:** `code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Files:**
- Modify: `src/shared/features/module-boundaries.test.ts`
- Test: `src/shared/features/module-boundaries.test.ts`

**Interfaces:** Input：现有模块边界校验和资产政策；Output：Feature 不得直接跨界导入其他 Feature 的视觉文件，公共视觉只能来自 shared。

**Dependencies:** TASK-ART-04-02<br>
**Parallel:** 不与其他 module-boundaries writer 并行。

- [ ] 新增失败 fixture：Feature A 导入 Feature B CSS、shared 反向导入 Feature、生产代码引用临时附图路径；预期先失败。
- [ ] 扩展现有校验规则，只允许 Feature 消费 `src/shared/visual-system` 与自身 CSS Module。
- [ ] 运行 `pnpm exec vitest run src/shared/features/module-boundaries.test.ts --maxWorkers=1`；预期 AST scanner、ESLint 边界与当前源码树检查全部通过。

**User-visible effect:** 无；防止视觉系统破坏模块边界。<br>
**Observation entry:** 边界校验输出。<br>
**Stop conditions:** 规则必须扫描用户缓存或 `.pnpm-store` 才能工作。<br>
**Rollback:** 回退 `src/shared/features/module-boundaries.test.ts`。<br>
**Completion evidence:** 负向 fixture、通过输出与提交哈希。<br>
**Review gate:** 扫描范围只覆盖版本化项目源文件。

## 模块 Definition of Done

首发清单明确为 CSS-only；资产政策可审计；未登记、许可不明、越界或内容型图像均被自动阻断；无新依赖、远程字体、CDN 或生产生成图。
