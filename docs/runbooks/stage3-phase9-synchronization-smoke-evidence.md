# 探索者号｜阶段 3 / Phase 9 Staging 同步 Smoke Test 脱敏证据

## 1. 执行身份与结论

- 批次 ID：`explorer-stage3-phase9-staging-smoke-83ed2e65`
- prompt_instance_id：`explorer-stage3-phase9-synchronization-smoke-83ed2e65`
- 授权策略：`workflow-authorization.v1`
- 授权信封 ID：`workflow-authorization.v1:83ed2e65f3979c22`
- 人工操作 ID：`sha256:0823e09f1d640214d7e85af222aba03aefd78da4d7f0a49f068831759870e17e`
- 来源审核票据：`sha256:57b561adaa69e8d6e534c09ba7f2c29b666268b707d61b9d51f86f964f1e686a`
- 总纲版本：`fe5902`
- run_id：`stage3-phase9-smoke-20260807T030405Z-d4f551a1`
- 正式结论：`BLOCKED_PRE_REMOTE_WRITE`
- 成本：`0`；仅进行了只读外部审计和本地验证。

本次在任何远程写入前发现五项 Exit Criteria 硬阻塞。提示词明确规定真实 Daily Reconciliation 入口、Staging 隔离条件或必要 provider 能力不存在时必须停止 Smoke，且不得修改 Phase 1–8.1.2 产品代码补齐。因此没有创建 staging 分支、deployment、GitHub 测试对象、delivery、SyncRun 或远程数据库事实，也不能把本地合同测试替代为真实 staging lineage。

## 2. 基线与 Pre-Run Freeze

- 本地分支：`feature/stage3-phase8-data-freshness-ui`
- 基线 commit：`223ba41333d029940aeba6cf5f7524e42bfeaadc`
- 基线 tree：`d058e1ab44a3193023dba140802a8ad5dbc97ed4`
- parent：`4c80e9cd5b383c7a85fb0c5cde55a6d404c7c42f`
- 规范化 origin：`github.com/hehehehehehecai/executor-command-center`
- origin 默认分支：`main`
- origin/main：`01abfef14effbfd7e61aa370b254ad34d4182134`
- 相对 origin/main：ahead `20`，behind `0`
- 初始工作树：干净
- Freeze：`tests/fixtures/synchronization/stage3-phase9-pre-run-freeze.json`
- Freeze 创建时间：`2026-08-07T03:06:53.902Z`
- Freeze SHA-256：`22f134f4e1db5d624eb258cf89a3aed66d357e52711fa25afaa4a25b3b4bd72f`
- Freeze 创建前远程写入：`0`
- Freeze 创建后远程写入许可：`false`，因为预运行结果已经是 BLOCKED。

Freeze 固定了 run_id、隔离资产的非秘密 ID、五项 blocker、合同版本、事件分母、六个计划对象身份、lineage 字段、成本边界、失败保留规则和严格两文件范围。Freeze 创建后未回写。

## 3. 只读隔离资产审计

### 3.1 GitHub 身份与测试仓库

- GitHub CLI：`2.96.0`
- 当前账号：`hehehehehehecai`
- 可见 scope 名：`admin:public_key`、`gist`、`read:org`、`repo`
- 测试仓库 ID：`1322569219`
- full_name：`hehehehehehecai/explorer-staging-private-test-20260804`
- visibility：`private`
- 默认分支：`main`
- 默认 HEAD：`4107e7210f5ae10920e5341d18d0cdd4565fb983`
- 初始概况：branch `1`、issue `0`、PR `0`、release `0`、workflow `0`
- run_id 碰撞：issue `0`、code `0`、branch `0`

GitHub App installation 元数据需要 App JWT；当前用户凭据对相应入口分别得到安全的 `401`/`403`，因此无法权威确认 installation ID、专用 App 是否只覆盖指定仓库，以及事件订阅集合。该结果不能被解释为“确定不存在 installation”，只能判定“隔离身份不可验证”。审计未创建或修改任何 GitHub 对象。

### 3.2 Vercel

- CLI：通过临时 `pnpm dlx` 使用 `58.7.1`，未修改 package/lock。
- 账号：`hehehehehehecai`
- team ID：`team_IDGruFjuEZmy1dJRsg0RYkKf`
- project ID：`prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`
- project name：`executor-command-center`
- plan：`hobby`
- Production Branch：`main`
- Custom Environment 数：`0`
- staging deployment 数：`0`
- staging 分支 Preview 环境变量数：`0`

