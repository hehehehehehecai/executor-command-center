---
document_type: project_brief
contract: project-brief-v1
schema: project-brief-schema-v1
project: 勇者酒馆
snapshot_type: historical
snapshot_status: human_confirmed_historical
as_of_utc: 2026-08-19T15:56:16Z
next_phase_allowed: false
source_bundle_fingerprint: sha256:b78a0b65a55c4ccfbad5cb04dc1a6dea8af43f49f3568cf32525173fa365eb8e
subject_fingerprint: sha256:54256ab2dcf56c0638c9d625a2c970f9015d250bd996e4b3e62ef438dff24f48
confirmation_receipt_id: review-receipt:brave-tavern:20260820T050333Z
confirmed_at_utc: 2026-08-20T05:03:33Z
eval_inclusion_status: pending_case_conversion_and_trusted_verification
---

# 勇者酒馆｜当前项目简报｜2026-08-19

## 简报元数据

- Brief ID：`brave-tavern-current-20260819T155616Z`
- 项目：勇者酒馆
- 仓库／工作目录：`D:\AI workplace\flutter_todo_app`
- 当前分支：`master`
- 当前 HEAD／版本：`7d36fc1f21c8bea5330c552b9faa91afd838ffd8`
- Snapshot 类型：`historical`
- Snapshot 状态：`human_confirmed_historical`
- 时间范围：`2026-07-06T15:09:04Z — 2026-08-19T15:56:16Z`
- 简报时间点：`2026-08-19T15:56:16Z`
- Contract：`project-brief-v1`
- Schema：`project-brief-schema-v1`
- Source bundle fingerprint：`sha256:b78a0b65a55c4ccfbad5cb04dc1a6dea8af43f49f3568cf32525173fa365eb8e`
- Subject fingerprint：`sha256:54256ab2dcf56c0638c9d625a2c970f9015d250bd996e4b3e62ef438dff24f48`
- Confirmation receipt ID：`review-receipt:brave-tavern:20260820T050333Z`
- 脱敏状态：已完成；简报未写入 Secret、Token、OAuth 凭据、数据库连接串或私人业务数据
- 人工确认状态：已确认
- 人工确认时间：2026-08-20T05:03:33Z
- 来源与脱敏确认：`source_and_redaction = confirmed`
- 可读性确认：`readability = confirmed`
- 预期结论确认：`expected_outcomes = confirmed`
- Eval 纳入状态：`pending_case_conversion_and_trusted_verification`
- 发布分母状态：尚未计入，需转换为 Eval Case 并由可信 verifier 核验

## Official Status

勇者酒馆已建立可恢复的本地与私有 GitHub legacy baseline，当前本地仓库仍与该基线一致；第三周“数据库资产清单”正式实施尚未启动，审核调度因无法只读访问目标 Supabase 项目 `xcgkgeyxwharisbzvtvl` 而暂停，现阶段不允许进入后续实施或下一维护周。[E-002][E-003][E-005]

## Summary

截至 `2026-08-19T15:56:16Z`，仓库位于 `master`，HEAD 与 tree 仍分别为 `7d36fc1f21c8bea5330c552b9faa91afd838ffd8` 和 `94f5da689419eba5b5b27ca26c55b33dec1dad93`，工作区无未提交变更。[E-005] 第二周已经完成本地基线、私有远端与独立克隆验证，测试基线为 5 项通过，静态分析基线为 0 error、1 warning、36 info。[E-002] 第三周目标是为五张客户端依赖表建立数据库资产清单，但现有连接看不到目标 Supabase 项目，无法以证据约束方式填写列定义、RLS、Policy 与 Realtime 状态，因此调度保持人工操作暂停。[E-001][E-003]

## Completed Changes

- 已建立唯一 legacy baseline commit `7d36fc1f21c8bea5330c552b9faa91afd838ffd8`、tag `legacy-baseline-v0` 和 175 个 tracked files；私有 GitHub 仓库 `hehehehehehecai/flutter_todo_app` 的 `master` 与 tag 在第二周验收时均指向该 commit。[E-002]
- 已通过独立 GitHub clone 验证 HEAD、tree、tag、唯一 commit、文件数量、路径哈希与 clean 状态一致。[E-002]
- 第二周冻结的测试与静态分析基线为：`flutter test --no-pub` 5 passed、0 failed；`flutter analyze --no-pub` 为 0 error、1 warning、36 info，命令退出码为 1。[E-002]
- 本次只读复核确认本地仓库仍处于 `master`、HEAD/tree 与第二周基线一致，工作区 clean，`origin` 仍为既有私有仓库地址。[E-005]
- 已完成第三周双会话只读启动验收的归档准备与仓库身份核验；该验收没有修改勇者酒馆代码，也不代表第三周数据库资产清单已经实施。[E-004]

