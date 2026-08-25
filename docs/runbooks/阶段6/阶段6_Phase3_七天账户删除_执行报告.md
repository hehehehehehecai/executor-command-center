# 探索者号｜阶段 6｜Phase 3 七天账户删除｜执行报告

## 1. 编排、授权与结论

- 批次 ID：`explorer-stage6-phase3-00538a4d9579d9fe`
- 提示词实例 ID：`explorer-stage6-phase3-3561bc1c6c77ec6f`
- 审核票据 ID：`review-ticket-3561bc1c6c77ec6f`
- 授权策略：`workflow-authorization.v1`
- 项目 / 大阶段：探索者号 / 阶段 6｜加固与发布
- 仓库：`D:\AI workplace\探索者号`
- 授权回读：只执行 Phase 3 的本地可逆修改、forward-only migration、合成测试、构建、报告和一个本地 commit；未获得 push、merge、PR、部署、发布、Production、真实账户/数据或 Phase 4–10 授权。
- baseline commit：`a79f406adcd3c90e281aaae27dc957ab47da683d`

**结论：Phase 3 完成；未进入 Phase 4。**

## 2. 基线与 Pre-Run Freeze

### 2.1 仓库身份

- baseline HEAD：`a79f406adcd3c90e281aaae27dc957ab47da683d`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:\AI workplace\探索者号\.git`
- linked worktree：否
- 基线 `git status --porcelain=v1 -uall | Out-String`：字符数 `354072`、行数 `1968`，全部为阶段前 `.pnpm-store/` 噪声；本批非 `.pnpm-store` 差异为 `0`。
- 基线 status UTF-8 SHA-256：`817575d95096559b06b1f10586868b2d11843d7bad7b25d9d4f5328f118f6b77`
- `.pnpm-store/`：阶段前递归镜像缓存噪声；本批未读取其业务内容、未删除、未整理、未修改、未暂存、未提交。

### 2.2 测试身份、时钟与预期

| Case | 用户 / Operation | 项目 / Work | 幂等键或时间 | 预期 |
|---|---|---|---|---|
| 生命周期目标 | `b300…0001` / DB 生成 operation | `b330…0001` | `phase3:request:one|two` | pending → cancel → pending → deleting → failed → deleting → deleted |
| 生命周期控制 | `b300…0002` | `b330…0002` | `phase3:control` | 全部行与 Energy delta 不变 |
| work-first | `b400…0001` | `b430…0001` / Sync `phase3:concurrency:work-first` | connection A 先提交 | request 等锁并取消已提交 Sync |
| request-first | `b400…0002` | `b430…0002` / Sync `phase3:concurrency:request-first` | connection A 先提交 | Sync 等锁后重读 pending 并失败关闭 |
| cancel-first | `b400…0003` | lifecycle row | 未到期 | claim 等锁后返回 cancelled |
| claim-first | `b400…0004` | lifecycle row | `due_at < DB now()` | cancel 等锁后返回 `cancel_window_closed` |
| 并发控制 | `b400…0005` | `b430…0005` | 独立 connection | 不跨账户阻塞 |
| Auth Admin | `b3a0…0001` | 本地合成 Auth Identity | hard delete + replay | Auth 行 1→0，重放 `already_absent` |

- 权威时钟：所有 `requested_at`、`due_at`、claim 与 lease 均来自数据库 UTC `clock_timestamp()`；`due_at = requested_at + interval '7 days'`。
- lease：测试和 adapter 使用 5 分钟，数据库只接受 30 秒至 15 分钟。
- 初始 migration 占位文件 SHA-256：`5fa43266ac5647b691257c00a3ef0561c8dd6acb08a3a74de0a986000ee0d85a`。
- 首次红灯前测试文件身份与所有稳定 ID 已冻结；首次 PowerShell hash 投影没有把初始测试 digest 保留在终端回执中，这是本批唯一 pre-run 证据格式缺口。未改 case 身份或分母；最终文件 digest 见第 8 节。

## 3. 开始前只读审计

### 3.1 完整 FK 图与处置

本地 reset 后从 `pg_constraint` 导出 Auth/Public 图，共 57 条相关 FK。以下分组覆盖全部边：

1. `auth.users` 直接 `CASCADE`：`auth.identities`、`auth.mfa_factors`、`auth.oauth_authorizations`、`auth.oauth_consents`、`auth.one_time_tokens`、`auth.sessions`、`auth.webauthn_challenges`、`auth.webauthn_credentials`、`public.users`。
2. Auth 间接 `CASCADE`：`auth.sessions → auth.refresh_tokens|auth.mfa_amr_claims`；`auth.mfa_factors → auth.mfa_challenges`；`auth.flow_state → auth.saml_relay_states`；`auth.sso_providers → auth.saml_providers|auth.saml_relay_states|auth.sso_domains`；`auth.oauth_clients → auth.oauth_authorizations|auth.oauth_consents|auth.sessions`。
3. `public.users` 直接 `CASCADE`：`github_identities`、`github_installation_states`、`github_installations`、`selected_repositories`、`projects`、`project_briefs`、`energy_reservations`、`ai_invocations`、`energy_ledger_entries`、`repository_removal_operations`、`evidence_reference_invalidations`。
4. `github_installations → selected_repositories` 为 `RESTRICT`；`selected_repositories → projects` 为 `CASCADE`。
5. `projects` 的 `CASCADE`：`sync_runs`、`project_sync_dispatches`、六类 GitHub activity/snapshot 表、`github_document_snapshots`、`project_briefs`、`energy_reservations`、`ai_invocations`；Webhook 对 project 为 `SET NULL`。
6. `sync_runs → project_sync_dispatches` 为 `CASCADE`，Webhook 对 sync run 为 `SET NULL`。
7. 受限账户级边：`energy_ledger_entries → energy_reservations|ai_invocations|repository_removal_operations|projects` 均为 `RESTRICT`；`evidence_reference_invalidations → repository_removal_operations` 为 `RESTRICT`。
8. 复合 owner 边：`project_briefs → projects`、`energy_reservations → projects`、`ai_invocations → projects|briefs|reservations`；AI source self-FK 为 `NO ACTION`。

处置矩阵：

| 类别 | 处置 | 原因 |
|---|---|---|
| 项目、仓库快照、文档、同步、Webhook、Brief 等账户业务树 | DELETE | 删除 `public.users` 后经已核验 cascade 收敛 |
| `energy_ledger_entries` | 显式先 DELETE | immutable trigger 与多条 RESTRICT，不能盲靠 cascade |
| `evidence_reference_invalidations` | 显式先 DELETE | 对 removal operation 为 RESTRICT |
| `ai_invocations` / `project_briefs` / `energy_reservations` | 显式按依赖顺序 DELETE | 解除 ledger、brief、reservation 复合引用 |
| `repository_removal_operations` | 显式 DELETE | 其历史墓碑属于被删除账户且受 ledger/evidence RESTRICT |
| `account_deletion_operations` | TOMBSTONE | 不含用户 FK、email、登录、仓库或业务 payload；仅保留 UUID、状态、时间、低基数结果和 64 位 receipt fingerprint |
| Auth Identity | Auth Admin hard DELETE | 在业务清理 receipt 成功后跨边界执行；不存在视为幂等成功 |

### 3.2 入口冻结矩阵

统一数据库门禁由 `app_private.guard_account_derived_write` 在 INSERT/UPDATE 最早安全位置锁定所属 Installation（稳定 ID 顺序）后锁账户 lifecycle 行；非 `active` 统一抛 `account_deletion_pending`。覆盖：用户/身份、Installation/selection/project、六类 GitHub activity、document snapshot、Sync、dispatch、Webhook、Brief、reservation、AI invocation、ledger、repository removal 与 evidence invalidation。

| 入口/边界 | 申请前 | pending/deleting/failed | 执行中处置 |
|---|---|---|---|
| First/Manual/Webhook/Reconciliation Sync | 允许 | 创建前失败关闭 | queued→cancelled；running/partial→failed |
| dispatch/Webhook inbox | 允许 | INSERT/UPDATE 门禁拒绝 | pending/dispatching→cancelled/ignored；processing→failed |
| Brief/follow-up/daily AI | 允许 | reservation/provider/持久化前拒绝 | pending Brief/AI→authorization failed |
| Energy | 允许 | 新 reservation/ledger 写入拒绝 | reserved→released；幂等 refund ledger |
| repository selection/installation/project 写入 | 允许 | 失败关闭 | 不创建新接入或派生数据 |
| Auth callback `ensure_user_identity` | 允许 | 锁 Auth+lifecycle 后拒绝 | 防止业务清理后、Auth 删除失败期间复活 `public.users` |

锁顺序统一为 `Installation(s) → account lifecycle → work rows`。申请与新 Sync 的双连接测试证明两种提交顺序；取消与 claim 由同一 lifecycle `FOR UPDATE` 串行。没有全表锁或跨账户 advisory lock。

### 3.3 Job / Service Role / Auth Admin 边界

- 复用现有 Inngest `JobDispatcher`，新增唯一 `account.deletion.due.v1` function；按 DB `dueAt` 使用 `sleepUntil`，不引入通用任务平台。
- 浏览器只调用 application use case；actor 来自验证后的 Supabase session，客户端 actor/project 字段不被信任。
- Service Role 只存在于 server-only repository/worker composition；RPC 全部撤销 public/anon/authenticated 权限，仅向 `service_role` 最小授权。
- Auth Admin adapter 调用 `deleteUser(userId, false)`；只返回 `deleted|already_absent` 和低基数结果 fingerprint，不记录 token、email、session 或原始响应。
- 业务数据库与 Auth 不伪装成一个事务：业务成功/Auth 失败持久化为 `deletion_failed`；lease 过期后 claim 重试，从 business `already_absent` 安全续跑。

### 3.4 UI 现实

仓库原先没有独立账户设置页；最接近且已有认证身份上下文的页面为 `/onboarding`。本批只在该页面加入最小账户删除区：强确认文本绑定当前 user UUID、七天截止时间、撤销、deleting、failed 和完成反馈；没有新增面板、导航或设计系统。

## 4. TDD 红灯、并发与 Partial Failure

### 4.1 基线红灯

1. 初始 pgTAP 在空 forward migration 上 exit `1`，首个稳定失败为 `request_account_deletion` 不存在；证明基线没有生命周期入口。
2. 初始 TS 聚焦测试 exit `1`，三个 account-deletion 模块不存在；证明 application/adapter/API/UI 路径缺失。
3. 实现后首次 DB 候选暴露 `project_sync_dispatches` safe error constraint 不接受账户冻结错误；用新 migration 中的最小 constraint replacement 修复，未修改旧 migration。
4. 第二次候选发现 transaction-local internal GUC 在同一 pgTAP transaction 内泄漏，导致申请后的新 Sync 未失败关闭；RPC 退出前显式恢复 GUC 后，红灯转绿。

### 4.2 并发证据

- work-first：connection A 持 Installation 锁并提交 Sync；connection B request 被确认处于 Lock wait，A commit 后 B 取消该 Sync。
- request-first：A request 未提交时 B Sync 等同一 Installation 锁；A commit 后 B 重读 lifecycle，得到 `account_deletion_pending`，Sync survivor `0`。
- cancel-first：claim 等 lifecycle 锁，取消提交后返回 `cancelled`。
- claim-first：cancel 等 lifecycle 锁，claim 提交后返回 `account_deletion_cancel_window_closed`；单赢家 `1`。
- 独立控制账户的 Sync 在目标锁竞争期间成功 queued；deadlock、lock timeout、statement timeout、未知错误均为 `0`。

### 4.3 Partial Failure 与 Auth 证据

- `cleanup_account_business_data` 以单 RPC transaction 执行；FK/restrict/check 失败统一回滚并返回稳定 `account_deletion_business_cleanup_failed`。
- 业务清理成功后，数据库测试明确确认 `public.users=0`、项目树 `0`，但 `auth.users=1`，没有伪造 Auth 成功。
- Auth 失败写入 `deletion_failed`；重 claim 后 business cleanup 返回 `already_absent`，Auth `already_absent` 可收敛到 `deleted`。
- 本地真实 Auth integration：固定合成 `b3a0…0001` 通过 GoTrue Admin hard delete，`auth.users` 计数 `1→0`；重放同一 user ID 返回 `already_absent`。
- 完成后 job replay 返回 `completed`/No-op，无重复副作用。

## 5. 状态、错误与公开合同

```text
active --request--> deletion_pending
deletion_pending --cancel before due/claim--> active
deletion_pending --claim at/after DB due_at--> deleting
deleting --business + Auth deleted/already absent--> deleted
deleting --retryable business/Auth failure--> deletion_failed
deletion_failed --retry claim--> deleting
deleted --replay--> deleted / no-op
```

- 合同：`account-deletion.v1`、`account-deletion-storage.v1`、`account-deletion-job.v1` 与现有 `workflow-authorization.v1`。
- 申请幂等：同一 pending key 返回同 operation；不同 key 冲突；取消后旧 key 不能被当作新请求重用。
- 失败关闭：`invalid_request`、`not_found`（含 forbidden 防枚举）、`already_deleting`、`cancel_window_closed`、`claim_conflict|lease_conflict`、`business_cleanup_failed`、`auth_identity_delete_failed`、`dispatch_failed|storage_failed`。
- HTTP POST/DELETE 必须精确匹配 `APP_ORIGIN`；缺失或跨站 Origin 均在构造 privileged dependencies 前拒绝。

## 6. 修改文件

### 6.1 数据库

- `supabase/migrations/20260825120000_add_account_deletion_lifecycle.sql`
- `supabase/tests/0036_account_deletion_lifecycle_test.sql`
- `supabase/tests/0037_account_deletion_concurrency_test.sql`
- `supabase/tests/0007_github_repository_selection_test.sql`（严格 trigger 集合加入精确新 trigger）
- `supabase/tests/0008_project_calibration_test.sql`（同上）
- `src/infrastructure/database/database.types.ts`（生成）

### 6.2 Domain / Application / Infrastructure / Job

- `src/domain/account-deletion/account-deletion.ts`
- `src/domain/account-deletion/account-deletion-job.ts`
- `src/application/account-deletion/account-deletion-use-cases.ts`
- `src/application/account-deletion/account-deletion-use-cases.test.ts`
- `src/infrastructure/account-deletion/supabase-account-deletion-repository.ts`
- `src/infrastructure/account-deletion/supabase-account-deletion-repository.test.ts`
- `src/infrastructure/account-deletion/supabase-auth-identity-admin.ts`
- `src/infrastructure/account-deletion/supabase-auth-identity-admin.test.ts`
- `src/infrastructure/account-deletion/inngest-account-deletion-dispatcher.ts`
- `src/infrastructure/jobs/inngest-runtime.ts`
- `src/infrastructure/jobs/inngest-runtime.test.ts`
- `src/app/api/inngest/inngest-route-dependencies.ts`
- `src/app/api/inngest/inngest-route-dependencies.test.ts`

### 6.3 API / UI / Integration

- `src/app/api/account-deletion/account-deletion-route-dependencies.ts`
- `src/app/api/account-deletion/route.ts`
- `src/app/api/account-deletion/route.test.ts`
- `src/features/onboarding/AccountDeletionPanel.tsx`
- `src/features/onboarding/AccountDeletionPanel.test.tsx`
- `src/features/onboarding/index.ts`
- `src/app/onboarding/page.tsx`
- `tests/integration/account-deletion/account-deletion-boundaries.test.ts`
- `tests/integration/account-deletion/local-auth-identity-deletion.test.ts`

未修改任何既有 migration；两个旧 pgTAP 文件只保持原有严格集合语义并加入新 trigger 精确名称，没有放宽断言。

## 7. Lineage、分母与 Target-Specific Metrics

### 7.1 Lineage

```text
b300…0001 → DB operationId → phase3:request:two
→ requestedAt / dueAt(+7d) → claim leaseToken
→ business receipt deleted → auth_failed receipt
→ retry leaseToken → business already_absent → auth_already_absent → deleted

