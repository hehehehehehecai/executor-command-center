# Phase 9.2.6 隔离 staging 同步管线 Smoke 证据

## 结论

- 记录时间：`2026-08-11T06:24:04.203Z`
- 批次：`explorer-stage3-phase9-2-6-staging-smoke-ec81368f`
- run_id：`stage3-phase9-smoke-20260811T054336Z-72a64a39`
- 总体裁决：`BLOCKED`
- 停止门：Gate 1 authenticated First Sync 最终业务状态为 `failed`。
- 安全停止：未创建 Push、Issue、PR、Release、Workflow、redelivery 或 missed Issue；未修改 GitHub App 配置；未触发 Reconciliation。

本证据只保留非秘密 ID、安全错误码、计数、摘要和测试结果。未保存 Cookie、Authorization、token、private key、service-role key、Inngest key、Webhook secret、raw cursor、raw payload 或完整私有日志。

## 基线与不可回写 Freeze

| 项目 | 证据 |
| --- | --- |
| branch | `feature/stage3-phase8-data-freshness-ui` |
| commit | `9e07c7bf288f6d0aaa3818a0cc2a9e81a557b220` |
| tree | `7c887d1c86f10019df447cb44718b37eca147048` |
| parent | `d737fdfe21e733fc5bad59d21d551b138a63c6c6` |
| initial worktree | clean |
| Freeze | `tests/fixtures/synchronization/stage3-phase9-2-6-staging-smoke-freeze.json` |
| Freeze SHA-256 | `7d1c251a49d1f8a00e015616278861908d62858bad905cf38351c63de19dc5cf` |
| Freeze created at | `2026-08-11T05:47:00.997Z` |

Freeze 创建后未回写。run_id 在本地仓库、Issue/PR、branch、tag 与精确 Release 查询中的碰撞数均为 0；测试仓库授权 workflow 文件在运行前不存在。

## Provider 隔离与部署

### GitHub

- 登录账号：`hehehehehehecai`。
- 固定私有仓库：`hehehehehehecai/explorer-staging-private-test-20260804`，repository ID `1322569219`，default branch `main`。
- GitHub App：ID `4480141`，slug `executor-staging-hehehehehecai`。
- installation：`151329457`，安装页只选中固定测试仓库。
- 安装权限只读覆盖 actions、checks、code、issues、metadata、pull requests。
- 订阅事件复核：issues、pull_request、push、release、repository、workflow_run 均启用；Webhook active，SSL verification enabled。
- 恢复的人工动作已验证：GitHub App 设置页不再显示 `Confirm access`，所有者仍为 `hehehehehehecai`。

### Vercel

- project：`prj_vRfWcuvLYn240SSuKyNH0g4ShpW8` / `executor-command-center`。
- plan：Hobby；environment：Preview；branch：`staging`；Production：否。
- deployment ID：`dpl_2QGS3njCm972nwYdM3cfuEn6yitr`。
- deployment URL：`https://executor-command-center-l2jmmryvs-hehehehehehecais-projects.vercel.app`。
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`。
- status：READY；commit：`9e07c7bf288f6d0aaa3818a0cc2a9e81a557b220`。
- stable alias 与 deployment overview 同时列在该 Preview deployment 的 Domains 中。

### Supabase

- project ref：`gsnuorsqdcdszjxtymhs`，name `executor-command-center-staging`，plan Free，status ACTIVE_HEALTHY。
- local/remote migration ledger：15/15 对齐。
- `first_sync_cursor_is_valid` 指纹：`b6c7f8b4701175cfe5abc1fc884637644ab57612b61c765b35deb293f0e61ccd`。
- `checkpoint_first_sync_run` 指纹：`ee37cd754ae346794b29bb4e7f77fc4e23f9b8f36ebe00e28e03e140a7325fd4`。
- 远程 SQL 取证均显式使用 `BEGIN TRANSACTION READ ONLY`；人工数据库写入 0。

### Inngest

- environment：`staging-7050a935`，plan Free。
- app：`executor-command-center`，SDK `4.15.0`。
- 部署后自动同步 URL：`https://executor-command-center-l2jmmryvs-hehehehehehecais-projects.vercel.app/api/inngest`。
- functions：3：
  - `executor-project-sync-consumer` → `executor/project.sync.requested.v1`
  - `executor-github-webhook-consumer` → `executor/github.webhook.received.v1`
  - `executor-daily-reconciliation` → `0 2 * * *`

