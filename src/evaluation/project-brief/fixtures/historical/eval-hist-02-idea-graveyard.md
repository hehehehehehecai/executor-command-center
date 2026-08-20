---
document_type: project_brief
contract: project-brief-v1
schema: project-brief-schema-v1
template_version: 1
brief_id: idea-graveyard-current-2026-08-19
snapshot_type: historical
snapshot_status: human_confirmed_historical
project: 灵感公墓
canonical_utc: 2026-08-19T15:56:00.7002770Z
source_bundle_fingerprint: sha256:5ab41adbb14e04d59c11a9254c364932080fd44a8e62d4301b12800c58717496
subject_fingerprint: sha256:74905163ddf0ef7b9fb7f684d33186f31e17234df2dd22bbbf0eb713626237c1
confirmation_receipt_id: review-receipt:idea-graveyard:20260820T050333Z
confirmed_at_utc: 2026-08-20T05:03:33Z
eval_inclusion_status: pending_case_conversion_and_trusted_verification
---

# 灵感公墓当前项目简报

## 简报元数据

- Brief ID：`idea-graveyard-current-2026-08-19`
- 项目：灵感公墓 / Idea Graveyard
- 仓库／工作目录：`D:\AI workplace\IdeaGraveyard\IdeaGraveyard\idea-graveyard`
- 当前分支：`master`
- 当前 HEAD／版本：`d0521e9b762570ba0bb93ac3dc6aa11fc2442b71`
- Snapshot 类型：`historical`
- Snapshot 状态：`human_confirmed_historical`
- 时间范围：`2026-08-12T14:47:46.059Z — 2026-08-19T15:56:00.7002770Z`
- 简报时间点：`2026-08-19T15:56:00.7002770Z`
- Contract：`project-brief-v1`
- Schema：`project-brief-schema-v1`
- Source bundle fingerprint：`sha256:5ab41adbb14e04d59c11a9254c364932080fd44a8e62d4301b12800c58717496`
- Subject fingerprint：`sha256:74905163ddf0ef7b9fb7f684d33186f31e17234df2dd22bbbf0eb713626237c1`
- Confirmation receipt ID：`review-receipt:idea-graveyard:20260820T050333Z`
- 脱敏状态：本次未读取 `.env`、Secret、Token、账号、私人内容或客户数据；证据路径与命令摘要已脱敏
- 人工确认状态：已确认
- 人工确认时间：2026-08-20T05:03:33Z
- 来源与脱敏确认：`source_and_redaction = confirmed`
- 可读性确认：`readability = confirmed`
- 预期结论确认：`expected_outcomes = confirmed`
- Eval 纳入状态：`pending_case_conversion_and_trusted_verification`
- 发布分母状态：尚未计入，需转换为 Eval Case 并由可信 verifier 核验

## Official Status

灵感公墓处于未来 8 周路线图的模块 2「美术与 P0 素材」Work Unit B 概念样张生产阶段：Work Unit A 的视觉治理与目录契约已建立，A 环境方向 4 张候选已提交，但 12 张概念样张尚未齐备且第一次人工方向门禁尚未到达；P0 生产、Work Unit D 产品接入以及 Gate B／Gate C 均没有当前快照下的通过证据。[E-002][E-003][E-004][E-005]

## Summary

当前 `master` 指向 `d0521e9`，相对本地 `origin/master` 记录超前 4 个提交、落后 0 个提交；工作树包含 6 个未跟踪的 B 档案方向候选或技术拒绝 PNG。[E-001][E-002] 受跟踪的概念 manifest 记录 A01～A04 为 `awaiting-batch-review`，B01～B04 与 C01～C04 为 `not-generated`；这与工作树中的未跟踪 B 文件共同表明 B 方向已有尚未纳入当前 manifest／提交的在途产物，但不能据此判定 B01 或 B02 已完成。[E-001][E-004] 本地最小质量门禁于本简报时间范围内通过，TypeScript 检查与全量测试退出码为 0，测试结果为 477/477 通过；该结果不证明 Web build、真实设备、远端 CI、部署或生产环境状态。[E-006][E-008]