b3a0…0001 → local GoTrue Admin delete → auth.users 1→0
→ same user replay → already_absent
```

### 7.2 冻结分母与结果

| 指标 | eligible / 请求 | 实际结果 |
|---|---:|---|
| 申请调用 | 4 | 状态转换 2；同键重放 1；异键冲突 1 |
| 合法取消 / claim 后取消 | 1 / 1 | 成功 1 / 关闭 1；副作用 0 |
| 到期前 / 到期后 claim | 1 / 1 | not_due 1 / 单赢家 1 |
| retry claim / completed replay | 1 / 1 | claimed 1 / No-op 1 |
| queued / running Sync | 1 / 1 | cancelled 1 / authorization failed 1；残留 0 |
| pending dispatch / Webhook / Brief / AI | 各 1 | cancelled/ignored/failed/failed 各 1；残留 0 |
| reserved Energy | 1 | released 1；refund ledger 1；非授权 delta 0 |
| 申请后新 Sync | 2（顺序+并发） | 阻止 2；queued survivor 0 |
| 业务目标 public user / project | 1 / 1 | 删除 1 / 1；残留 0；误删 0 |
| Auth Identity | delete 1；already absent replay 1；模拟失败 1 | deleted 1；already_absent 1；失败可重试并收敛 1 |
| tombstone | 1 | 保留 1；敏感内容残留 0；业务 payload 字段 0 |
| 控制 user/project/sync/dispatch/webhook/brief/reservation/ledger | 各 1 | 变化 0；ledger delta 保持 7 |
| dblink 竞争 | 4 | 允许串行结果 4；deadlock/timeout/意外错误 0 |
| 非授权 dispatcher/provider/GitHub 外部调用 | 0 eligible（本地合成、无 provider） | `N/A`；实际调用 0 |

目标达成：误删 `0`、目标业务残留 `0`（除最小 tombstone）、敏感墓碑内容 `0`、控制组变化 `0`、申请后非授权外部调用 `0`、重复副作用 `0`。

## 8. 文件摘要与可审计冻结

- migration 最终 SHA-256：`64a469d776a1e7b6512bb0e7d579302234aaa2fe96da1c5e670a3602abd3c0b7`
- `0036` 最终 SHA-256：`2111ec8e7e16b01def098e284b2527852bf444c4ca8ffbd4329f30e5d157b43e`
- `0037` 最终 SHA-256：`7b5967c561d607871328d87ce2dbe48ced3458e23ca80984b525e97ae4bf930e`
- local Auth integration SHA-256：`721cdcc802e7bf77230aa9e97b74ef58a65543e57b4c1c8f4ede0d1531f984a4`
- 报告生成前 status SHA-256：`fa6837a6a95eb6493ca461744789eeeff2d154b027a48f892912ed1b965e62e4`；字符数 `366165`；行数 `2053`；`.pnpm-store` `2025` 行，本批 `28` 行。

## 9. 测试、质量门与失败记录

### 9.1 最终通过

| 命令 | 退出码 | 结果 |
|---|---:|---|
| Phase 3 聚焦 Vitest | 0 | 6 files / 32 tests |
| local Auth hard-delete integration | 0 | 1 file / 1 test |
| `0036` + `0037` 独立执行 | 0 | 45/45 |
| `pnpm typecheck` | 0 | 通过 |
| `pnpm lint` | 0 | 通过，0 warning |
| `pnpm test` | 0 | 176 files / 1686 tests |
| `pnpm test:integration` | 0 | 21 files / 67 tests；随后 DB 37 files / 899 tests（补强前）；补强后独立/full DB 另证 45/45 与 903/903 |
| `pnpm test:e2e:auth-fixture` | 0 | 1/1 synthetic GitHub Auth fixture |
| `pnpm test:e2e:connected-panels` | 0 | 8/8 |
| `pnpm db:reset` | 0 | 从零应用全部 28 条 migration，含新 `20260825120000` |
| `pnpm db:test`（最终） | 0 | 37 files / 903 tests |
| `pnpm db:lint` | 0 | `results=[]` |
| `pnpm db:types` | 0 | 生成成功 |
| `pnpm db:types:check` | 0 | up to date |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm build` | 0 | Next.js 16.2.10 production build；`/api/account-deletion` 动态路由成功 |

