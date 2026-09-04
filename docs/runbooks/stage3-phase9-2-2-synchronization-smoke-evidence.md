# 探索者号｜阶段 3 / Phase 9.2.2 隔离 Staging 同步 Smoke 重试证据

## 执行身份

- 批次：`explorer-stage3-phase9-2-2-staging-smoke-861b789f`
- prompt_instance_id：`explorer-stage3-phase9-2-2-isolated-staging-smoke-861b789f`
- 授权信封：`workflow-authorization.v1:861b789f12efb0e8`
- 来源审核票据：`sha256:861b789f12efb0e8ed12a0c1a049505b76dc6d2dea033378a515ee15d176647e`
- run_id：`stage3-phase9-smoke-20260811T010100Z-1ef8fde8`
- 结论：`BLOCKED`
- 阻塞分类：产品运行时缺陷；不是登录、隔离、部署、费用或测试仓库缺陷。

## 基线与不可回写 Freeze

- 分支：`feature/stage3-phase8-data-freshness-ui`
- 基线 commit：`4c94d970007820b9768cd41c46f0a93845500ef5`
- tree：`b69df236a25c11a4491942848e3a8cf6ae9cb057`
- parent：`6f1e54be2a336a63a16dea7c762ac4ff12c800ef`
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-2-pre-run-freeze.json`
- Freeze SHA-256：`f19a9b60f02e214cb651870e291bf3bc2a239460f03177b204b7fbb031b10ac0`
- Freeze recorded_at：`2026-08-11T01:02:39.0136652Z`
- Freeze 后未回写；正式对象 denominator 保持 5，不因阻塞缩小。

## 隔离资产复核

- Vercel project：`prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`，Hobby，branch-specific Preview；Production 未触碰。
- Supabase staging project：`gsnuorsqdcdszjxtymhs`，`ACTIVE_HEALTHY`，本地/远端 migration 均为 15。
- GitHub App：ID `4480141`，installation ID `151329457`；只选择 repository ID `1322569219`。
- GitHub 测试仓库：`hehehehehehecai/explorer-staging-private-test-20260804`，private，默认分支 `main`。
- Inngest environment：`staging-7050a935`，Hobby/Free；注册 project sync、Webhook consumer、daily reconciliation 三个函数；daily cron 为 `0 2 * * *`。
- 测试 Project：`81630aa3-a101-421c-b31e-dc16d1592c31`；selected repository row：`1cb60818-33d7-4991-8354-370c319027bd`。
- installation/repository/project 绑定在正式 Smoke 前唯一且 active。
- GitHub App Webhook active、SSL verification 开启；事件订阅包含 push、issues、pull_request、release、repository、workflow_run。
- GitHub、Vercel、Inngest 与正确 Supabase 账号均通过已登录隔离 CDP 会话只读核验；未读取或记录任何秘密值。

## Deployment 版本绑定

1. Freeze 后仅 fast-forward 推送 `4c94d970007820b9768cd41c46f0a93845500ef5` 到应用 `origin/staging`。
2. 首次 READY Preview：`dpl_SrqgkXTnwf26UGCpgYHt8krdfnpi`，绑定同一 40 位 SHA。
3. 为修正 Preview 的 canonical APP_ORIGIN，仅更新 Preview/staging 作用域并重新部署。
4. 最终 READY Preview：`dpl_EQMcmKFvUYZ5r4v9WfPHXzNEHPk2`，URL `executor-command-center-34shb70zd-hehehehehehecais-projects.vercel.app`，稳定 alias `executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`，target 非 Production，绑定同一 40 位 SHA。
5. Inngest 随最终 Preview 同步成功，三函数仍存在。
6. Supabase staging Auth URL Configuration 仅把 Site URL/redirect allowlist 对齐稳定 staging alias；旧 Preview redirect 保留。未写数据库业务数据、migration 或 production 配置。

## 真实认证 First Sync 与首轮失败

- OAuth 最终返回稳定 staging alias 的 `/onboarding`。
- 页面事实：`authenticated=true`、`github_app_installation=active`、selected repository count=1。
- First Sync request identity：`stage3-phase9-1ef8fde8-first-sync`。
- 调用真实入口：`POST /api/projects/81630aa3-a101-421c-b31e-dc16d1592c31/first-sync`。
- 使用真实已认证 staging 会话、exact same-origin 与 JSON body；未调用 Manual Resync，未手写数据库，未伪造 Inngest event。
- HTTP 结果：`503`。
- 安全响应：`result=failed`、`code=first_sync_start_failed`、`syncRunId=null`、`jobId=null`。
- 安全响应头：`cache-control=private,no-store,max-age=0`；`Vary` 含 `Cookie, Origin`。
- 数据库事实：创建唯一 SyncRun `06070d6a-23e2-44ba-8db2-90a4c644e8ea`，`trigger_source=first_sync`、`status=queued`、`version=1`、安全错误码为空。
- idempotency：`first-sync:stage3-phase9-1ef8fde8-first-sync`。
- provider dispatch 事实：无持久化 dispatch receipt，`provider_job_id=null`；全部六组 snapshot 仍为 0。
- Vercel 安全日志错误码：`first_sync_cursor_invalid`。
- failure ID：`7f7dcd6b-abcf-4d11-8173-e84cf18ae35b`。
- 源码边界表明异常位于 `StartFirstRepositorySync` 的派发回执到 First Sync cursor 构造/检查点/回读链路；本批次未猜测更窄根因，也未修改产品代码。

该失败发生在五类正常 GitHub 对象创建之前，是正式 Smoke 的必需前置门槛。它具有稳定安全错误码和持久化 queued SyncRun，不符合“环境瞬时失败”的一次等价重试条件，因此没有重试 First Sync。

## 远端对象与停止边界

- 本次 run_id 的 Issue/PR 搜索结果：0。
- 本次 run_id 的测试仓库 branch：0。
- 本次 run_id 的 tag/release：0。
- Push、正常 Issue、PR、prerelease、workflow_dispatch：均未创建。
- duplicate redelivery：未执行。
- Webhook 关闭窗口：未开启。
- 漏投 Issue：未创建。
- Daily Reconciliation：未触发，避免在 First Sync 未成立时产生不可归因结果。
- GitHub App、installation、Webhook、Preview、数据库与 Inngest 资产均保留供审核；未做破坏性清理。

## 固定分母与结果

| Target | 分母 | 分子 | 结果 | 直接原因 |
|---|---:|---:|---|---|
| READY deployment | 1 | 1 | PASS | READY Preview 与 40 位 SHA 权威绑定 |
| version-bound deployment | 1 | 1 | PASS | `origin/staging` 与最终 Preview 均为 `4c94d970...` |
| authenticated First Sync | 1 | 0 | FAIL | 503 / `first_sync_cursor_invalid` |
| accepted normal events | 5 | 0 | BLOCKED | First Sync 前置失败，未创建对象 |
| complete lineage events | 5 | 0 | BLOCKED | 同上 |
| snapshot/state convergence | 5 | 0 | BLOCKED | 同上 |
| duplicate replay | 1 | 0 | BLOCKED | 无 eligible 正常 delivery |
| controlled missed Issue | 1 | 0 | BLOCKED | 未进入安全漏投步骤 |
| daily reconciliation detected difference | 1 | 0 | BLOCKED | 未制造漏投事实 |
| reconciliation-created SyncRun | 1 | 0 | BLOCKED | 同上 |
| snapshot repaired | 1 | 0 | BLOCKED | 同上 |
| final Freshness matches | 1 | 0 | BLOCKED | First Sync 未建立初始 snapshot |
| over-24-hour indicator | 1 | 0 | NOT_APPLICABLE | 本次没有 eligible 成功同步时间 |

## 本地回归证据

- Phase 5–9.2.1 定向：19 files / 169 tests / 0 skipped，exit 0。
- `pnpm run test:integration:app`：Local Supabase 恢复后 18 files / 62 tests / 0 skipped，exit 0。
- `pnpm run test:integration:db`：17 files / 529 pgTAP tests，exit 0。
- `pnpm run lint`：exit 0。
- `pnpm run typecheck`：exit 0。
- `pnpm run db:lint`：0 findings，exit 0。
- `pnpm run db:types:check`：generated types up to date，exit 0。
- `pnpm run db:drift:check`：empty drift，exit 0。
- `pnpm run test:e2e`：2/2 passed，exit 0；Next 自动改写的 `next-env.d.ts` 已在证明来源后精确恢复到 HEAD 指纹。
- `pnpm test`：两次均在固定 180 秒本地资源上限后 exit 124；未增大超时。单独复验首轮曾异常的 `module-boundaries` 为 1 file / 36 tests 全通过。全量门禁因此不得记为 PASS。

## 失败、环境恢复与副作用

- 首轮定向测试未进入 Vitest：Windows 依赖命令链接编码/PATH 异常。锁文件固定的离线依赖检查无变更；改用同一已安装 Vitest 入口后通过。
- 应用集成首轮受沙箱 telemetry 写入限制影响；系统环境复验确认 Docker 尚未运行。启动本机 Docker 与 Local Supabase 后复验通过。
- E2E 首轮因沙箱拒绝 Next lockfile 失败；系统环境等价复验 2/2 通过。
- Vercel APP_ORIGIN 与 Supabase Site URL 初始仍指向旧 Preview，分别在 Preview/staging 范围和 Supabase staging Auth URL Configuration 内修正；未触碰 Production。
- 用户曾进入错误 Supabase 账号；在任何 Supabase 保存动作前停止，切换并核验正确 project 后才更新 staging URL 配置。
- First Sync 的 503 是唯一产品失败；没有通过重试、手写库、Manual Resync 或新对象规避。
- CLI 曾显示遮罩凭据状态行；未复制、未写入 Freeze/evidence/报告。

## 安全、成本与范围

- 未保存 secret、token、private key、signing key、session value、Authorization value、Cookie value、raw provider payload 或完整错误栈。
- 未修改产品源码、migration、RLS、合同、UI、package、lockfile 或数据库类型。
- `next-env.d.ts` 最终与基线 SHA-256 `4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac` 一致。
- 远端 C 类动作仅包括授权的 staging fast-forward Push、Preview 部署/重部署、Preview APP_ORIGIN、Supabase staging Auth URL 配置、真实 OAuth 与一次 First Sync 请求。
- 未 Push main/master、未 Merge、未 Promote Production、未写其他仓库、未关闭 Webhook、未创建测试对象。
- 成本为 0，全部使用现有 Hobby/Free 能力；未进入 Trial 或升级。

## 审核结论边界

本证据只证明隔离 staging、版本绑定、真实认证入口和失败边界。它不证明五类 Webhook lineage、duplicate、漏投修复、Daily Reconciliation 或最终 Freshness。总体结果必须为 `BLOCKED`，等待独立审核决定是否开设针对 `first_sync_cursor_invalid` 的最小产品修复批次。