## Ongoing Work

- 当前没有已启动的第三周数据库资产清单实施批次；审核调度处于 `PAUSED_HUMAN_ACTION`，等待目标 Supabase 项目的只读元数据访问恢复。[E-003]
- 人工操作票据 `brave-tavern-week3-supabase-access-4249ce6664af` 仍是当前恢复入口。[E-003]

## Open Items

- 恢复对 Supabase 项目 `xcgkgeyxwharisbzvtvl` 的只读元数据访问；责任人：项目所有者／拥有目标项目权限的账号持有人；截止时间：待确认。[E-003]
- 访问恢复并核验项目身份后，创建 `docs/database-inventory.md`，记录 `todos`、`profiles`、`mission_logs`、`inventory`、`treasures` 的字段、类型、主键、`user_id`、可空性、RLS、Policy 与 Realtime；责任人：第三周执行任务；截止时间：待确认。[E-001][E-003]
- 后续维护阶段逐项偿还 legacy analyzer 基线中的 1 warning 与 36 info；具体阶段、责任人和截止时间：待确认。[E-002]

## Risk Signals

- 当前可用 Supabase 连接只列出两个非目标项目，仓库内也没有足以替代远端事实的 migration、schema dump 或现成数据库资产清单；直接编写资产清单会产生猜测数据库现实的风险。[E-003]
- legacy analyzer baseline 仍有 1 warning 与 36 info；唯一 warning 位于 `lib/shop_page.dart:27:13`，内容为未使用局部变量。[E-002]
- 既有凭据扫描与入库边界检查不能构成绝对安全证明。[E-002]

## Unknowns

- 五张目标表在当前远端项目中的实际列定义、主键、可空性、RLS、Policy 与 Realtime Publication 状态尚未核验。[E-003]
- `origin/master` 在本简报时间点是否仍与本地 HEAD 完全一致尚未联网复核；本次仅确认本地跟踪状态未显示 ahead/behind，并保留第二周独立远端验证证据。[E-002][E-005]
- 应用当前是否已部署、线上运行状态及真实用户数据状态未在本次范围内核验。[E-002]
- 人工确认人、确认时间、确认意见、Case ID 与可信 verifier 均未提供。

## Freshness

- 最新证据时间：`2026-08-19T15:56:16Z`（本地 Git 只读核验）。[E-005]
- 本地核验时间：`2026-08-19T15:56:16Z`。[E-005]
- 远端 GitHub 最近证据时间：`2026-08-12`（第二周独立 clone 验收）；本次未联网刷新。[E-002]
- Supabase 访问状态证据时间：`2026-08-12T14:49:46Z`（审核调度状态文档版本 `ecebcf`）；本次简报未连接目标项目复核。[E-003]
- HEAD／版本是否与报告一致：本地一致；远端当前值待确认。[E-002][E-005]
- 过期条件：本地 HEAD、tree、分支或工作区状态变化；目标 Supabase 项目访问恢复或数据库元数据变化；第三周正式批次启动、完成或审核状态变化；远端 GitHub 引用发生变化；人工确认完成。

## Boundary Note

本次简报读取了指定模板、勇者酒馆长期维护计划、第二周最终上下文、第三周审核调度状态、最近一次第三周只读验收上下文，并对本地 Git 执行了只读核验。[E-001][E-002][E-003][E-004][E-005] 本次没有连接目标 Supabase 项目、读取真实数据库数据、调用真实模型、联网刷新 GitHub、运行测试或构建、修改项目代码、提交、推送、部署或发送第三周执行提示词。本简报是未经过人工确认的 `draft`，不构成发布批准、数据库变更批准、第三周启动批准或历史 Eval Case。

## Evidence Refs

