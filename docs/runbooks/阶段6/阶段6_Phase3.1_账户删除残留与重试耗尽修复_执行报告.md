# 探索者号｜阶段 6｜Phase 3.1 账户删除残留与重试耗尽修复执行报告

## 1. 编排标识与授权回读

- 批次 ID：`explorer-stage6-phase3.1-1a2779803ff857cd`
- 提示词实例 ID：`explorer-stage6-phase3.1-1523061a1a2675d5`
- 审核票据 ID：`review-ticket-1523061a1a2675d5`
- 原始审核等级：`B`
- baseline commit：`362bff7c4f788fd507bdc4b1da39246a2152d841`
- 授权策略：`workflow-authorization.v1`
- 仓库：`D:\AI workplace\探索者号`
- 结论：授权信封与仓库、阶段、批次一致；仅执行本地可逆修改、合成测试、构建和一个本地 commit。

## 2. Baseline 与 Pre-Run Freeze

### 2.1 Git 身份

- baseline HEAD：`362bff7c4f788fd507bdc4b1da39246a2152d841`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:\AI workplace\探索者号\.git`
- linked worktree：否；`git worktree list` 仅含当前工作树。
- baseline `git status --porcelain=v1 -uall | Out-String` UTF-8 SHA-256：`fc32b06243f86bade62f48767f2439ba21f083b22e0a044ae70b0d65350fc6ef`
- baseline status 字符数：`365421`；行数：`2028`；全部为阶段前 `.pnpm-store/` 未跟踪缓存噪声。
- `.pnpm-store/`：未删除、未整理、未暂存、未提交；批次结束前 mtime 审计未发现 `2026-08-25 15:00` 后新增或修改的文件/目录。Git 因其中既有循环路径和 Windows 长路径产生遍历警告，报告按明确路径白名单提交。

### 2.2 初始文件哈希与修正记录

| 文件 | 初始 SHA-256 | 说明 |
|---|---|---|
| CLI 初建 migration `20260825073110_fix_account_deletion_residual_and_recovery.sql` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 空文件；CLI UTC 时间早于既有 Phase 3 `20260825120000`，不能承载依赖 Phase 3 表的 SQL |
| 最终 migration 初始注释版 `20260825130000_fix_account_deletion_residual_and_recovery.sql` | `2ebb7bddbedeb66f19d2ecee22842e69fd4865df909985dc2de60f3de8a8f207` | 在写实现前校正 forward-only 顺序；未修改旧 migration |
| `0038_account_deletion_webhook_residual_test.sql` | `597aa72c2c829705d70fb9978f25ff407beeafa218a5f168620a33941d80f932` | 初始红灯夹具；后续仅修正 Webhook 状态约束并固定 operation ID |
| `0039_account_deletion_webhook_concurrency_test.sql` | `11e45bac810a19d75f572130ae78eae5e0019e7e4bf54f7115419dddbf971ebb` | 初始夹具；后续修正 UUID 格式、补 Installation 特殊分支并固定 operation ID |
| `0040_account_deletion_retry_recovery_test.sql` | `c374647153e9bff36befb560d26dd3e640cdd694b2c6d0bb2c23951d16a4cc21` | 初始恢复夹具；后续补可重复运行收尾并固定 operation ID |

最终关键文件 SHA-256：

- migration：`1ee209ac94ff12289ea5865e4b8f48f4938e816766ad5866066c311280726509`
- 0038：`a142f28f701e27faa6fd9bb0e52388668f5dd14bc3bfa606a6a3776184583737`
- 0039：`58a610f0f2a75231d55f154ca29068a1e6f6ef3ee83244335dcc513fdf96bfcb`
- 0040：`bb2d149e82dad5aad546de8e04441d01334edbc2304d36c17edf4e46c0c4975b`

### 2.3 固定合成 lineage

| Case | user | installation/project | delivery | operation | generation / key |
|---|---|---|---|---|---|
| Webhook 残留 | `c100...0001` | `c110...0001` / `c130...0001` | `c141...0001` ordinary；`c141...0002` installation | `c180...0001` | `phase31:residual:request` |
| Webhook-first | `c200...0001` | `932001` / `c230...0001` | `c241...0001` | `c280...0001` | `phase31:webhook-first` |
| Request-first | `c200...0002` | `932002` / `c230...0002` | `c241...0002` | `c280...0002` | `phase31:request-first` |
| 恢复 | `c300...0001` | N/A（账户级恢复夹具不创建项目） | N/A | `c380...0001` | 初始 `0`，恢复 `1`；`phase31:recovery:request` |
| 控制组 | `c100...0002`、`c200...0003`、`c300...0002` | 明确独立 Installation/Project | `c141...0003`、`c141...0004`、`c241...0003` | 无删除 operation | 不适用 |

## 3. 开始前只读审计

### 3.1 Webhook FK、归属与清理矩阵

`github_webhook_deliveries.project_id` 是 `ON DELETE SET NULL`；行还保存 `body_sha256`、`installation_id`、`repository_id`、`repository_full_name`、event/action、internal event ID 和低基数处理状态。Phase 3 的 `cleanup_account_business_data` 删除 `public.users` 前没有删除 Webhook 行，导致项目级 FK 置空后仍保留仓库可关联元数据。

| Webhook 分类 | 删除前稳定归属 | Phase 3.1 处置 | 理由 |
|---|---|---|---|
| 普通事件，`project_id` 属于目标账户 | `projects.user_id` | DELETE | 项目删除前可证明目标归属 |
| 普通/Installation 事件，numeric `installation_id` 属于目标账户 | `github_installations.user_id` | DELETE | Installation 删除前可证明目标归属，覆盖 `project_id IS NULL` |
| 其他用户事件 | 独立 Installation/Project | PRESERVE | 禁止跨账户误删 |
| 无法映射到任何 Installation/Project 的事件 | 无可证明归属 | PRESERVE | 禁止根据仓库名或自然语言猜测归属 |

归属在删除目标 Project/Installation 前冻结；清理不等待 `SET NULL` 后再猜测。没有把原始 repository 标识转存到 tombstone。

### 3.2 锁顺序与并发窗口

- 原申请顺序：目标 `github_installations FOR UPDATE`（按内部 `id` 排序）→ `account_deletion_operations FOR UPDATE` → work rows。
- Phase 3 原 Webhook guard：ordinary 仅按 numeric installation 查询 user，再锁 account lifecycle；Installation 事件直接绕过账户门。
- Phase 3.1：Webhook insert/update 先按内部 Installation 行 `FOR UPDATE`，再调用 account lifecycle `FOR UPDATE`，最后写 delivery。
- 统一顺序：`Installation → account lifecycle → Webhook/work`。
- webhook-first：Webhook 先提交，申请随后看见并终止/清理它。
- request-first：Webhook 等待申请；申请提交后 Webhook 重新观察 `deletion_pending`，以 `account_deletion_pending` 失败关闭，不落行。
- 未使用全表锁、全局 advisory lock、sleep 猜赢家或跨 Installation 串行化。

### 3.3 有限重试耗尽现状

- 原 Inngest event：`executor/account.deletion.due.v1`。
- 原 function：`executor-account-deletion`，`retries: 8`。
- 原 event ID 和 function idempotency 都只绑定 operation；申请只派发一次。
- worker partial failure 会持久化 `deletion_failed` 并抛出 retryable error；第 8 次后没有 `onFailure` 持久标记、扫描、重派或新幂等 generation，因此会永久停住。
- 原 UI 文案“后台将从安全断点重试”没有区分有限 worker retries 和耗尽后的恢复调度。

### 3.4 Tombstone 字段边界

允许新增的 9 个低基数字段：generation、eligible time、dispatch token/lease、dispatched time、dispatch attempts、last stable error code、exhausted time/count。禁止并未保存：email、登录名、repository 名/ID、Webhook body/digest、token、provider 原始响应、业务内容。

## 4. 红灯证据

1. TS 初始聚焦：`24` 项中 `5` 项按预期失败；缺少 `RecoverExhaustedAccountDeletions`、job generation、failure handler 和 recovery cron，其余 `19` 项通过。
2. 0038 基线：`6` 项中 `2` 项失败；目标 ordinary/installation delivery 实际残留 `2`，期望 `0`；repository/body digest 残留 `2`。
3. 0039 补足 Installation 特殊分支后的基线：`8` 项中 `3` 项失败；request-first 无 Installation 锁等待、无 `account_deletion_pending` 重检，并残留 `1` 行。
4. 0040 基线：`mark_account_deletion_retry_exhausted(uuid, integer)` 不存在，测试以 SQL function missing 失败。
5. 夹具修正均保留原因：普通 `completed` delivery 未提供 required sync/provider 字段，改用合法 `ignored`；PowerShell 风格 UUID format 改为 `lpad`；0039 最初仅测 ordinary 分支会偶然通过，补入 Installation 特殊分支后取得准确红灯；所有稳定 user/installation/project/delivery 身份未复用 0036/0037。

## 5. 实现与修改文件

### 5.1 Migration / 数据层

- `supabase/migrations/20260825130000_fix_account_deletion_residual_and_recovery.sql`
  - 追加 9 个最小 recovery 字段、约束和局部索引。
  - `create or replace` Webhook account guard，Installation 事件不再绕过，并取得同一内部 Installation 行锁。
  - `create or replace cleanup_account_business_data`，在 Project/Installation 删除前按两条稳定归属删除目标 Webhook。
  - 新增 `mark_account_deletion_retry_exhausted`、`claim_account_deletion_recoveries`、`complete_account_deletion_recovery_dispatch`。
  - scanner 使用数据库 `clock_timestamp()`、`FOR UPDATE SKIP LOCKED`、最多 `50` 项和 30 秒至 5 分钟租约；应用固定批量 `25`。
  - 成功删除时清空 active recovery lease；失败派发只回到五分钟后 eligible，不伪造 `deleted`。
  - SECURITY DEFINER 函数均固定空 `search_path`、schema-qualified 对象、revoke PUBLIC/anon/authenticated，仅授予 service role。

### 5.2 Application / adapter / job / UI

- account deletion job 加入非负 `generation`，严格绑定 `jobId = operationId:generation`。
- 初始 job 是 generation `0`；耗尽回调原子推进到下一 generation。
- Inngest function 的 idempotency 从 operation 改为 jobId，concurrency 仍绑定 operation；同 generation 去重、下一 generation 可执行。
- `onFailure` 仅在 8 次执行重试耗尽后写数据库 marker；每 15 分钟的有界 recovery cron 扫描并派发。
- 派发失败记录稳定码 `account_deletion_recovery_dispatch_failed`，下次扫描可重试；派发成功与删除成功是不同状态。
- Supabase adapter 只调用三个固定 RPC，不接受表名、SQL 或任意 filter。
- UI `deletion_failed` 文案明确有限执行重试结束后由持久恢复任务继续重派，账户仍冻结。
- 生成并提交最新 `database.types.ts`。

### 5.3 测试文件

- `0038_account_deletion_webhook_residual_test.sql`
- `0039_account_deletion_webhook_concurrency_test.sql`
- `0040_account_deletion_retry_recovery_test.sql`
- `src/infrastructure/account-deletion/inngest-account-deletion-dispatcher.test.ts`
- 更新 application、runtime、route composition、repository、UI 测试。
- 0039/0040 在 `finish()` 后只删除各自明确 synthetic ID，使聚焦与全量套件可重复运行。

## 6. 最终合同

```text
deleting|deletion_failed + finite worker retries exhausted(g)
  -> durable marker generation g+1 + database eligible_at

