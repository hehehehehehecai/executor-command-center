# 探索者号｜阶段 3 / Phase 9.2 隔离 Staging 同步 Smoke Test 证据

## 1. 运行身份与证据边界

- 批次：`explorer-stage3-phase9-2-staging-smoke-4d43ace1`
- prompt：`explorer-stage3-phase9-2-isolated-staging-smoke-4d43ace1`
- 授权信封：`workflow-authorization.v1:4d43ace1a1a77781`
- 人工操作：`sha256:0823e09f1d640214d7e85af222aba03aefd78da4d7f0a49f068831759870e17e`
- 基线 commit：`fe5ad75cdd33f6b442605c4cfc1629207529899b`
- 基线 tree：`2a4588ecf8875c9702bc7227130c27a25608d2b5`
- 不可回写 Freeze：`tests/fixtures/synchronization/stage3-phase9-2-pre-run-freeze.json`
- Freeze SHA-256：`a90f6c0c13fe00fefe96a00fe0f0b0af44a98a852da32155c2e9b95e3963e91b`
- Freeze 内候选 run_id：`stage3-phase9-smoke-20260810T031204Z-7f417504`，未进入正式 Smoke，未创建任何业务对象。
- 恢复点后正式 run_id：`stage3-phase9-smoke-20260810T070930Z-75c0cf0b`。
- 新 run_id 冲突检查：Issue/PR `0`、branch `0`、tag `0`、release 精确查询 `404`。

Freeze 保持不可回写。恢复点后按人工澄清要求生成新 run_id；该偏差仅记录在本证据中，不追认或修改 Freeze 前事实。

## 2. 隔离资产

| 资产 | 非秘密身份 | 隔离事实 |
| --- | --- | --- |
| GitHub 测试仓库 | `hehehehehehecai/explorer-staging-private-test-20260804`；repository ID `1322569219` | PRIVATE；默认分支 `main`；GitHub App installation 仅选择此仓库 |
| Vercel team | `team_IDGruFjuEZmy1dJRsg0RYkKf` | Hobby；未升级、未启用 Trial |
| Vercel project | `prj_vRfWcuvLYn240SSuKyNH0g4ShpW8` / `executor-command-center` | Inngest Integration 仅授权此 project |
| Supabase staging | `gsnuorsqdcdszjxtymhs` / `executor-command-center-staging` | ACTIVE_HEALTHY；与生产隔离；现有套餐内 |
| GitHub App | app ID `4480141` / `executor-staging-hehehehehecai` | installation ID `151329457`；仅目标私有仓库 |
| Inngest | workspace `hehehehehehecai`；environment `staging-7050a935` | Free pool；branch environment；无 Trial/付款 |

未读取、记录或提交 Webhook secret、GitHub App private key、Supabase secret/service-role value、Inngest key、Cookie 或 Authorization header。

## 3. Provider 配置证据

### 3.1 Vercel Preview

首轮 Preview：

- deployment：`dpl_EY5KiF7JNewGfpJKWvjZ149QCniu`
- URL：`executor-command-center-5jkfsjyuj-hehehehehehecais-projects.vercel.app`
- 结果：`ERROR`
- 首轮错误：构建 `/api/inngest` 时返回安全码 `inngest_runtime_configuration_missing`
- 处理：保留失败证据；完成项目级 Inngest Integration 与 Preview 环境配置后，对同一来源 deployment 做一次安全 redeploy。

复验 Preview：

- deployment：`dpl_HQxR75ghq7449NMLAYrQThWoWsN3`
- deployment URL：`executor-command-center-es8c3bk0l-hehehehehehecais-projects.vercel.app`
- branch alias：`executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`
- state：`READY`
- target：Preview；未执行 `--prod`、Promotion 或 Production deployment
- branch：`staging`
- 40 位 commit SHA：`fe5ad75cdd33f6b442605c4cfc1629207529899b`
- Vercel metadata 明确绑定 project、branch、repository 与 commit。
- `/api/inngest` 对未签名 GET 返回 `401`，响应含 `x-inngest-sdk-handled: true`；证明路由可达并 fail closed。

Inngest Vercel Integration configuration ID 为 `icfg_XJxCFpKRFr6zeJCEiUOMU5Qu`，UI 证明 `Specific Projects=true`、`All Projects=false`，唯一 project 为 `executor-command-center`。Integration 自动创建 Preview 与 Production 两组 provider-owned Inngest 环境变量；本批次没有运行 Production deployment、读取变量值或改变生产数据。该自动 provision 行为作为 provider 副作用保留报告。

### 3.2 Inngest branch environment