## 部署写入

- 执行一次 fast-forward：`origin/staging` 从 `4c94d970007820b9768cd41c46f0a93845500ef5` 推进到 `9e07c7bf288f6d0aaa3818a0cc2a9e81a557b220`。
- 未 force push；未 Push main/master；未 Push 后续本地证据提交。
- 自动创建 1 个 Vercel Preview deployment；未 Promote Production。

## Gate 1：Authenticated First Sync

### 前置基线

- Project：`81630aa3-a101-421c-b31e-dc16d1592c31`。
- 运行前已存在旧 queued SyncRun `06070d6a-23e2-44ba-8db2-90a4c644e8ea`；六组 snapshot 计数均为 0。
- 本批 request identity：`stage3-phase9-smoke-20260811T054336Z-72a64a39-first-sync`。

### HTTP 与 lineage

- 通过 stable alias 上已认证 Supabase session 发出唯一一次 `POST /api/projects/{projectId}/first-sync`。
- HTTP：`202`；结果 `first_sync_accepted`。
- `cache-control`: `private, no-store, max-age=0`；`vary`: `Cookie, Origin`。
- SyncRun / job ID：`f96655e1-3b5e-4716-af2a-61ae3c01d08b`。
- Inngest event ID：`01KZQP1D5VKV3XEJQ770W3YC17`。
- Inngest run ID：`01KZQP1DK7HNKHCDZWY8S2BH41`。
- Inngest function：`executor-project-sync-consumer`；trigger：`executor/project.sync.requested.v1`。
- Inngest provider run 显示 Completed，持续 4.844 秒；这只证明 consumer 调用完成，不覆盖数据库业务终态。
- Vercel 安全请求证据：First Sync route `POST 202`；随后 deployment-specific `/api/inngest` `POST 206`。

### 数据库业务终态

| 字段 | 结果 |
| --- | --- |
| SyncRun count for this ID | 1 |
| trigger_source | `first_sync` |
| status | `failed` |
| version | 6 |
| queued_at | `2026-08-11T05:51:59.856232+00:00` |
| started_at | `2026-08-11T05:52:02.889+00:00` |
| last_progress_at | `2026-08-11T05:52:02.889+00:00` |
| finished_at | `2026-08-11T05:52:02.889+00:00` |
| `last_progress_at >= queued_at` | true |
| progress cursor | non-null，943 字符 |
| completed groups | `[repository]` |
| failed group | `commit` |
| safe error code | `github_activity_authorization_revoked` |
| retryable | false |
| provider ID | 长度 26；安全字符合同 true；SHA-256 `616bb71131a5e398b502a1ffd6aa7704b12858fb47b206b27861426639d9d909` |

cursor top-level key 精确集合为：`completedGroups`、`failedGroup`、`installationId`、`job`、`projectId`、`readerContractVersion`、`repositoryFullName`、`requestId`、`snapshotContractVersion`、`syncRunId`、`syncStateContractVersion`、`version`、`windowEnd`、`windowStart`。未读取或保存 raw cursor。

### snapshot 结果

| snapshot group | count |
| --- | ---: |
| repository | 1 |
| commit | 0 |
| issue | 0 |
| pull_request | 0 |
| release | 0 |
| workflow_run | 0 |

Phase 9.2.5 的 718 微秒缺陷已排除：本批 run 成功持久化 cursor，且时间顺序断言为 true。新的阻塞是 commit group 的安全授权失败码。

### installation 对齐