| Evidence ID | 类型 | 来源／路径 | 时间或版本 | Fingerprint | 支持内容 |
| --- | --- | --- | --- | --- | --- |
| E-001 | 总纲／阶段计划 | `AI赋能知识库/60_正在执行的项目/个人项目/RPG酒馆任务App/RPG酒馆任务App长期维护计划.md > Week 3：建立数据库资产清单` | 文档版本 `16bdde`；mtime `2026-07-06T15:09:04Z` | `obsidian-version:16bdde` | 第三周目标、五张目标表、资产清单字段范围与完成定义 |
| E-002 | 最终上下文／Git／测试结果 | `AI赋能知识库/60_正在执行的项目/个人项目/RPG酒馆任务App/会话交接/2026-08-12_222000_第二周最终上下文存档.md` | 文档版本 `1d5e91`；2026-08-12 | `obsidian-version:1d5e91`；Git tree `94f5da689419eba5b5b27ca26c55b33dec1dad93` | 第二周 Git/GitHub 基线、独立 clone、测试与 analyzer 基线、遗留风险 |
| E-003 | 审核调度票据 | `AI赋能知识库/60_正在执行的项目/个人项目/RPG酒馆任务App/第三周审核调度状态.md` | 文档版本 `ecebcf`；mtime `2026-08-12T14:49:46Z` | `obsidian-version:ecebcf` | 第三周暂停状态、Supabase 访问阻塞、正式实施未启动、恢复标准 |
| E-004 | 会话交接／只读验收记录 | `AI赋能知识库/60_正在执行的项目/个人项目/RPG酒馆任务App/会话交接/2026-08-17_044907_上下文存档.md` | 文档版本 `008ee0`；`2026-08-16T20:53:40Z` | `obsidian-version:008ee0` | 双会话只读启动验收范围、仓库身份一致、禁止修改代码的边界 |
| E-005 | 本地 Git 只读快照 | `D:\AI workplace\flutter_todo_app` | `2026-08-19T15:56:16Z` | HEAD `7d36fc1f21c8bea5330c552b9faa91afd838ffd8`；tree `94f5da689419eba5b5b27ca26c55b33dec1dad93` | 当前分支、HEAD、tree、origin、tag、commit count 与 clean 工作区 |

### Evidence 检查

- Official Status、Summary 和列表中的项目事实均绑定至少一个 Evidence ID。
- Evidence 均属于勇者酒馆；总纲证据与状态证据均落在本简报冻结的时间范围内。
- 没有把测试 fixture、Preview fixture、模型生成内容或未确认的 Git 历史当作真实历史事实。
- 文档路径、Obsidian version 与 Git 指纹已记录；远端与 Supabase 未完成当前时点复核的部分均保留为 Unknown。
- 简报未记录 Secret、Token、OAuth 凭据、数据库连接串或私人业务数据。

## 人工确认收据

- Receipt contract：`project-brief-human-confirmation.v1`
- 确认人稳定 ID：`project-owner:brave-tavern`
- 确认人角色：项目所有者／最终确认人
- canonical UTC 确认时间：2026-08-20T05:03:33Z
- `source_and_redaction`：`confirmed`
- `readability`：`confirmed`
- `expected_outcomes`：`confirmed`
- 确认原文：`人工确认全部通过`
- 确认来源：`codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00`
- Brief ID：`brave-tavern-current-2026-08-19`
- Case ID：待转换
- Source fingerprint：`sha256:b78a0b65a55c4ccfbad5cb04dc1a6dea8af43f49f3568cf32525173fa365eb8e`
- Subject fingerprint：`sha256:54256ab2dcf56c0638c9d625a2c970f9015d250bd996e4b3e62ef438dff24f48`
- Confirmation receipt ID：`review-receipt:brave-tavern:20260820T050333Z`
- Trusted verifier：待接入 `ProjectBriefEvalReviewVerifier`
- Verifier 状态：`pending_integration`

> 人工语义确认已经完成；在 Case Artifact、Manifest 与可信 verifier 接入并核验前，本资产仍不计入 Phase 9 发布分母。

## 转为历史 Case 的完成检查

- [x] 时间范围和简报时间点已冻结为 canonical UTC。
- [x] 所有必需区块完整，无占位示例文本。
- [x] 所有确定事实均有可定位 Evidence。
- [x] Evidence 已按本次范围脱敏，且来源由用户授权读取。
- [x] Source fingerprint 与 Subject fingerprint 已计算。
- [ ] Case content fingerprint 已计算。
- [ ] 确认人 ID／角色、确认时间和三项确认范围齐全。
- [ ] Confirmation receipt 已由可信 verifier 验证。
- [ ] Case、Manifest 和 Dataset fingerprint 一致。
- [ ] 人工可读性已确认。
- [x] 简报不存在行动建议、编造动机、无证据价值判断或 Unknown 泄漏。

> 当前状态只能是 `draft`；本简报不得计入 `human_confirmed_historical`。