- environment：`staging-7050a935`
- app ID：`executor-command-center`
- method：Serve
- SDK：`4.15.0`
- framework：Next.js
- platform：Vercel
- deployment：`HQxR75ghq7449NMLAYrQThWoWsN3`
- commit ref/hash：`staging` / `fe5ad75cdd33f6b442605c4cfc1629207529899b`
- Last sync：Success
- functions：3

| Function | Trigger |
| --- | --- |
| `executor-daily-reconciliation` | `0 2 * * *` |
| `executor-github-webhook-consumer` | `executor/github.webhook.received.v1` |
| `executor-project-sync-consumer` | `executor/project.sync.requested.v1` |

### 3.3 GitHub App

- Homepage、Setup URL、Webhook URL 均指向稳定 Preview alias；Webhook active；SSL verification enabled。
- repository permissions：Actions、Checks、Contents、Issues、Pull requests 均 read-only；Metadata 为 GitHub 强制 read-only；无 write permission。
- subscribed events：push、issues、pull_request、release、workflow_run、repository。
- installation 最终 `Selected 1 repository`，repository ID `1322569219`。
- 原 installation 中另一 public anchor 已移除；未删除 installation、repository 或历史对象。

### 3.4 Supabase staging

- 15 个现有 migration 已在隔离 staging 项目按顺序存在。
- 只读数据库核验：目标 Project、selected repository 和 installation 映射存在。
- 未执行手工 INSERT/UPDATE/DELETE 制造同步结果；未连接生产数据库。

## 4. Staging 身份、Project 与 First Sync 阻塞

GitHub OAuth 在旧 Preview host `executor-command-center-git-fi-45aedc-hehehehehehecais-projects.vercel.app` 完成，页面事实：

- `authenticated=true`
- `github_app_installation=active`
- `selected_repository_count=1`
- selected repository：`hehehehehehecai/explorer-staging-private-test-20260804`

共享 staging 数据库中的既有 Project：

- project ID：`81630aa3-a101-421c-b31e-dc16d1592c31`
- selected repository row ID：`1cb60818-33d7-4991-8354-370c319027bd`
- repository ID：`1322569219`
- repository full name：`hehehehehehecai/explorer-staging-private-test-20260804`

稳定 `git-staging` alias 与旧 Preview 是不同 host，浏览器 session cookie 不共享；未读取、复制或转移 session cookie。

只读数据库查询得到：

| 事实 | 数量 |
| --- | ---: |
| `sync_runs` | 0 |
| repository snapshots | 0 |
| commits | 0 |
| issues | 0 |
| pull requests | 0 |
| releases | 0 |
| workflow runs | 0 |

源码生产引用审计得到：

- `StartFirstRepositorySync` 的实现位于 `src/application/synchronization/first-sync-use-cases.ts`。
- 对该类型的实例化仅存在于 `src/application/synchronization/first-sync-use-cases.test.ts`。
- `/api/inngest` 的 project sync consumer 只消费已经存在且身份完整的 `executor/project.sync.requested.v1` job；它不创建首个可信 SyncRun。
- 当前没有 Route、Server Action、安装完成 handler 或其他 production composition 调用 `StartFirstRepositorySync`。
- 数据库存在受控 First Sync RPC，但本批次禁止直接写库或手工调用 RPC 制造业务成功。

因此不存在可由真实 staging 用户操作触发的 First Sync 入口。用 Manual Resync 代替 First Sync、手工插入 SyncRun 或从 Inngest UI 构造缺少可信 run 的 job 都会破坏既有合同与本批次规则。

阻塞分类：**产品能力缺口 / BLOCKED**。发现后停止创建正式 GitHub Smoke 对象，保留全部 denominator，不通过局部 Webhook 成功掩盖 First Sync 缺失。

## 5. Target-specific 结果

| Target | 结果 | numerator / denominator | 直接证据 |
| --- | --- | ---: | --- |
| ready deployment | PASS | 1 / 1 | Vercel `dpl_HQxR75ghq7449NMLAYrQThWoWsN3` READY |
| version-bound deployment | PASS | 1 / 1 | metadata 40 位 SHA `fe5ad75…` |
| accepted normal events | BLOCKED | 0 / 5 | First Sync 无生产启动入口，未创建 Push/Issue/PR/Release/Workflow 对象 |
| complete lineage events | BLOCKED | 0 / 5 | 同上 |
| snapshot/state convergence | BLOCKED | 0 / 5 | 同上；快照与 SyncRun 均为 0 |
| duplicate replay | BLOCKED | 0 / 1 | 没有 eligible 正常 delivery 可重放 |
| controlled missed Issue | BLOCKED | 0 / 1 | 前置同步链路未成立，未关闭 Webhook |
| daily reconciliation detected difference | BLOCKED | 0 / 1 | 未制造漏投对象，不用 Manual Resync 冒充 |
| reconciliation-created SyncRun | BLOCKED | 0 / 1 | 同上 |
| snapshot repaired | BLOCKED | 0 / 1 | 同上 |
| final Freshness accurate and visible | BLOCKED | 0 / 1 | 无成功 SyncRun；Command Deck 当前真实表面仍不能形成本次 provider-to-UI lineage |
| over-24-hour indicator | NOT_APPLICABLE | 0 / 0 | 没有 eligible 的最新成功同步事实 |