- Project、selected repository、repository ID `1322569219`、installation row 与 provider installation `151329457` 三方一致。
- 数据库 installation status 为 `active`，`suspended_at=null`，`revoked_at=null`。
- GitHub 安装页可见：唯一固定仓库；read access to actions/checks/code/issues/metadata/pull requests。
- 测试仓库未 archived/disabled；default branch `main` 存在，HEAD `4107e7210f5ae10920e5341d18d0cdd4565fb983`，根目录含 `README.md`。

这些证据排除了部署 SHA 漂移、migration 漂移、时间精度回归、数据库 installation 已撤销和仓库不存在；尚未证明应用获取到的 installation token 在 commit API 上为何被映射为 authorization revoked。最小下一取证点是：在不输出 token/payload 的前提下，记录 GitHub App installation-token 请求及 commits API 的安全 HTTP status/`x-github-request-id`/权限响应头摘要，并核对运行时所用 App ID 与 installation ID。

## 硬停止与未执行分母

Gate 1 失败后严格停止：

| target | numerator / denominator | 结果 |
| --- | --- | --- |
| deployment version binding | 1 / 1 | PASS |
| authenticated First Sync terminal success | 0 / 1 | FAIL |
| six snapshot groups complete | 1 / 6 | FAIL |
| normal GitHub events | 0 / 5 | BLOCKED by Gate 1 |
| complete lineage events | 0 / 5 | BLOCKED by Gate 1 |
| duplicate replay | 0 / 1 | BLOCKED by Gate 1 |
| controlled missed Issue | 0 / 1 | BLOCKED by Gate 1 |
| reconciliation repair | 0 / 1 | BLOCKED by Gate 1 |
| final Freshness convergence | 0 / 1 | BLOCKED by Gate 1 |

未创建 workflow 文件；未修改 GitHub App event 订阅；未触发 Manual Resync 或 Daily Reconciliation。

## 本地验证

### 定向与全量

- 定向命令首轮：`pnpm exec vitest ...` 因 Windows PATH 未解析 `vitest`，Exit 1，测试数 0；无文件副作用。
- 等价定向复验：27 文件、220 项全部通过，required skipped 0。
- `pnpm test`：99 文件、993 项全部通过，Exit 0，required skipped 0。

### 应用与数据库集成

- 应用集成首轮：Local Supabase 未启动及 CLI telemetry 写权限导致 7 suite 环境失败；11 文件、41 项已通过，20 项因 beforeAll 环境失败被 skip。
- 启动 Local Supabase 后复验：17 文件、56 项通过；唯一 auth suite 的内部 status 子进程受环境竞态失败，6 项被 skip。
- 对唯一 auth 文件做最小复验：1 文件、6 项全部通过。
- 合并证据覆盖应用集成全部 18 文件、62 项；新增 required skipped 0。首轮环境失败未被覆盖或删除。
- 数据库集成：17 个 pgTAP 文件、529 项全部通过。
- Local Supabase 由本批启动并在结束前停止。启动工具曾输出本地演示值；未复制、未持久化、未写入本证据。

### 静态与 E2E

- `pnpm run lint`：Exit 0。
- `pnpm run typecheck`：Exit 0。
- `pnpm run db:lint`：Exit 0，0 error。
- `pnpm run db:types:check`：Exit 0，生成类型无漂移。
- `pnpm run db:drift:check`：Exit 0，schema drift empty。
- `pnpm run test:e2e`：2/2 通过。
- E2E 自动把 `next-env.d.ts` 改为 dev routes import；直接 diff 证明后已精确恢复，最终 SHA-256 回到基线。

## 非预期失败记录