### 9.2 失败、系统审批与处置

1. 初次聚焦/typecheck/lint 未加载 bundled Node PATH，均 exit `1` 且未进入测试；绑定本地运行时后聚焦 32/32、typecheck/lint 通过。
2. `db:types`、`db:types:check`、`db:drift:check` 首次在沙箱内因 Supabase CLI 尝试写用户级 telemetry 临时文件而 `EPERM`；按 B 类精确提升本地权限后全部 exit `0`。
3. 首次完整 integration 有 19/20 files、64 tests 通过，既有 calibration fixture 报 `local_supabase_credentials_unavailable`；只读 status 确认本地服务可用后重跑为 20/20、66/66。
4. 加入 local Auth 测试后的并行终验与 typecheck/lint 同时运行，5 个既有 Supabase status `beforeAll` 超过 10 秒；Phase 3 文件与其余 16 files 通过。无其他门并行时精确重跑 `pnpm test:integration` 为 21/21、67/67，DB 899/899。
5. local Auth 集成首版直接 SQL 夹具遗漏 GoTrue 读取所需的空 token 列，Admin 返回 500，adapter 正确失败关闭且 Auth 行未误报删除；容器日志定位后只补全合成夹具，真实 hard-delete + already-absent 1/1。
6. DB 首轮实现另发现 dispatch error constraint 与 transaction-local GUC 恢复问题，均在同一新 migration 内最小修复；没有修改旧 migration、删除测试或放宽安全断言。