## Completed Changes

- 模块 2 Work Unit A 已建立风格圣经、Prompt registry、素材规格、评审门禁、目录契约以及概念／P0 manifest；这些产物由提交 `46a560c` 纳入版本历史。[E-002][E-005]
- A 环境方向的 A01、A02 v2、A03、A04 四张概念候选及对应不可变 source 已由提交 `d0521e9` 纳入版本历史；manifest 将四项标为 `awaiting-batch-review`，尚未获得用户审美批准。[E-002][E-004]
- 本地 `npm run verify` 于 `2026-08-19T15:55:45.7600147Z — 2026-08-19T15:56:00.7002770Z` 完成，退出码为 0；测试共 477 项，477 项通过，0 项失败、取消、跳过或待办。[E-006]
- 历史 AI MT512 评测记录显示：在既有授权下完成固定 30-case 的唯一一次真实运行，30/30 通过 canonical Runtime Schema，且三项发布安全清单为空；该证据仅支持当时的 AI Release Candidate gate，不代表当前应用已部署或线上服务可用。[E-007]

## Ongoing Work

- 当前工作树存在 B 档案方向的 `ig-m2-concept-b01-v2.png` 候选与 source，以及 B01 v1、B02 v1 的技术拒绝 source／candidate，共 6 个未跟踪文件。[E-001]
- 受跟踪 manifest 仍将 B01、B02 标为 `not-generated`，因此这些未跟踪文件尚未形成当前快照下可追溯、已提交的完成记录。[E-001][E-004]
- 12 张概念样张批次当前只有 A01～A04 在受跟踪 manifest 中处于等待批次评审状态；B、C 方向的剩余受跟踪条目尚未生成。[E-004]

## Open Items

- 将 B 方向在途文件与对应 Prompt、处理步骤、SHA-256、技术结论及 manifest 状态对齐，并决定是否纳入版本历史。责任人：待确认；截止时间：待确认。[E-001][E-004]
- 完成 B、C 方向剩余概念样张，使 12 张批次齐备，然后进入 `HUMAN_GATE_CONCEPT_DIRECTION`。责任人：待确认；截止时间：待确认。[E-003][E-005]
- 在用户完成概念方向选择前，24 个 P0 候选不得开始；在 P0 全量人工验收与另行明确授权前，Work Unit D 不得开始。[E-003][E-005]
- 针对当前 HEAD 运行统一 `npm run release:check` 并保存 typecheck、test、Web build 同一次执行的完整结果；本简报仅取得 `npm run verify` 的新鲜证据。责任人：待确认；截止时间：待确认。[E-006][E-008]
- 对当前本地 4 个领先提交与 6 个未跟踪文件完成有意纳入或排除决策，并重新核验本地与远端 refs；本简报没有执行 push、merge 或远端查询。责任人：待确认；截止时间：待确认。[E-001]

## Risk Signals

- 当前本地 `master` 与本地记录的 `origin/master` 不一致，4 个本地提交不在该 upstream 引用中；远端是否已通过其他方式更新未在本次扫描中核验。[E-001]
- 6 个 B 方向 PNG 尚未跟踪，其中 manifest 仍把 B01／B02 记为 `not-generated`；文件身份、版本状态和结构化记录之间尚未闭合。[E-001][E-004]
- README 明确指出仓库不能证明线上 Supabase 的完整 Schema、既有 RLS、Edge Function Secrets、局部 migration 与账号删除 RPC 已配置完成。[E-008]
- 历史 MT512 评测仍保留轻度 Evidence Discipline finding，尤其是通用 Unknown 枚举与 Case 030 的偏宽推断；这些 finding 未触发当时的 0 分禁区，但仍属于已记录的质量信号。[E-007]

## Unknowns

