---
document_type: project_brief
contract: project-brief-v1
schema: project-brief-schema-v1
template_version: 1
brief_id: parallelmail-current-20260819
snapshot_type: historical
snapshot_status: human_confirmed_historical
generated_at_utc: 2026-08-19T15:55:36Z
source_bundle_fingerprint: sha256:860fd3e4106fc2500066cfe414c5482af08d89c0f5b951cf3b590fbf48db7a8d
subject_fingerprint: sha256:a0edc32c74fe34395706ced44476c91bdd6aa5ce9579055adda7c187878a9d8b
confirmation_receipt_id: review-receipt:parallelmail:20260820T050333Z
confirmed_at_utc: 2026-08-20T05:03:33Z
eval_inclusion_status: pending_case_conversion_and_trusted_verification
---

# 平行信箱项目简报

## 简报元数据

- Brief ID：`parallelmail-current-20260819`
- 项目：平行信箱
- 仓库／工作目录：`D:\AI workplace\ParallelMail`
- 当前分支：`main`
- 当前 HEAD／版本：`033c96bef55347e8b1bac244ee8071eca40b66a6`
- Snapshot 类型：`historical`
- Snapshot 状态：`human_confirmed_historical`
- 时间范围：`2026-08-09T00:00:00Z — 2026-08-19T15:55:36Z`
- 简报时间点：`2026-08-19T15:55:36Z`
- Contract：`project-brief-v1`
- Schema：`project-brief-schema-v1`
- Source bundle fingerprint：`sha256:860fd3e4106fc2500066cfe414c5482af08d89c0f5b951cf3b590fbf48db7a8d`
- Subject fingerprint：`sha256:a0edc32c74fe34395706ced44476c91bdd6aa5ce9579055adda7c187878a9d8b`
- Confirmation receipt ID：`review-receipt:parallelmail:20260820T050333Z`
- 脱敏状态：已脱敏；未纳入 Secret、Token、生产数据行、用户内容或日志
- 人工确认状态：已确认
- 人工确认时间：2026-08-20T05:03:33Z
- 来源与脱敏确认：`source_and_redaction = confirmed`
- 可读性确认：`readability = confirmed`
- 预期结论确认：`expected_outcomes = confirmed`
- Eval 纳入状态：`pending_case_conversion_and_trusted_verification`
- 发布分母状态：尚未计入，需转换为 Eval Case 并由可信 verifier 核验

## Official Status

平行信箱处于五阶段实施路线图的阶段一“安全与数据契约”：Phase 1 与 Phase 2 已分别通过 A 级独立审核，Phase 3“版本化 Supabase Schema、RLS 与 RPC”因当前连接无法访问目标项目 `zqeskdvzrehepllnqcbm` 而暂停在人工门禁，Phase 3 执行提示词尚未生成或发送，阶段二不允许启动。[E-002][E-003][E-004]

## Summary

项目当前基线为 Expo/React Native Web、Supabase 与 Express/DeepSeek SSE 代理组合，路线图依次规划安全与数据契约、AI 网关与持久化、质量门禁、架构重构、无障碍与发布加固五个阶段。[E-001] 阶段一已经完成 Secret 误提交入口收敛，以及方案 B“匿名账户数据保存在 Supabase”的游客数据合同和相关界面文案；两项均有 A 级审核与构建、差异检查证据。[E-003] 当前尚未取得目标 Supabase 项目的权威脱敏元数据，因而没有进入 Phase 3 执行；本地仓库 HEAD 与阶段启动基线一致，但相关成果仍以未提交工作树差异存在。[E-003][E-004][E-005]

## Completed Changes

- Phase 1 已封闭真实 `.env` 的普通 Git 误提交入口，并收敛部署文档中的宽泛暂存流程；独立审核等级为 A。[E-003]
- Phase 2 已固定游客数据方案 B：游客使用匿名 Supabase 账户，业务数据保存在 Supabase；保留、退出、删除、升级和设备丢失语义已写入 `GUEST_DATA_CONTRACT.md`。[E-003][E-004]
- Phase 2 已同步修改 `App.tsx`、`screens/AuthScreen.tsx` 与 `components/ProfileModal.tsx` 的游客数据和隐私提示，并通过 `npm.cmd run build:web` 与 `git diff --check` 独立核验。[E-003]
- Phase 2 审核票据为 `review-ticket-76b1550a78ff19c9343ad3ce76386f9191afb43b5f965a4a9923a70215f7a96c`，审核等级为 A，执行报告指纹为 `8e8e5eef9787fa3beabb6cd47e933879410e40dea046f4f3d9792c08c08999b0`。[E-003]

## Ongoing Work