现有 Preview 变量只绑定另一个历史分支，不能视为本批次 staging 配置；同时缺少本批次所需的 Webhook/Inngest staging 合同。未创建 deployment、未写环境变量、未执行 Production Promotion。

### 3.3 Supabase

- 隔离项目 ID：`gsnuorsqdcdszjxtymhs`
- 项目名：`executor-command-center-staging`
- organization ID：`xhbwmolvyznduecaraot`
- region：`ap-northeast-2`
- 状态：`ACTIVE_HEALTHY`
- 本地 migration：`14`
- 远程 migration：`9`
- 远程缺失：`20260805181000`、`20260805190000`、`20260806100000`、`20260806123000`、`20260806153000`

缺失项覆盖活动快照、SyncRun、First Sync 支持、Webhook inbox 与 Reconciliation，故 staging 数据库不能承载 Phase 9 lineage。未执行远程 migration、远程 SQL 或手动数据写入。

### 3.4 Inngest 与 Daily Reconciliation

仓库存在 Application use case 和 `DailyReconciliationSchedulerAdapter`，但 adapter 仅由测试引用；生产代码中不存在可部署 cron/scheduler route，也不存在 Inngest `serve` 接收入口或 consumer function。现有 Inngest 代码只能发送 provider event，不能执行同步工作。实际事实如下：

- deployable Daily Reconciliation entrypoint：不存在
- Inngest receiving endpoint：不存在
- consumer function 数：`0`
- staging Inngest environment ID：不可验证
- staging event/signing key 合同：未配置到 staging 分支

这两项是产品能力缺口。Phase 9 禁止修改既有产品实现，因此不能在本批次补路由、consumer 或 scheduler。

## 4. 阻塞清单与影响

1. `phase9_daily_reconciliation_entrypoint_missing`：无法触发并证明真实 Daily Reconciliation；不能用 Manual Resync 冒充。
2. `phase9_inngest_consumer_missing`：provider event 即使能发送，也没有 deployed consumer 执行同步。
3. `phase9_staging_database_schema_incomplete`：隔离数据库缺五个同步 migration，无法产生可信 snapshot/SyncRun/webhook/reconciliation 事实。
4. `phase9_staging_github_app_isolation_unverified`：无法证明专用 App 的独占 installation 和订阅，禁止执行 webhook 暂停漏投。
5. `phase9_staging_preview_configuration_missing`：没有 staging deployment 和 staging 分支 Preview 配置。

以上任一项都阻塞 Exit Criteria；五项同时存在。因此正式 Smoke 在远程写入前停止，未用重试、Manual Resync、手动写库或 UI 推断制造通过。

## 5. 合同绑定

- `github-activity-snapshots.v1`
- `synchronization-state.v1`
- `sync-runs.v1`
- `github-webhook-signature.v1`
- `github-webhook-delivery.v1`
- `github-webhook-event.v1`
- `github-webhook-ingestion.v1`
- `github-webhook-dispatcher.v1`
- `repository-reconciliation.v1`
- `reconciliation-schedule.v1`
- `manual-resync.v1`
- 实际 Freshness 合同：`freshness-status.v1`
- UI 合同：`project-data-freshness-ui.v1`

本批次没有修改任何合同、migration、RLS、生成类型或产品实现。

## 6. Target-specific 结果

| Target | Numerator / Denominator | 状态 | 直接证据 |
|---|---:|---|---|
| READY deployment | 0 / 1 | BLOCKED | staging deployment 数为 0，且预运行硬阻塞要求停止远程写入 |
| deployment 40 位 SHA 绑定 | 0 / 1 | BLOCKED | 未创建 deployment |
| accepted 正常事件 | 0 / 5 | BLOCKED | Push/Issue/PR/Release/Workflow 均未创建 |
| 完整 provider-to-UI lineage | 0 / 5 | BLOCKED | 不存在 delivery、consumer、staging schema 与 SyncRun 证据 |
| snapshot/state convergence | 0 / 5 | BLOCKED | 未执行正式 Smoke |
| duplicate replay 无第二逻辑结果 | 0 / 1 | BLOCKED | 未创建 eligible delivery，未执行重放 |
| controlled missed Issue | 0 / 1 | BLOCKED | GitHub App 独占隔离不可验证，禁止关闭 webhook |
| Daily Reconciliation 检出差异 | 0 / 1 | BLOCKED | 真实 entrypoint 不存在 |
| reconciliation-created SyncRun | 0 / 1 | BLOCKED | 真实 entrypoint与 staging schema 均不满足 |
| snapshot repaired | 0 / 1 | BLOCKED | 未执行漏投与修复链路 |
| Freshness 最终准确可见 | 0 / 1 | BLOCKED | 没有本次 staging project/SyncRun/snapshot |
| 超过 24 小时指示 | N/A | NOT_APPLICABLE | 没有 eligible staging 同步事实，不能构造人工时间冒充 |