- 当前远端仓库是否仍为 Private、远端实际 refs 是否与本地 remote-tracking refs 一致：本次未连接 GitHub，待确认。[E-001]
- 当前线上 Supabase migration、RLS、Edge Functions、Secrets、账号删除 RPC 与真实公共互动链路状态：待确认。[E-008]
- 当前 HEAD 的 GitHub Actions、Expo Web 发布、Android／iOS 真机或模拟器、浏览器人工核心路径状态：待确认。[E-008]
- B01 v2 与 B01／B02 技术拒绝文件的最终评审结论、manifest 更新与提交归属：待确认。[E-001][E-004]
- 图像生成服务在对应生成时间的许可证或条款复核结果：manifest 要求再次核验，本次未执行外部核验。[E-004]

## Freshness

- 最新证据时间：`2026-08-19T15:56:00.7002770Z`
- 本地 Git 核验时间：`2026-08-19T15:55:45Z` 至 `2026-08-19T15:56:00.7002770Z`
- 本地质量门禁核验时间：`2026-08-19T15:55:45.7600147Z — 2026-08-19T15:56:00.7002770Z`
- 远端核验时间：本次未连接远端；仅读取本地 `origin/master` remote-tracking ref
- HEAD／版本是否与报告一致：一致；简报生成时 HEAD 为 `d0521e9b762570ba0bb93ac3dc6aa11fc2442b71`
- 过期条件：HEAD、工作树、manifest、模块门禁状态、远端 refs、测试结果、线上配置或人工确认状态任一发生变化时，本简报不再代表最新状态。

## Boundary Note

本次扫描包含模板、项目 README、8 周路线图、模块 2 设计／治理文档、概念 manifest、历史 AI MT512 评测报告、本地 Git 元数据与一次新鲜 `npm run verify`；未读取 `.env` 内容，未调用真实模型，未访问真实 Supabase 或生产数据，未连接 GitHub 远端，未执行 `npm run release:check`、EAS build、部署、migration、push、merge、PR、Release 或代码修改。除生成本知识库简报外，项目仓库未被修改。本简报是当前状态草稿，不构成 Gate A／B／C、发布、部署或历史 Case 纳入批准。[E-001][E-003][E-006][E-007][E-008]

## Evidence Refs

| Evidence ID | 类型 | 来源／路径 | 时间或版本 | Fingerprint | 支持内容 |
| --- | --- | --- | --- | --- | --- |
| E-001 | 本地 Git 状态快照 | `git branch --show-current`、`git rev-parse`、`git rev-list`、`git status --porcelain=v1 --untracked-files=all` | `2026-08-19T15:56:00.7002770Z` | `sha256:74905163ddf0ef7b9fb7f684d33186f31e17234df2dd22bbbf0eb713626237c1` | 分支、HEAD、upstream、4 个领先提交、6 个未跟踪文件 |
| E-002 | Git commit | `d0521e9b762570ba0bb93ac3dc6aa11fc2442b71` 及其最近模块 2 历史 | HEAD：`2026-08-18T17:35:00Z` | `git:d0521e9b762570ba0bb93ac3dc6aa11fc2442b71` | Work Unit A 治理提交与 A 环境方向候选提交 |
| E-003 | 路线图 | `docs/superpowers/plans/2026-08-13-idea-graveyard-8-week-modular-roadmap.md` | 当前工作树 | `sha256:bef834c9c2775065f96a2470ea543bd1f26851a49d66aad1b3d9d1485dffc0ab` | 模块依赖、Gate A／B／C、模块 2 与 Work Unit D 边界 |
| E-004 | 概念资产 manifest | `artifacts/module-2-art/manifests/concept-assets.json` | 当前工作树 | `sha256:57a64f651aa5bfdf21365c1043ff8171743e0c2d0f3f7eb6a49009f0afe4d9bb` | A01～A04 等待评审；B、C 受跟踪条目未生成 |
| E-005 | 模块 2 治理说明 | `artifacts/module-2-art/README.md` | 当前工作树 | `sha256:17c93bd92a514501accefcb678123a1c9c5911d533bd00b6569927f5315b940e` | 目录契约、状态流、人工门禁与锁定状态 |
| E-006 | 本地验证结果 | `npm run verify` 完整输出 | `2026-08-19T15:55:45.7600147Z — 2026-08-19T15:56:00.7002770Z` | `sha256:9424fce1ea5fc1156bb52d5b1b6267283d7a8be0cda935e870005485939254ee` | typecheck 与 477/477 全量测试通过，退出码 0 |
| E-007 | AI 评测报告 | `docs/ai/eval-mt512.md` | Day 42.5；真实运行完成于 `2026-08-12T14:49:03.116Z` | `sha256:642060d08a36aeb7e41f3ff3a03b62fcde915cb213274af69d26318ff504b83f` | 30-case MT512 评测、Release Candidate gate 与已知限制 |
| E-008 | 项目说明 | `README.md` | 当前工作树 | `sha256:d2641c3b526a6e48bb3ec0c58928d838896ce1ed34b2c01dc6567e5dcdcd9b3e` | 质量门禁、发布边界、Supabase 与真实环境限制 |