- 当前没有正在执行的代码批次；调度状态为 `PAUSED_HUMAN_ACTION`，固定执行任务保持空闲，Phase 3 的 `batch_id` 与 `prompt_instance_id` 均为空。[E-003][E-004]
- 已生效的下一门禁是人工票据 `parallelmail-stage1-supabase-project-access-a42562e8d5d3`：需要让当前 Supabase 连接具备目标项目 `zqeskdvzrehepllnqcbm` 的只读元数据可见性。[E-003][E-004]

## Open Items

- 连接可访问 `zqeskdvzrehepllnqcbm` 的 Supabase 账号或组织，并重新完成项目唯一身份核对；责任人：项目所有者／连接管理员，具体操作人待确认；截止时间：待确认。[E-003][E-004]
- 在身份唯一确认后，只读取得并脱敏记录 Schema、表、Policy、Function、Grant、Migration 与 RPC 元数据；责任人：阶段一审核调度；截止时间：待确认。[E-003][E-004]
- 基于权威元数据生成、执行并审核 Phase 3 的版本化 Migration、RLS、管理员授权和 `delete_user` RPC；责任人：阶段一固定执行者与审核者；截止时间：待确认。[E-002][E-003]
- 完成 Phase 4“落实游客数据合同并清理敏感日志”，随后依据阶段门槛进行阶段一总审核；责任人：阶段一固定执行者与审核者；截止时间：待确认。[E-002]
- 阶段一审核通过前，阶段二“AI 网关与持久化”保持未启动；责任人：项目所有者与审核调度；截止时间：待确认。[E-001][E-002]

## Risk Signals

- 当前 Supabase 连接未列出候选项目，直接读取项目详情返回 `MCP error -32600: You do not have permission to perform this action`，因此生产 Schema、RLS、Grant 与 RPC 现状仍不可审计。[E-003][E-004]
- 路线图基线记录仓库当时没有 Supabase Migration、RLS 或 RPC SQL；在 Phase 3 完成前，数据库权限和删除能力仍不能从版本化资产重建。[E-001][E-002]
- 当前工作树含 5 个已修改文件和 1 个未跟踪合同文件；这些内容有阶段审核证据，但尚未成为新的 Git commit。[E-005]
- 路线图基线记录项目没有测试文件及 test、lint、typecheck 脚本，并发现约 249 处控制台日志调用；相关质量与日志风险仍需后续阶段处理。[E-001]

## Unknowns

- 目标 Supabase 项目 `zqeskdvzrehepllnqcbm` 当前实际的 Schema、RLS Policy、Function、Grant、Migration 与 RPC 状态未知。[E-003][E-004]
- `delete_user` 的线上定义、调用权限、原子性和失败语义未知。[E-004]
- 管理员身份当前由 claim、数据库角色还是其他服务端规则控制，尚未核验。[E-004]
- 当前本地工作树是否将在何时、以何种提交边界进入版本控制，待确认。[E-005]
- 本简报尚未取得项目所有者的来源脱敏、可读性和预期结果三项人工确认。[E-006]

## Freshness

- 最新证据时间：`2026-08-19T15:55:36Z`（本地 Git 只读核验）。[E-005]
- 本地核验时间：`2026-08-19T15:55:36Z`；远端 Supabase 最近一次核验时间：`2026-08-09T14:10:06Z`。[E-004][E-005]
- HEAD／版本是否与报告一致：是；本地核验仍为 `main@033c96bef55347e8b1bac244ee8071eca40b66a6`。[E-005]
- 过期条件：Git HEAD、分支或工作树发生变化；Supabase 项目访问状态改变；Phase 3 批次生成或执行；人工票据状态改变；出现新的阶段审核票据；项目路线图或阶段一计划变更。任一条件发生即应重新生成简报。[E-001][E-002][E-003][E-005]

## Boundary Note

本次简报读取了项目路线图、阶段一实施计划、Prompt Ledger、最新会话交接记录，并对本地仓库执行了只读 Git 状态核验。[E-001][E-002][E-003][E-004][E-005] 本次未读取生产数据行、用户内容、日志、Secret 或 Token；未连接成功至目标 Supabase 项目，未执行 SQL、Migration、部署或远端状态变更；未修改项目代码、未提交、未推送。[E-004][E-005] 本简报是当前状态快照，不构成 Phase 3 启动授权、阶段一验收、合并批准或发布批准。

## Evidence Refs