1. Supabase 首次只读轮询引用不存在的 `provider_receipt_id`：HTTP 400/SQL parse error；改用生成类型中的 `provider_job_id` 后 READ ONLY 查询通过；数据库副作用 0。
2. Release 全量列表请求被系统安全审查拒绝：未绕过；改用精确 `gh release view <run_id>`，结果 `release not found`。
3. 定向测试首次 PATH 无法解析 `vitest`：改用仓库本地 binary，27/220 通过。
4. 应用集成首次 Local Supabase 不可用；启动本地环境后安全复验并单独闭合唯一环境竞态文件。
5. 并行 typecheck 首轮无法写 `tsconfig.tsbuildinfo`：申请精确本地写权限后 Exit 0。
6. Git 终态复核首个 PowerShell 表达式语法错误：解析前退出，修正只读数组表达式后通过。

## 受保护范围与敏感边界

- `package.json` SHA-256：`f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468`，未变。
- `pnpm-lock.yaml` SHA-256：`a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef`，未变。
- `next-env.d.ts` 最终应为基线 SHA-256：`4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。
- First Sync 历史 migration SHA-256：`c309bffc9d7ffe613622fcff07df1c2d817d86c733c96fd5efba1ca0de47a64d`，未变。
- Phase 9.2.5 Freeze/evidence 指纹未变。
- 产品源码、测试、migration、UI、package/lock 最终修改数：0。
- 证据内强特征 secret/token/private key/Cookie/Authorization/raw payload 值：0。

## 远端副作用清单

| provider | 动作 | 数量 | 固定对象/结果 |
| --- | --- | ---: | --- |
| Git origin | fast-forward `staging` | 1 | `4c94d97… → 9e07c7b…` |
| Vercel | 自动 Preview deployment | 1 | `dpl_2QGS3njCm972nwYdM3cfuEn6yitr`, READY |
| Inngest | 自动 app sync | 1 | deployment-specific `/api/inngest`, 3 functions |
| staging app | authenticated First Sync POST | 1 | HTTP 202, stable request identity |
| Supabase product state | new SyncRun | 1 | `f96655e1-3b5e-4716-af2a-61ae3c01d08b`, failed |
| Supabase product state | repository snapshot | 1 | fixed Project, repository group only |
| Inngest | event/run | 1 / 1 | event `01KZQP1D5VKV3XEJQ770W3YC17`, run `01KZQP1DK7HNKHCDZWY8S2BH41` |
| GitHub test repo | Smoke objects | 0 | Gate 1 hard stop |
| GitHub App | configuration changes | 0 | events/webhook unchanged |
| Supabase | manual DB writes/migrations | 0 | all forensic queries READ ONLY |
| Production/other repos | writes | 0 | prohibited boundary held |

## 清理状态

- 未删除或改写远端对象。
- application `staging` 保留在审核 commit，Preview deployment 与失败 SyncRun 留作审核。
- Local Supabase 已停止；本地 Docker volume 按 CLI 默认保留。
- 不建议在本批清理失败 SyncRun；下一步应先完成 installation-token/commits API 的安全状态取证并进入独立修复审核。

## Exit Criteria

| Exit Criteria | 结果 | 证据 |
| --- | --- | --- |
| 部署 commit 精确 | PASS | READY Preview + 40 位 SHA |
| First Sync 与 replay | FAIL | 首次 run failed；按硬门禁未 replay |
| 六组 snapshot | FAIL | 1/6 |
| 正常事件 5/5 | BLOCKED | Gate 1 后停止，0/5 |
| Webhook 幂等 | BLOCKED | 无 eligible delivery |
| 漏投 1/1 且恢复指纹一致 | BLOCKED | 未进入 Gate 3，配置未改 |
| Reconciliation 只补漏 | BLOCKED | 未进入 Gate 4 |
| Freshness 闭合 | BLOCKED | 上游 First Sync 未完成 |
| 秘密 0 | PASS | 仅脱敏 ID/摘要；本地演示值未持久化 |
| 远端对象/副作用完整登记 | PASS | 见清单 |
| 产品与历史资产零修改 | PASS | 指纹/路径审计 |
| 本地门禁 | PASS（含已记录环境复验） | 27/220、99/993、18/62、17/529、E2E 2/2、静态全绿 |

总体不得报告阶段 3 完成。结果为 `BLOCKED`，停止等待审核。