### Evidence 检查

- Official Status、Summary 与全部列表事实均绑定至少一个 Evidence ID。
- 所有 Evidence 均来自灵感公墓项目，并位于所声明时间范围或当前快照中。
- 历史 AI 评测只用于支持当时的 AI Release Candidate 结论，没有被扩大解释为当前部署或线上状态。
- 本次未读取 Secret、Token、账号、私人内容或客户数据；证据仅包含项目路径、Git 元数据、脱敏报告与测试摘要。
- Source bundle fingerprint 由 E-001、E-003～E-008 的 SHA-256、验证退出码与验证结束时间按固定键顺序拼接后计算。
- Subject fingerprint 由分支、HEAD、upstream、ahead／behind 与完整 porcelain 状态按固定键顺序拼接后计算。

## 人工确认收据

- Receipt contract：`project-brief-human-confirmation.v1`
- 确认人稳定 ID：`project-owner:idea-graveyard`
- 确认人角色：项目所有者／最终确认人
- canonical UTC 确认时间：2026-08-20T05:03:33Z
- `source_and_redaction`：`confirmed`
- `readability`：`confirmed`
- `expected_outcomes`：`confirmed`
- 确认原文：`人工确认全部通过`
- 确认来源：`codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00`
- Brief ID：`idea-graveyard-current-2026-08-19`
- Case ID：待转换
- Source fingerprint：`sha256:5ab41adbb14e04d59c11a9254c364932080fd44a8e62d4301b12800c58717496`
- Subject fingerprint：`sha256:74905163ddf0ef7b9fb7f684d33186f31e17234df2dd22bbbf0eb713626237c1`
- Confirmation receipt ID：`review-receipt:idea-graveyard:20260820T050333Z`
- Trusted verifier：待接入 `ProjectBriefEvalReviewVerifier`
- Verifier 状态：`pending_integration`

> 人工语义确认已经完成；在 Case Artifact、Manifest 与可信 verifier 接入并核验前，本资产仍不计入 Phase 9 发布分母。

## 转为历史 Case 的完成检查

- [x] 当前简报时间范围和 canonical UTC 时间点已记录。
- [x] 所有必需区块均存在，且没有模板占位符。
- [x] 当前状态事实均有可定位 Evidence。
- [x] Source fingerprint 与 Subject fingerprint 已计算。
- [ ] Evidence 来源授权与脱敏范围已由人工确认。
- [ ] Case content fingerprint 已计算。
- [ ] 确认人稳定 ID／角色、确认时间和三项确认范围齐全。
- [ ] Confirmation receipt 已由可信 verifier 验证。
- [ ] Case、Manifest 和 Dataset fingerprint 一致。
- [ ] 人工可读性已确认。
- [ ] 当前简报已转换并批准为 `human_confirmed_historical`。

> 本简报保持 `draft`。缺少人工确认收据、Case content fingerprint 与可信 verifier 验证，因此不得计入 `human_confirmed_historical`。