| Evidence ID | 类型 | 来源／路径 | 时间或版本 | Fingerprint | 支持内容 |
| --- | --- | --- | --- | --- | --- |
| E-001 | 项目路线图／扫描基线 | `AI赋能知识库/60_正在执行的项目/个人项目/平行信箱/平行信箱实施路线图.md` | 版本 `0eaee8`；扫描日期 2026-08-09 | `obsidian-version:0eaee8` | 技术基线、五阶段依赖、总体 Definition of Done |
| E-002 | 阶段实施计划 | `AI赋能知识库/60_正在执行的项目/个人项目/平行信箱/阶段1_安全与数据契约实施计划/阶段1_安全与数据契约实施计划.md` | 版本 `129c83` | `obsidian-version:129c83` | 阶段一目标、Phase 3/4 范围、阶段门槛 |
| E-003 | Prompt Ledger／审核票据 | `AI赋能知识库/60_正在执行的项目/个人项目/平行信箱/阶段1_安全与数据契约实施计划/阶段1_审核调度台账.md` | 版本 `085e85`；状态记录至 2026-08-09 22:10:06 Asia/Shanghai | `obsidian-version:085e85` | Phase 1/2 审核结果、Phase 3 暂停状态、人工票据、授权边界 |
| E-004 | 最新恢复上下文 | `AI赋能知识库/60_正在执行的项目/个人项目/平行信箱/会话交接/2026-08-09_221006_上下文存档.md` | 版本 `7d0823`；2026-08-09 22:10:06 Asia/Shanghai | `obsidian-version:7d0823` | Supabase 访问失败、零数据／日志／Secret／写入边界、待办与 Unknowns |
| E-005 | 本地 Git 只读快照 | `D:\AI workplace\ParallelMail` | `2026-08-19T15:55:36Z` | `sha256:98ae6eb75d0fddcceb0fb4757d561117f5a2786c7c01bf8f93e6f561d64bbd79` | 分支、HEAD、remote 与未提交工作树状态 |
| E-006 | 项目简报模板合同 | `AI赋能知识库/60_正在执行的项目/个人项目/探索者号/阶段5_项目简报AI实施计划/项目简报模板.md` | 版本 `dd5a24`；template_version 1 | `obsidian-version:dd5a24` | Snapshot 状态、Evidence、Freshness、Boundary 和人工确认字段要求 |

### Evidence 检查

- Official Status、Summary 与各列表事实均绑定至少一个 Evidence ID。
- Evidence 均属于平行信箱项目、其项目简报合同或本次本地只读快照，并处于本简报声明的时间范围内。
- Phase 1/2“已完成”仅依据 Prompt Ledger 中绑定的执行报告、独立证据与 A 级审核票据；未把计划条目当作完成事实。
- Supabase 权威元数据缺失被保留为门禁与 Unknown，没有根据客户端配置猜测线上状态。
- Evidence 内容已脱敏；未读取或写入生产数据行、用户内容、日志、Secret 或 Token。
- Source bundle fingerprint 由模板、路线图、阶段一计划、Prompt Ledger、最新恢复上下文的版本标识，以及本地 Git HEAD／状态快照在 `2026-08-19T15:55:36Z` 组合计算。
- Subject fingerprint 由项目名、仓库 remote、分支、HEAD、当前阶段／Phase、调度状态和人工票据 ID 组合计算。

## 人工确认收据

- Receipt contract：`project-brief-human-confirmation.v1`
- 确认人稳定 ID：`project-owner:parallelmail`
- 确认人角色：项目所有者／最终确认人
- canonical UTC 确认时间：2026-08-20T05:03:33Z
- `source_and_redaction`：`confirmed`
- `readability`：`confirmed`
- `expected_outcomes`：`confirmed`
- 确认原文：`人工确认全部通过`
- 确认来源：`codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00`
- Brief ID：`parallelmail-current-20260819`
- Case ID：待转换
- Source fingerprint：`sha256:860fd3e4106fc2500066cfe414c5482af08d89c0f5b951cf3b590fbf48db7a8d`
- Subject fingerprint：`sha256:a0edc32c74fe34395706ced44476c91bdd6aa5ce9579055adda7c187878a9d8b`
- Confirmation receipt ID：`review-receipt:parallelmail:20260820T050333Z`
- Trusted verifier：待接入 `ProjectBriefEvalReviewVerifier`
- Verifier 状态：`pending_integration`

> 人工语义确认已经完成；在 Case Artifact、Manifest 与可信 verifier 接入并核验前，本资产仍不计入 Phase 9 发布分母。

## 转为历史 Case 的完成检查

- [x] 时间范围和简报时间点已冻结为 canonical UTC。
- [x] 所有必需区块完整，无模板占位文本。
- [x] 所有事实均有可定位 Evidence。
- [x] Evidence 已脱敏且读取范围获得当前任务授权。
- [ ] Source fingerprint、Subject fingerprint 和 Case content fingerprint 已重新计算。
- [ ] 确认人 ID／角色、确认时间和三项确认范围齐全。
- [ ] Confirmation receipt 已由可信 verifier 验证。
- [ ] Case、Manifest 和 Dataset fingerprint 一致。
- [ ] 人工可读性已确认。
- [x] 简报不存在行动建议、编造动机、无证据价值判断或 Unknown 泄漏。

> 当前状态为 `draft`；在人工确认收据和历史 Case 所需指纹、Manifest、Dataset 校验齐全前，不得标记为 `human_confirmed_historical`。