Denominator 未缩小；所有未运行 case 均保留为 BLOCKED，不从分母排除。

## 7. 五类正常对象与漏投对象

以下身份已在 Freeze 固定，但未进行远程创建：

| 类型 | 固定身份 | provider ID / delivery / SyncRun |
|---|---|---|
| Push | `stage3-phase9-smoke-20260807T030405Z-d4f551a1-push` | 未创建 / BLOCKED |
| Issue | `stage3-phase9-smoke-20260807T030405Z-d4f551a1-issue` | 未创建 / BLOCKED |
| PR | `stage3-phase9-smoke-20260807T030405Z-d4f551a1-pr` | 未创建 / BLOCKED |
| prerelease | `stage3-phase9-smoke-20260807T030405Z-d4f551a1-release` | 未创建 / BLOCKED |
| workflow_dispatch | `stage3-phase9-smoke-20260807T030405Z-d4f551a1-workflow` | 未创建 / BLOCKED |
| 漏投 Issue | `stage3-phase9-smoke-20260807T030405Z-d4f551a1-missed-issue` | 未创建 / BLOCKED |

因此 Push、Issue、PR、Release、Workflow、duplicate replay、漏投窗口、Daily Reconciliation、修复后的 snapshot/Freshness 均没有 provider 事实，不能宣称 PASS。

## 8. 本地验证证据

### 8.1 定向合同测试

| 范围 | 结果 |
|---|---|
| Phase 5 First Sync 定向 | 4 files，38 tests，0 skipped，exit 0 |
| Phase 6 Webhook/Route 定向 | 7 files，47 tests，0 skipped，exit 0 |
| Phase 7 Reconciliation/Manual 定向 | 7 files，58 tests，0 skipped，exit 0 |
| Phase 8 Freshness/Conformance 定向 | 4 files，38 tests，0 skipped，exit 0 |

### 8.2 全量、应用与数据库

- `pnpm test` 首轮：88 files，87 passed / 1 failed；927 tests，926 passed / 1 failed；失败为 module-boundary 单测的 10 秒瞬时 timeout，exit `1`。
- 隔离复验：`module-boundaries.test.ts` 1 file，36/36 tests，exit `0`。
- 唯一一次完全相同安全复验：88/88 files，927/927 tests，0 skipped，exit `0`。
- `pnpm run test:integration:app` 首轮：17 files，10 passed / 7 failed；59 tests，38 passed / 20 skipped / 1 failed；本机 Docker daemon 未启动，exit `1`。
- 启动本机隔离 Docker/Supabase 后复验：17/17 files，59/59 tests，0 skipped，exit `0`。
- `pnpm run test:integration:db`：16 files，487 assertions/tests，0 skipped，exit `0`。

### 8.3 静态与数据库门禁

| 命令 | 结果 |
|---|---|
| `pnpm run lint` | exit 0；0 warnings |
| `pnpm run typecheck` | exit 0 |
| `pnpm run db:lint` | exit 0；results 为空 |
| `pnpm run db:types:check` | exit 0；生成类型一致 |
| `pnpm run db:drift:check` | exit 0；schema drift 为空 |

本地测试只证明已实现合同没有回归，不替代真实 staging provider lineage。

## 9. 失败与纠正记录

1. 首次生成 run_id 的随机字节方法在当前 PowerShell/.NET 运行时不支持 `.Fill`，得到不可用的全零候选；未写入 Freeze、未用于远程对象。改用 `RandomNumberGenerator.Create().GetBytes()` 一次安全替代，得到最终 run_id。
2. 初次 branch 碰撞探测把 GitHub API 的空数组退出码误当作“存在”；改为解析数组长度，确认计数为 0。
3. 初次 Vercel Custom Environment/branch env 统计把 `null` 或 JSON wrapper 当作一项；改为读取实际数组字段，结果分别为 0/0。
4. 一次 Supabase migration JSON 解析脚本误读人类可读表格并报告错误计数；以 CLI 权威列表逐项复核，固定为本地 14、远程 9、缺 5。
5. GitHub App installation 审计分别得到安全 `401`/`403`；未升级权限、未读取密钥、未绕过。结论是“不可验证”，而非虚构 installation 状态。
6. 全量测试首轮发生一项 ESLint 初始化/资源型 timeout；隔离测试 36/36 后，唯一一次相同全量复验 927/927。
7. 应用集成首轮因本机 Docker daemon 未启动失败；启动隐藏的本机 Docker Desktop 和隔离 Supabase 后，59/59 通过。
8. 本机 Supabase 启动工具曾在工具输出中显示本地演示值；这些值未复制、未持久化、未写入 fixture、文档或报告，也不是 staging/production 凭据。