所有系统审批仅用于本机 Docker/Supabase、浏览器 fixture 和本地合成 Auth。未安装/升级依赖，Supabase CLI 更新提示被忽略。任何失败均未通过吞错、延长并发 sleep、跳过 Auth 或保留业务数据取得绿色。

## 10. Git、禁止动作与最终状态

- 提交前 HEAD：`a79f406adcd3c90e281aaae27dc957ab47da683d`
- 计划提交消息：`feat: add seven-day account deletion`
- 本批只创建一个本地 commit，不 amend、不 reset、不 clean、不改写历史。
- 精确 commit hash：本报告与全部实现由同一提交承载；Git commit hash 包含本报告自身内容，不能在提交前自引用。提交后的精确 hash 由最终任务回执和只读 `git rev-parse HEAD` 绑定本报告。
- 提交只使用显式文件路径；不使用 `git add .`。唯一未纳入项为阶段前 `.pnpm-store/`。
- 未 push、merge、创建 PR、部署、发布或访问 Production。
- 未使用真实用户、真实 Auth Identity、真实 GitHub、真实 AI、真实仓库或外部密钥；所有删除均限本地合成数据。
- 未自动撤销 GitHub App Installation，未扩大到新 provider、通用任务系统或设计系统。
- 未进入 Phase 4–10。

## 11. Exit Criteria

- 五态、七天窗口、幂等申请/取消/claim/retry：满足。
- 申请后所有新 Sync/AI/接入和派生写入立即失败关闭：DB gate、顺序和双连接证据满足。
- 到期单赢家，业务数据与本地合成 Auth Identity 删除/already absent：满足。
- business/Auth partial failure 可重试收敛，无重复副作用：满足。
- 完整 FK 图、RESTRICT ledger/removal 处置与最小 tombstone：满足。
- 其他用户/项目零变化，RLS、防枚举、Service Role/Auth Admin 边界：满足。
- UI 强确认、七天截止、取消、处理中/失败反馈：满足。
- 仅新增 forward-only migration，旧 migration 零修改：满足。
- 全部必需质量门：通过。
- 单一最小本地 commit：提交后由最终回执绑定。
- `.pnpm-store/`、真实环境、Production、Phase 4–10：未触碰/未进入。

**Phase 3 完成；未进入 Phase 4。**

<!-- EXECUTION_REPORT_COMPLETE -->
