> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_plan
execution_ready: true
module_id: MOD-ART-06
plan_file_id: PF-ART-06
approved_ids: [ART-REC-005, ART-REC-009, ART-REC-010]
baseline_observed_at: 2026-09-04T16:35:12+08:00
baseline_fingerprint: "b6891bdf-readme-route-authority"
project_lifecycle: ZERO_TO_ONE
work_unit_mode: NEW_CAPABILITY_EXPLORATION
planning_scope: SINGLE_WORK_UNIT
simulated_customer_inputs: []
external_gate: none
gate_ids: [GATE-ART-002]
---

# 发布与回退执行计划

## 目标、范围与非目标

形成可演练、可观测、可一键切回 legacy 的发布交接包。计划只完成本地/受控验证和发布就绪证据，不包含部署、推送、合并或任何外部环境写入；这些动作需要独立执行授权。

## 架构和接口

唯一运行开关为 `NEXT_PUBLIC_EXECUTOR_THEME=deep-space|legacy`。回退不依赖数据迁移、不清理缓存、不改变数据库；通过重新构建/发布 legacy 配置恢复视觉。

## 基线、依赖与失效条件

依赖 MOD-ART-05 完整 PASS。主题接口、发布平台、环境变量机制、构建产物、Feature Registry 或 public beta 路线图变化时停止并修订。不得把知识库计划批准视作部署授权。

## 事件门禁与局部保护

| gate_id | protected_work_unit | trigger_event | semantic_type | evidence_set | result_state | pass_next_action | fail_next_action | merge_identity |
|---|---|---|---|---|---|---|---|---|
| GATE-ART-002 | WU-ART-06-03，执行交接入口 | 请求合并、部署或向用户暴露 deep-space 主题之前 | RELEASE_OR_HANDOFF_READINESS | 六模块 DoD、12张快照、a11y、typecheck、lint、build、legacy 回退演练、资产校验、审查签字 | PENDING | 输出独立执行入口并请求部署授权 | 保持 legacy，不合并不部署，修复失败项后重审 | NONE |

## Task 1：编写发布与回退 Runbook

**Work unit ID:** `WU-ART-06-01`<br>
**Task ID:** `TASK-ART-06-01`<br>
**Task kind:** `non_code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Artifacts:**
- Create: `docs/runbooks/art-theme-release-and-rollback.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:** Input：主题环境变量、完整验证命令与 public beta 现状；Output：操作者可逐项执行的预检、发布、观察、回退和取证步骤。

**Dependencies:** MOD-ART-05<br>
**Parallel:** 不与其他 README/CHANGELOG writer 并行。

- [ ] 写明前置状态、精确命令、环境变量、预期输出、观察窗口、回退触发条件、回退验证和证据保存路径。
- [ ] README 只增加主题开关与本地验证入口；CHANGELOG 在 Unreleased 下说明“视觉系统升级，不改变业务契约”。
- [ ] 明确首次发布不含生产生成图、远程字体、新依赖或数据库迁移。
- [ ] 由未参与实现者从零按 Runbook 在本地完成 deep-space 构建与 legacy 回退演练。

**User-visible effect:** 文档说明新主题与回退方式。<br>
**Observation entry:** Runbook、README、CHANGELOG。<br>
**Stop conditions:** 回退需要代码修改、数据迁移或超过一次环境值切换。<br>
**Rollback:** 回退三份文档修改，不影响代码。<br>
**Completion evidence:** 演练命令、耗时、退出码、截图与审查签字。<br>
**Review gate:** Runbook 必须由非作者照单演练成功。

## Task 2：完成发布就绪审计并触发 Gate

**Work unit ID:** `WU-ART-06-02`<br>
**Task ID:** `TASK-ART-06-02`<br>
**Task kind:** `non_code`<br>
**Requires gate:** `none`<br>
**Task execution state:** `READY`

**Artifacts:**
- Create: `docs/reports/art-visual-system-release-readiness.md`

**Interfaces:** Input：六模块完成证据；Output：GATE-ART-002 的单一证据索引与 PASS/FAIL 决议。

**Dependencies:** TASK-ART-06-01、MOD-ART-01～05<br>
**Parallel:** 最终汇总，禁止与实现写任务并行。

- [ ] 在触发 Gate 前重跑 `pnpm typecheck`、`pnpm lint`、`pnpm build`、六个核心 UI 测试、Phase 6 可访问性、`pnpm art:verify`、`pnpm test:e2e:visual`；记录命令、时间、退出码和报告路径。
- [ ] 复核 12 张快照哈希、资产空清单、Feature Registry 哈希、模块边界和 legacy 演练证据。
- [ ] 检查工作树，只纳入本计划确切目标；排除用户已有 Stage 6 报告、未跟踪文档和 `.pnpm-store`。
- [ ] 由独立审核者将 GATE-ART-002 标为 PASS 或 FAIL；FAIL 时停止，不创建执行入口。
- [ ] PASS 时只输出“可请求独立部署/合并授权”的交接信息，`execution_authorization` 仍为 `NOT_GRANTED`。

**User-visible effect:** 无直接界面变化；形成可审计发布候选。<br>
**Observation entry:** 发布就绪报告。<br>
**Stop conditions:** 任一命令失败、证据缺失、工作树混入无关文件或无独立审查。<br>
**Rollback:** 保持或切回 legacy；不合并、不推送、不部署。<br>
**Completion evidence:** GATE-ART-002 决议、完整命令记录和证据索引。<br>
**Review gate:** 报告完成后提交 GATE-ART-002 独立审查。

## Task 3：在 Gate 通过后生成独立执行入口

**Work unit ID:** `WU-ART-06-03`<br>
**Task ID:** `TASK-ART-06-03`<br>
**Task kind:** `non_code`<br>
**Requires gate:** `GATE-ART-002`<br>
**Task execution state:** `BLOCKED_BY_GATE`

**Artifacts:**
- Create: `docs/reports/art-visual-system-execution-handoff.md`

**Interfaces:** Input：GATE-ART-002 PASS 决议；Output：只包含已批准执行范围、基线、首个 Task、停止条件和授权边界的独立入口。

**Dependencies:** TASK-ART-06-02、GATE-ART-002<br>
**Parallel:** 最终交接，禁止并行。

- [ ] 确认 Gate 决议为 PASS 且证据哈希与发布就绪报告一致；Expected：任何缺失均不生成入口。
- [ ] 写入准确的仓库、分支、基线、模块顺序、首个可执行 Task 与停止条件；Expected：不包含合并、推送或部署授权。
- [ ] 将 `execution_authorization` 固定为 `NOT_GRANTED`，明确用户需另行批准执行与外部动作。

**User-visible effect:** 获得可审计的后续执行入口。<br>
**Observation entry:** `docs/reports/art-visual-system-execution-handoff.md`。<br>
**Stop conditions:** Gate 非 PASS、基线漂移或用户尚未授予执行权限。<br>
**Rollback:** 删除未提交交接文件；保持 legacy。<br>
**Completion evidence:** 交接文件哈希和 Gate PASS 引用。<br>
**Review gate:** 不得把计划批准或 Gate PASS 解释为执行授权。

## 模块 Definition of Done

Runbook 被非作者成功演练；完整回归和 legacy 回退通过；GATE-ART-002 有审计结果；计划包只提供独立执行入口，不授予合并、推送或部署权限。