所有首轮失败都被保留。没有删除失败证据、缩小分母或创建替代业务对象。

## 10. 敏感信息、真实服务与副作用边界

- 远程读取：GitHub、Vercel、Supabase 的非秘密元数据，只读。
- 远程写入：`0`。
- staging branch Push：`0`。
- deployment/Promotion：`0`。
- GitHub 测试对象：`0`。
- webhook 禁用/恢复：`0`。
- 远程 migration/SQL/Manual Resync：`0`。
- 登录、验证码、扫码、付费或升级：`0`。
- 生产环境/数据接触：`0`。
- 本地副作用：启动本机 Docker Desktop 与本地 Supabase；生成两份允许的 Phase 9 证据文件；无产品代码变化。
- 远程清理：无需执行，因为未产生远程写入。
- 未来清理需求：无本批次远程资产或测试对象需要清理。

证据只保存非秘密 ID、计数、状态、hash 与稳定错误分类；不保存 token、private key、Webhook secret、service-role key、cookie、Authorization 值、raw private payload 或 provider secret 值。对两份 Phase 9 文件执行只输出计数的脱敏模式扫描：GitHub token、JWT、private key、Authorization 值、Cookie 值和 canonical Webhook signature value 均为 `0` 命中。

## 11. 范围与历史资产保护

允许且实际涉及的仓库文件只有：

1. `tests/fixtures/synchronization/stage3-phase9-pre-run-freeze.json`
2. `docs/runbooks/stage3-phase9-synchronization-smoke-evidence.md`

未修改 Phase 1–8.1.2 产品实现、migration、RLS、合同、历史 Freeze/manifest、`package.json`、`pnpm-lock.yaml` 或 `next-env.d.ts`。基线指纹已写入不可回写 Freeze，提交前后将再次比较。

## 12. Exit Criteria 判定

| Exit Criteria | 结果 | 证据/理由 |
|---|---|---|
| Freeze 在远程写入前创建且未回写 | PASS | 远程写入 0；Freeze SHA 固定 |
| Vercel/Supabase/GitHub App/Inngest 完全隔离 | BLOCKED | Supabase 有隔离项目，但 schema 不完整；其余 staging 配置/身份不完整或不可验证 |
| 无付费、Production、main/master Push、Merge、其他仓库写入 | PASS | 全部计数 0，成本 0 |
| deployment READY 且 SHA 绑定 | BLOCKED | 无 staging deployment |
| First Sync 成立 | BLOCKED | staging schema/consumer/配置未闭合 |
| 五类事件完整 lineage | BLOCKED | 0/5，正式 Smoke 未启动 |
| duplicate replay 幂等 | BLOCKED | 0/1，无 eligible delivery |
| Issue Webhook 确实漏投且立即恢复 | BLOCKED | App 独占隔离不可验证，未执行 |
| 真实 Daily Reconciliation 修复 | BLOCKED | 真实 entrypoint 不存在，未用 Manual Resync 冒充 |
| 修复后 snapshot/status/Freshness 与远端一致 | BLOCKED | 无 eligible staging 事实 |
| 失败、审批、成本、清理完整记录 | PASS | 本文与 Freeze 完整记录 |
| 脱敏证据无秘密/raw payload | PASS | 六类高风险值模式均为 0 命中；未输出匹配内容 |
| 本地必需门禁 | PASS | 定向、927 全量、59 应用、487 数据库、lint/typecheck/db lint/types/drift 通过 |
| staging 门禁与 workflow | BLOCKED | 未创建 deployment/workflow，不能在阻塞后执行 |
| 只新增 Phase 9 证据文件 | PASS（提交前再次审计） | 严格两文件范围 |
| 独立本地 commit 与最终干净工作树 | 待提交后固化 | 在最终 Git 证据中记录 |

总体状态：`BLOCKED`。任何必需 staging Exit Criteria 缺失时不得报告 PASS。

## 13. 下一任务与停止点

是否进入下一任务：否，停止并等待审核。

继续 Phase 9 的前置条件是由独立产品/环境批次补齐真实 Daily Reconciliation entrypoint、Inngest consumer、五个 staging migration、专用 GitHub App 独占 installation/订阅可验证性，以及 staging branch Preview 配置。补齐后应启动一个新的 Smoke run_id；不得回写本 Freeze 或把本次 BLOCKED 分母改成 PASS。