## 6. 远程写入与未执行动作

已执行且在人工授权范围内：

- 向应用 origin 创建/fast-forward `staging` branch，SHA 精确为基线 `fe5ad75…`。
- 在既有套餐内配置 Vercel Preview、Supabase staging、staging GitHub App 和 Inngest branch environment。
- 在 Supabase staging 应用缺失的现有 migration。
- 将 GitHub App installation 收敛到唯一测试仓库；配置最小只读权限、事件订阅和 Webhook。
- 安装仅作用于 `executor-command-center` 的 Vercel/Inngest Integration。

未执行：

- 未向应用 origin `main/master` Push，未 Merge，未 Production Promotion。
- 未在测试仓库创建正式 Push、Issue、PR、Release、Workflow run 或漏投 Issue。
- 未写入测试仓库 `main` 的 workflow 例外路径。
- 未执行 Webhook Redeliver、关闭 Webhook、Manual Resync 或 Daily Reconciliation 测试触发。
- 未删除 release/tag/branch/installation 或其他远程资产。
- 未产生费用、Trial 或套餐升级。

## 7. 本地验证

| 命令/检查 | 结果 |
| --- | --- |
| Phase 5–8 + runtime 定向 Vitest | PASS；14 files / 152 tests / 0 skipped |
| `pnpm test` 首轮 | 环境/资源失败；外层 245.7 秒超时，module boundary 单项在资源抖动下显示失败 |
| module boundary 等价定向复验 | PASS；1 file / 36 tests |
| `pnpm test` 唯一安全复验 | PASS；94 files / 960 tests / 0 skipped |
| `pnpm run test:integration:app` 沙箱首轮 | 环境失败；Supabase telemetry 写权限不足，20 条件 skipped |
| 系统环境复验（Docker 未运行） | 环境失败；Local Supabase daemon 不可达，20 条件 skipped |
| 启动 Docker Desktop 与 Local Supabase 后复验 | PASS；18 files / 62 tests / 0 skipped |
| `pnpm run test:integration:db` | PASS；17 files / 529 tests |
| `pnpm run lint` | PASS；exit 0 |
| `pnpm run typecheck` | PASS；exit 0 |
| `pnpm run db:lint` | PASS；0 error |
| `pnpm run db:types:check` | PASS；generated types up to date |
| `pnpm run db:drift:check` | PASS；schema drift empty |

Local Supabase 启动命令曾由工具输出本地演示 key/secret；这些值未复制到本文档、Git、聊天报告或远程服务。

## 8. 首轮失败与安全复验

1. CDP 初始环境找不到 `node.exe`：改用 Codex bundled Node 绝对路径，成功。
2. Inngest environment UI 首次因标签页歧义超时：固定 `/env/production` 后只读进入 `staging-7050a935`，成功。
3. Vercel 首轮 Preview 缺 Inngest runtime configuration：保留失败 deployment；安装 project-scoped Integration 后仅 redeploy 一次，READY。
4. GitHub event 与 repository selector 各有一次 UI locator 失败：均在无状态变化或可核验部分状态后做唯一安全复验，最终最小权限成立。
5. 全量 Vitest 首轮资源超时：module-boundary 定向 36/36 后，相同全量配置唯一复验 960/960。
6. 应用集成沙箱 telemetry EPERM：系统环境复验暴露 Docker 未运行；启动已授权本机 Docker/Local Supabase 后唯一产品复验 62/62。
7. First Sync 缺口没有安全替代：手工数据库写入、Manual Resync 冒充或伪造 Inngest job 均被明确拒绝。

## 9. 结论与清理状态

结论：**Phase 9.2 总体 BLOCKED，不是 PASS。**

隔离 deployment、provider 配置与 runtime function registration 已成立；真实 Smoke 在 First Sync 前置步骤因缺少 production start composition 而停止。远程资产保留供独立审核；未做破坏性清理。进入下一任务：否，停止并等待审核。
