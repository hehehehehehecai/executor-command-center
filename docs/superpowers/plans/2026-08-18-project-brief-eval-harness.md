# Project Brief Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立离线、确定性、供应商无关的 Project Brief Eval Harness，并用 10 个全新合成 Contract Case 冻结七项检查与失败关闭发布门禁。

**Architecture:** `src/evaluation/project-brief` 提供严格 Zod 合同、稳定 canonical JSON/SHA-256、生产 Schema/Phase 6 Validator 驱动的 Harness，以及专用合成 Case。Harness 逐 Case 输出七项检查，不保存 Brief、Snapshot、Prompt 或敏感正文；因为仓库没有合格的人工确认历史凭证，最终 releaseGate 必须为 `blocked`。

**Tech Stack:** TypeScript 5.9、Zod 4、Node `crypto`、Vitest 4；复用 `parseProjectBrief`、`ValidateProjectBriefEvidenceUseCase`、生产 Evidence canonicalization/fingerprint。

**Spec:** Phase 9 execution prompt `explorer-stage5-phase9-eval-harness-dc888b2a516f673d-14d1d07059c7c4f1`

## Global Constraints

- 合同版本精确为 `project-brief-eval-case.v1`、`project-brief-eval-manifest.v1`、`project-brief-eval-result.v1`。
- 合成 Case 数固定为 10；不得把 Preview、单元测试 fixture 或 Git 历史冒充人工确认历史 Case。
- 每个 Case 必须输出 Schema、Evidence、时间范围、必需事实、禁止断言、Unknown、可读性七项检查。
- 生产 Schema 与 Phase 6 Evidence Validator 必须真实复用。
- 不联网、不调用 Provider、不读取真实 Key/用户数据/远端数据库。
- 不修改 migration、生产 Prompt/Schema/Fingerprint、Phase 1–8 合同、package 或 lockfile。
- 用户要求只创建一个最终本地 commit，不按任务分段提交。

---

### Task 1: Strict Eval Contracts and Stable Fingerprints

**Files:**
- Create: `src/evaluation/project-brief/project-brief-eval-contracts.ts`
- Create: `src/evaluation/project-brief/project-brief-eval-fingerprint.ts`
- Test: `src/evaluation/project-brief/project-brief-eval-contracts.test.ts`

**Interfaces:**
- Produces: `parseProjectBriefEvalCase(value)`, `parseProjectBriefEvalManifest(value)`, `parseProjectBriefEvalResult(value)`, `fingerprintEvalValue(value)`。

- [x] 写失败测试：严格字段、重复 ID、receipt 缺失/伪造、稳定排序和 fingerprint。
- [x] 运行定向测试并确认因模块缺失而失败。
- [x] 实现最小严格 Zod 合同和 canonical SHA-256。
- [x] 重跑并转绿。

### Task 2: Seven-Check Harness and Release Gate

**Files:**
- Create: `src/evaluation/project-brief/project-brief-eval-harness.ts`
- Test: `src/evaluation/project-brief/project-brief-eval-harness.test.ts`

**Interfaces:**
- Consumes: Eval contracts、`parseProjectBrief`、`ValidateProjectBriefEvidenceUseCase`。
- Produces: `evaluateProjectBriefDataset(manifest, dependencies)`，仅返回脱敏机器可读结果。

- [x] 写失败测试：七项结果、预期匹配、硬失败、人工未确认、计数不足和报告脱敏。
- [x] 运行定向测试并确认因 Harness 缺失而失败。
- [x] 实现生产 Schema/Validator 复用、稳定事实路径、边界化禁止断言、Unknown 和可读性代理检查。
- [x] 实现 `passed | blocked | failed` releaseGate 与稳定 reason code。
- [x] 重跑并转绿。

### Task 3: Ten Independent Synthetic Contract Cases

**Files:**
- Create: `src/evaluation/project-brief/project-brief-eval-synthetic-cases.ts`
- Test: `src/evaluation/project-brief/project-brief-eval-synthetic-cases.test.ts`

**Interfaces:**
- Produces: `loadSyntheticProjectBriefEvalManifest()`，包含 10 个稳定排序且 fingerprint 完整的全新合成 Case。

- [x] 写失败测试冻结十类覆盖矩阵与 dataset fingerprint。
- [x] 运行定向测试并确认因 Case loader 缺失而失败。
- [x] 用专用 synthetic Snapshot/Brief 构造器实现 10 个互不伪装的 Case。
- [x] 断言历史确认数为 0、总 included 数为 10、releaseGate 为 blocked。
- [x] 重跑并转绿。

### Task 4: Runbook and Final Verification

**Files:**
- Create: `docs/runbooks/project-brief-eval.md`

**Interfaces:**
- Documents: Case 分类、人工 receipt 导入、运行命令、结果边界和当前 blocked 原因。

- [x] 写最小 runbook，明确没有历史凭证时不得升级 Case 类型。
- [x] 运行 Phase 9 定向与 Phase 3/4/6/7/8 相关测试。
- [x] 运行全量 test、typecheck、lint、`git diff --check`。
- [x] 请求独立只读代码审查并关闭 Critical/Important。
- [x] 创建唯一提交 `test: add project brief eval suite`，确认工作区干净。