bounded scanner + eligible row
  -> one SKIP LOCKED dispatch lease winner
  -> event jobId = operationId:generation

dispatch failed
  -> retry_scheduled after DB backoff; never deleted

dispatch succeeded
  -> worker reclaims deletion operation
  -> business already_absent is No-op
  -> Auth deleted|already_absent converges to deleted

deleted + old worker/onFailure/scanner replay
  -> completed / No-op
```

原五态和七天窗口未改变：`active → deletion_pending → deleting → deleted | deletion_failed`。Phase 3 的取消、claim lease、business/Auth 非原子边界、RLS、防枚举与 Auth Admin 边界保持不变。

## 7. Lineage 与 Target-Specific Metrics

### 7.1 Webhook

| 指标 | 分母 | 结果 |
|---|---:|---:|
| 目标 ordinary Webhook 应清理 / 实际清理 / 残留 | 1 | 1 / 1 / 0 |
| 目标 installation Webhook 应清理 / 实际清理 / 残留 | 1 | 1 / 1 / 0 |
| repository full name / repository ID / body digest 等目标残留 | 2 行 | 0 |
| 其他用户 Webhook 变化 | 1 | 0 |
| 无归属 Webhook 变化 | 1 | 0 |
| request-first / webhook-first 竞争 | 2 | 2 个安全串行结果 |
| 死锁 / lock timeout / statement timeout / 未知错误 | 2 | 0 / 0 / 0 / 0 |

### 7.2 Retry-exhausted recovery

| 指标 | 冻结分母 | 结果 |
|---|---:|---:|
| worker partial failure | 1 | 1 个 `deletion_failed` |
| Inngest 有限执行重试配置 | 8 | 保持 8；未改为无限 |
| exhaustion marker | 1 | 1；同 generation 重放 1 次、额外 generation 0 |
| concurrent scanner | 2 connections / 1 eligible row | winner 1、second winner 0 |
| recovery 扫描 claim | 2 个时点 | 2（首次及派发失败后的再次扫描） |
| dispatch failure / 后续成功 | 1 / 1 | 1 / 1 |
| business cleanup 重放 | 1 | `already_absent` 1；重复删除副作用 0 |
| Auth integration deleted / already absent replay | 1 / 1 | 1 / 1 |
| 最终 `deleted` | 1 | 1 |
| deleted 后 failure/scanner 重放 | 2 | No-op 2 |
| tombstone 新调度字段 / 敏感字段 | 9 / 0 | 9 / 0 |
| 控制账户变化 | 1 | 0 |
| 非授权 GitHub/provider 调用 | 0 个外部调用夹具 | N/A；测试未连接真实外部服务 |

## 8. 测试与质量门

### 8.1 最终通过

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm typecheck` | 0 | 通过 |
| `pnpm lint` | 0 | 通过 |
| `pnpm test` | 0 | 177 files / 1693 tests |
| `pnpm test:integration` | 0 | app 21 files / 67 tests；DB 40 files / 934 tests |
| `pnpm test:e2e:auth-fixture` | 0 | Chromium 1/1 |
| `pnpm test:e2e:connected-panels` | 0 | Chromium 8/8 |
| `pnpm db:reset` | 0 | 所有 migration（含新 migration）重放成功；仅本地数据库 |
| `pnpm db:test`（Supabase CLI telemetry disabled） | 0 | 40 files / 934 tests |
| `pnpm db:lint` | 0 | `results: []` |
| `pnpm db:types` | 0 | 生成 `database.types.ts` |
| `pnpm db:types:check` | 0 | up to date |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm build` | 0 | Next.js production build 成功 |
| 0036–0040 独立聚焦 | 0 | 5 files / 76 tests |
| account deletion integration 独立聚焦 | 0 | 2/2 |
| Auth adapter/application/dispatcher 聚焦 | 0 | 12/12 |
| Phase 3.1 TS/UI 聚焦 | 0 | 34/34 |

### 8.2 失败记录与闭环

| 命令/阶段 | 原退出码 | 原因 | 闭环 |
|---|---:|---|---|
| `pnpm exec vitest ...` 首次 | 非 0 | 桌面运行时未在默认 PATH 暴露 node/vitest shim | 使用已安装绝对 Node + 同一 Vitest；未安装依赖 |
| TS 红灯 | 1 | 5 个预期缺失能力 | 实现后 34/34 |
| 0038 红灯 | 1 | 2 个目标 delivery 残留 | 实现后通过 |
| 0039 红灯 | 1 | Installation 特殊事件绕过账户锁/门 | 实现后双连接通过 |
| 0040 红灯 | 1 | durable recovery RPC 不存在 | 实现后通过 |
| `test:integration` 首次 | 1 | generated DB types 漂移 | `pnpm db:types` 后通过 |
| `test:integration` 第二次 | 1 | 先前聚焦 dblink 夹具留在同一 DB，污染全表计数 | 新测试增加精确 synthetic cleanup；干净 reset 后通过 |
| 独立 Auth integration 首次 | 1 | sandbox 内 child CLI 无法读取本地 Supabase 状态 | 按 B 类审批在本地边界复跑 2/2 |
| `pnpm db:test` 首次 | 1 | pgTAP 934/934 已通过，但 CLI 关闭 PostHog 超时 | 官方 `supabase telemetry disable` 后退出码 0 |
| `pnpm db:lint` 首次 | 1 | lint `results: []`，但同一 PostHog 关闭超时 | 关闭 CLI telemetry 后退出码 0 |

未运行项：无。没有把任何“未运行”写成通过。

## 9. Git、文件范围与提交

- 既有 migration 修改数：`0`。
- 新 forward-only migration：`supabase/migrations/20260825130000_fix_account_deletion_residual_and_recovery.sql`。
- 本批修改集中于 account deletion application/domain/adapter/Inngest runtime/UI、生成 DB types、三份 pgTAP 和本报告。
- 实现落盘、报告写入前的全状态快照 SHA-256：`2ed564712222f1a31582937ed4128f3091ecb573ff03a4ccaca5679f605111b1`，字符数 `369513`，行数 `2062`；其中任务文件外均为 `.pnpm-store/` 阶段前噪声及其长路径枚举结果。提交后的最终状态与 hash 由最终执行回执给出。
- commit：本报告与全部实现将进入同一个最终 commit；commit hash 无法自引用写入自身内容，实际 hash 由最终执行回执给出，并等于提交后的 HEAD。
- 提交消息：`fix: close account deletion recovery gaps`。
- 提交后未纳入项：仅 `.pnpm-store/` 阶段前未跟踪噪声。

## 10. 系统审批与禁止动作声明

- 系统审批仅用于本地 Supabase/Docker、浏览器 E2E、本地 Auth fixture、CLI 用户级 telemetry 设置和本地质量门。
- Supabase CLI telemetry 已通过官方 `telemetry disable` 关闭，以避免受限网络造成 PostHog shutdown timeout；这是用户级工具设置，不是仓库或业务数据变更。
- 未安装或升级依赖；CLI 仅提示可升级到 `2.115.0`，未执行升级。
- 未使用真实用户、真实 Auth Identity、真实 GitHub repository、真实 Webhook body、真实 AI 或 Production 数据。
- 未 push、merge、创建 PR、部署、发布、访问 Production、调用外部 GitHub/AI provider、撤销 GitHub App、amend、reset、clean 或改写历史。
- 未删除、修改、整理、暂存或提交 `.pnpm-store/`。
- 未进入 Phase 4，也未执行 Phase 4–10 工作。

## 11. 结论

两个审核 blocker 均已闭环：所有可证明属于目标账户的普通/Installation Webhook 元数据在业务清理后为零；删除申请与 Webhook 写入形成事务级串行顺序；有限 Inngest retries 耗尽后有数据库持久、幂等、有界、可再次扫描/派发/claim 的恢复路径；business/Auth partial failure 可收敛到 `deleted` 且无重复副作用。Phase 3 五态、七天窗口、安全边界和控制组均未回退。

**Phase 3.1 完成。未进入 Phase 4。**

<!-- EXECUTION_REPORT_COMPLETE -->
