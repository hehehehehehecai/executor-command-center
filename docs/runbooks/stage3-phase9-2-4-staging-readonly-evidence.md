# 探索者号｜阶段 3 / Phase 9.2.4 staging First Sync 只读取证

## 批次、基线与范围

- 批次：`explorer-stage3-phase9-2-4-staging-readonly-evidence-3ed35cd0`
- prompt：`explorer-stage3-phase9-2-4-staging-cursor-forensics-3ed35cd0`
- 来源票据：`sha256:3ed35cd00bba54d4d1f117b22a62f9b7edda721cd8ddc8ec9e6f919cbb94547b`
- blocker：`sha256:5242b2664d228b6c2c6248ba996993917b6288edb3c5f396a3659ca9b6a37e97`（`2/5`）
- 基线 commit：`f67bf836b8d0dd2826db6fb26178992263b3a1cc`
- 基线 tree：`4a6a8218da1e32d0c057f0f7c22399b139da6108`
- 基线 parent：`984419866d809d8a9ef89451653847488b7d3f56`
- 初始工作树：干净
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-4-staging-readonly-freeze.json`

Freeze 文件系统创建时间为 `2026-08-11T03:39:31.6683316Z`，早于本批第一项远端读取。Freeze 内 `recordedAt` 被人工序列化为 `2026-08-11T08:34:00.000Z`，属于时间字段录入错误；为遵守不可回写规则未修改原 Freeze。本证据保留该差异，不以错误时间追认远端读取顺序。

本批只读取固定 Vercel deployment、Supabase project、固定 Inngest staging environment 和固定 SyncRun。没有调用写 RPC、checkpoint、First Sync、Manual Resync、Webhook、Reconciliation 或 Inngest function。

## 实际 SQL 合同

仓库实际函数签名与提示词中的 jsonb 简写不同，远端/本地比较以实际重载为准：

1. `app_private.first_sync_cursor_is_valid(text,uuid,uuid)`
2. `public.checkpoint_first_sync_run(uuid,uuid,text,bigint,timestamptz,text)`

规范化算法为：对 `pg_get_functiondef` 执行 `btrim(regexp_replace(..., E'\\s+', ' ', 'g'))`，编码 UTF-8 后计算 SHA-256。函数正文仅在数据库内参与计算，未写入证据文件。

## Vercel deployment

| 字段 | 只读结果 |
|---|---|
| Project | `prj_vRfWcuvLYn240SSuKyNH0g4ShpW8` / `executor-command-center` |
| Deployment | `dpl_EQMcmKFvUYZ5r4v9WfPHXzNEHPk2` |
| State | `READY` |
| Environment | branch-specific Preview；`target=null`，非 Production |
| Branch | `staging` |
| Commit | `4c94d970007820b9768cd41c46f0a93845500ef5` |
| Commit message | `feat(sync): add authenticated first sync entry` |
| Alias | `executor-command-center-git-staging-hehehehehehecais-projects.vercel.app` |
| Created | `2026-08-11T01:20:06.687Z` |
| READY | `2026-08-11T01:21:03.604Z` |

结论：alias 指向的 READY Preview 已包含 Phase 9.2.1 First Sync production entry；排除 deployment commit 漂移。

按安全错误码检索 Vercel runtime logs 时，聚合查询返回 `400 Bad Request`，安全等价查询返回 `ExceedsBillingLimitError`。没有升级、Trial 或付费操作；因此未取得逐行 runtime log，不能用“无日志”替代“日志 API 不可用”。

## Supabase project 与 migration ledger

- Project ref：`gsnuorsqdcdszjxtymhs`
- Name：`executor-command-center-staging`
- Region：`ap-northeast-2`
- Status：`ACTIVE_HEALTHY`
- PostgreSQL：`17.6.1.155`
- migration 数：15

| Version | Name |
|---|---|
| `20260718082522` | `create_baseline` |
| `20260722090000` | `create_internal_user_identity` |
| `20260722111000` | `fix_concurrent_user_identity_ensure` |
| `20260723120000` | `create_github_installation_registration` |
| `20260729090000` | `create_github_repository_selection` |
| `20260801091000` | `create_project_calibration` |
| `20260804173000` | `create_github_identity_read_rpc` |
| `20260805093000` | `create_github_installation_query_rpc` |
| `20260805132000` | `create_github_selection_installation_query_rpc` |
| `20260805181000` | `create_github_activity_snapshots` |
| `20260805190000` | `create_sync_runs` |
| `20260806100000` | `create_first_sync_support` |
| `20260806123000` | `create_github_webhook_delivery_inbox` |
| `20260806153000` | `create_repository_reconciliation` |
| `20260807122000` | `extend_github_webhook_delivery_processing` |

ledger 没有正文 checksum，因此这里只证明 migration version/name 存在；函数正文一致性由独立 `pg_get_functiondef` 指纹证明。

## 函数定义与 validator parity

| 函数 | 本地 SHA-256 | staging SHA-256 | 结果 |
|---|---|---|---|
| `first_sync_cursor_is_valid(text,uuid,uuid)` | `b6c7f8b4701175cfe5abc1fc884637644ab57612b61c765b35deb293f0e61ccd` | `b6c7f8b4701175cfe5abc1fc884637644ab57612b61c765b35deb293f0e61ccd` | 相等 |
| `checkpoint_first_sync_run(uuid,uuid,text,bigint,timestamptz,text)` | `ee37cd754ae346794b29bb4e7f77fc4e23f9b8f36ebe00e28e03e140a7325fd4` | `ee37cd754ae346794b29bb4e7f77fc4e23f9b8f36ebe00e28e03e140a7325fd4` | 相等 |

远端 validator 只读调用一次，输入为 Phase 9.2.3 的完全合成安全 cursor：

- result：`true`
- serialized UTF-8 bytes：873
- checkpoint 调用次数：0

结论：排除同版本 SQL 正文漂移，也排除 staging validator 对合法合成 cursor 与本地意见不一致。

## 失败 SyncRun 安全状态

| 字段 | 结果 |
|---|---|
| SyncRun | `06070d6a-23e2-44ba-8db2-90a4c644e8ea` |
| Project | `81630aa3-a101-421c-b31e-dc16d1592c31` |
| trigger | `first_sync` |
| status/version | `queued / 1` |
| queued/created/updated | `2026-08-11T01:30:16.518718Z` |
| started/finished/last_progress | 全部 null |
| timestamp order | 有效 |
| progress_cursor | null；未读取 raw cursor |
| error_code / error summary length | null / null |
| durable `project_sync_dispatches` 行数 | 0 |
| repository/commit/issue/PR/release/workflow snapshot | 全部 0 |

该状态证明业务 checkpoint 没有成功持久化，也没有部分 snapshot 事实。

## Inngest 安全元数据

固定 environment `staging-7050a935` 的应用 `executor-command-center` 注册了三类函数：

- `executor-daily-reconciliation`
- `executor-github-webhook-consumer`
- `executor-project-sync-consumer`

固定时间窗口内 Events 列表仅显示 1 个 `executor/project.sync.requested.v1` 事件，并关联 `executor-project-sync-consumer`。Runs 列表显示 1 个逻辑失败运行：

- queued/display time：`2026-08-11 09:30:17`（Dashboard 本地显示）
- ended/display time：`2026-08-11 09:40:45`
- status：`failed`
- 唯一 provider identifier 长度：26
- 字符类别：Crockford Base32 ULID
- SHA-256：`ce9359b179b092249d5cc3f7638bff6410775c6e9a7d3758e7e86176238d1dd0`
- 逻辑事件/运行计数：1

Events 与 Runs 导航引用得到同一脱敏摘要；重复 DOM 链接没有计为第二个逻辑事件。provider ID 字符与长度符合当前合同，排除 provider ID 字符合同漂移。

为避免读取 payload，未打开事件正文。一次尝试仅提取运行详情的安全错误码/顶层函数时被系统安全审批拒绝，随后采用更小权限的 Events/Runs 列表脱敏读取，不再尝试详情页。

## 精确根因：时间精度不兼容

只读远端时间比较得到：

| 项目 | 值 |
|---|---|
| PostgreSQL `queued_at` | `2026-08-11T01:30:16.518718Z` |
| JavaScript canonical milliseconds | `2026-08-11T01:30:16.518Z` |
| canonical checkpoint 是否早于 queued_at | `true` |
| 精度差 | 718 微秒 |
| `last_progress_at >= queued_at` 是否会通过 | `false` |

生产代码的数据流是：

1. `SupabaseFirstSyncStore` 原样回读带微秒的 `run.queuedAt`；
2. `StartFirstRepositorySync` 执行 `canonical(run.queuedAt)`，把它截断到 JavaScript 毫秒精度并作为 `window.windowEnd`；
3. 同一个 `window.windowEnd` 被传给 `checkpointedAt`；
4. `checkpoint_first_sync_run` 更新 `last_progress_at`；
5. `sync_runs_timestamp_order_check` 要求 `last_progress_at >= queued_at`；
6. 本次 checkpoint 时间比真实 `queued_at` 早 718 微秒，触发 `check_violation`；
7. checkpoint RPC 的 exception handler 将 `check_violation` 统一映射为 `first_sync_cursor_invalid`。

这同时解释了以下表面矛盾：cursor validator 本地和远端均返回 `true`，函数正文也一致，但真实 checkpoint 仍返回 `first_sync_cursor_invalid`。错误实际来自 timestamp constraint，而不是 cursor 内容。

## 差异裁决

### 已证明

- READY Preview 绑定 Phase 9.2.1 commit。
- 15 个 migration 完整存在。
- 两个远端函数定义指纹与本地相等。
- 合成 cursor 在远端 validator 返回 `true`。
- provider ID 长度/字符类别符合合同。
- 毫秒 canonical checkpoint 比微秒 `queued_at` 早 718 微秒。
- timestamp check 会拒绝该值，并被 RPC 映射为 `first_sync_cursor_invalid`。

### 已排除

- deployment commit 漂移；
- migration 未应用；
- 同版本函数正文漂移；
- 合成 cursor 的 TS/SQL parity 差异；
- provider ID 字符/长度合同差异；
- 失败 run 已持久化非空 raw cursor 或部分 snapshot。

### 仍未知但不影响根因裁决

- Vercel 逐行 runtime log 因现有账户日志 API 返回 `ExceedsBillingLimitError` 未取得；
- Inngest 详情页的内部 function-run ID 与顶层堆栈未读取，以避免 payload 暴露；
- 失败请求 raw cursor 从未持久化，且按授权不得读取，因此无法逐字段复原；现有时间证据已足以解释真实错误。

## 下一修复建议

下一本地修复单元应建立确定性 RED：数据库返回带微秒的 `queuedAt`，应用 canonical window 为毫秒精度，checkpoint 必须仍满足 timestamp order。

最小候选修复是保留 cursor/window 的毫秒 canonical 合同，但 `checkpointedAt` 使用数据库原样返回的 `run.queuedAt`，而不是截断后的 `window.windowEnd`。这可保证初始 checkpoint 与数据库 queued timestamp 相等，同时不改变 90 天窗口、cursor、provider ID、幂等或 group 顺序。修复必须通过 Local PostgreSQL checkpoint、重放不二次 dispatch、相邻回归与独立审核；本批未修改任何产品代码。

## 安全、失败与副作用

- 所有 Supabase SQL 均以 `BEGIN TRANSACTION READ ONLY` 开始并 `ROLLBACK`；写调用 0。
- Vercel、Supabase、Inngest 配置修改 0；远端业务触发 0。
- 没有读取或持久化 staging token、Cookie、Authorization、数据库密码、service-role key、event/signing key、raw cursor 或 raw payload。
- Local Supabase 启动命令意外输出了 CLI 内置本地演示凭据；这些不是 staging 凭据，未复制到 Freeze/evidence/报告，后续秘密扫描必须为 0。
- 浏览器首轮列表定位曾在工具输出中显示一个非秘密 provider identifier；没有写入证据或最终报告，后续读取改为浏览器内立即 SHA-256 脱敏。
- Vercel runtime logs：两次聚合只读请求返回 400；一次安全等价只读请求确认 `ExceedsBillingLimitError`，未升级或付费。
- 临时 CDP 脚本已按解析后的仓库内精确路径删除。
- 远端副作用：0。
