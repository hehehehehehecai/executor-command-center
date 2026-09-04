# 探索者号｜阶段 6｜Phase 3.2 claim 前重试耗尽恢复修复执行报告

## 1. 编排、授权与结论

- 批次 ID：`explorer-stage6-phase3.2-8895bcbb23c29c35`
- 提示词实例 ID：`explorer-stage6-phase3.2-7d8fd810f6c29644`
- 审核票据 ID：`review-ticket-7d8fd810f6c29644`
- 原始审核等级：`B`
- 授权策略：`workflow-authorization.v1`
- 项目 / 大阶段：探索者号 / 阶段 6｜加固与发布
- 授权仓库：`D:\AI workplace\探索者号`
- 基线提交：`3533c6d4619e3db4222bb7521d58907c66472d6f`
- 结论：Phase 3.2 完成。到期 `deletion_pending` 在首次 claim 前耗尽有限 worker retries 后可由持久 scanner 恢复；未到期、取消、重申请、旧 generation 和控制账户边界均保持失败关闭。
- 明确未进入 Phase 4。

授权仅用于本地可逆工程修改、新 forward-only migration、本地合成测试、构建、报告与一个本地 commit。未授权且未执行 push、merge、PR、部署、发布、Production、真实账户删除或外部账号操作。

## 2. 开始前只读审计与基线冻结

| 项目 | 冻结值 |
| --- | --- |
| repository root | `D:/AI workplace/探索者号` |
| HEAD | `3533c6d4619e3db4222bb7521d58907c66472d6f` |
| branch | `feature/stage4-bridge-five-panels` |
| origin | `ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git` |
| Git common directory | `D:\AI workplace\探索者号\.git` |
| linked worktree | `false` |
| baseline status SHA-256 | `33b4d73652d062e8d2dcb33fca97090226455655ca01259c2e95d92c8ea20b9c` |
| baseline status chars / lines | `369495 / 2046` |
| `.pnpm-store/` | 阶段前未跟踪缓存噪声；全批排除，不删除、不整理、不暂存、不提交 |

基线命令严格使用 PowerShell：

```powershell
$status = git status --porcelain=v1 -uall | Out-String
[System.Security.Cryptography.SHA256]::HashData(
  [System.Text.Encoding]::UTF8.GetBytes($status)
)
```

完整状态字符串含大量 `.pnpm-store/` 镜像/长路径条目；所有可解析的直接或引号路径均位于 `.pnpm-store/`。Git 同时报告该缓存树的阶段前长路径与失效镜像警告。本批未将这些条目计入业务差异。

### 2.1 Phase 3.1 恢复模型实况

Phase 3.1 在 `account_deletion_operations` 增加 9 个低基数调度字段：

1. `recovery_generation`
2. `recovery_eligible_at`
3. `recovery_dispatch_token`
4. `recovery_dispatch_lease_expires_at`
5. `recovery_dispatched_at`
6. `recovery_dispatch_attempts`
7. `recovery_last_error_code`
8. `retry_exhausted_at`
9. `retry_exhausted_count`

真实 SQL 差异为：

- `mark_account_deletion_retry_exhausted` 接受除 `active/deleted` 外的当前删除状态，因此能为 `deletion_pending` 写入 marker 并推进 generation。
- `account_deletion_recovery_eligible_idx` 和 `claim_account_deletion_recoveries` 只接受 `deleting/deletion_failed`。
- `request_account_deletion` 与 `cancel_account_deletion` 创建于这些字段之前，未清空 generation、eligible time、dispatch lease、计数和错误。
- `complete_account_deletion_recovery_dispatch` 未把合法取消后的 `active` 明确映射为 No-op。

因此审核 blocker 可在当前代码稳定复现：worker 若在 parse/sleep 后、`claim_account_deletion` 成功前遭遇 storage/network failure，`onFailure` 会写入 pending marker，但 scanner 永远漏扫。

### 2.2 Worker 各失败点的数据库状态

| 失败位置 | 可能数据库状态 | Phase 3.2 处置 |
| --- | --- | --- |
| parse | 未调用仓库；无可信 operation 时输入验证失败 | 不伪造恢复 marker |
| sleep / 到期调度 | `deletion_pending`，尚未 claim | Inngest 最终 `onFailure` 按 operation/generation 写 marker |
| claim storage/network | `deletion_pending`，或请求结果未知 | 同 generation marker 幂等；到期 scanner 恢复 |
| cleanup | `deleting` | 保持 Phase 3/3.1 business failure → `deletion_failed` |
| Auth | `deleting` 且业务数据已清理 | 保持 Auth partial failure → `deletion_failed` |
| complete | `deleting` 或已提交终态但响应未知 | 既有 claim/complete 幂等重放收敛 |

### 2.3 Scanner eligibility 真值表

| 状态 / 条件 | marker | due | lease | 结果 |
| --- | --- | --- | --- | --- |
| `deletion_pending` | 无 | 任意 | 无 | 不 eligible |
| `deletion_pending` | 有 | 未到期 | 无/过期 | 不 eligible |
| `deletion_pending` | 有 | 已到期 | 无/过期 | eligible |
| `deletion_pending` | 有 | 已到期 | 有效 dispatch lease | 不 eligible |
| `deleting/deletion_failed` | 有 | 已到期 | 无/过期 | 保持 Phase 3.1 eligible |
| `active`（已取消） | 旧 marker 已清空 | 任意 | 无 | 不 eligible；旧回调 No-op |
| 新申请 | 新 operation ID、generation 0 | 未到期 | 无 | 不 eligible |
| `deleted` | marker 已关闭 | 已到期 | 无 | 不 eligible；重放 No-op |

Scanner 绑定当前行的 `status + operation_id + recovery_generation + due_at + recovery_eligible_at + dispatch lease`，使用数据库 `clock_timestamp()` 和 `FOR UPDATE SKIP LOCKED`。锁只作用于候选 operation 行，没有全表锁或全局 advisory lock。

## 3. Pre-Run Freeze、Lineage 与文件哈希

### 3.1 初始文件哈希

| 文件 | 初始 SHA-256 | 说明 |
| --- | --- | --- |
| `supabase/migrations/20260825140000_fix_pending_account_deletion_recovery.sql` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 通过 Supabase CLI 创建后按既有 migration 顺序规范化为 `140000`，首次红灯时为空 |
| `supabase/tests/0041_account_deletion_pending_retry_recovery_test.sql` | `d6affa4a9a13d88fbe22e7c05dea931d30c5f433232036ec71f27e74e4801913` | 第一版独立合成夹具 |

第一版夹具发现两处自身错误：一次分别求值的时间违反精确 `due_at = requested_at + 7 days` 约束；一次使用了不合适的 SQL alias。修正原因被保留，本地数据库用精确合成数据 reset 清理。修正后的红灯测试 SHA-256 为 `31b8939df73ca0d5823d9f97f66148fb9b554c80a290302da737a43dd84e7067`。

### 3.2 稳定身份与预期序列

| Case | user ID | operation ID / identity | request key | 时间与预期 |
| --- | --- | --- | --- | --- |
| 到期 pending | `c4000000-0000-4000-8000-000000000001` | `c4800000-0000-4000-8000-000000000001` | `phase32:due:request` | DB now - 1 秒到期；generation `0 → 1`；scanner → dispatch → normal claim → deleted |
| 未到期 pending | `c4000000-0000-4000-8000-000000000002` | `c4800000-0000-4000-8000-000000000002` | `phase32:not-due:request` | DB now + 7 天；marker 存在但 scanner 结果 0 |
| 取消 / 重申请 | `c4000000-0000-4000-8000-000000000003` | 旧 `c4800000-0000-4000-8000-000000000003`；新 ID 由数据库生成并按结果绑定 | 旧 `phase32:cancel:request`；新 `phase32:cancel:new-request` | 旧 generation 1 清零；新 operation generation 0；旧 callback/event No-op |
| 控制账户 | `c4000000-0000-4000-8000-000000000004` | lifecycle active | N/A | 全程零变化 |

动态 dispatch token 仅在数据库成功 claim 时生成；测试不猜测该值，而是从 `operationId + generation` 对齐的返回值提取并用于 complete。

Lineage：

```text
c400...0001 → c480...0001 / generation 0
  → pre-claim exhaustion marker / generation 1
  → scanner connection A winner（connection B 0）
  → dispatch_failed → DB backoff → later dispatch success
  → normal claim lease → business deleted → Auth already_absent → deleted

c400...0003 → c480...0003 / generation 1 marker
  → legal cancel → active / generation 0 / leases cleared
  → new operation ID / generation 0
  → old onFailure completed No-op + old event not_found No-op
```

## 4. TDD 红灯、根因与最小修复

### 4.1 正确红灯

命令：

```powershell
supabase test db --local supabase/tests/0041_account_deletion_pending_retry_recovery_test.sql
```

基线结果：退出码 `1`，`28` 个断言中 `6` 个失败：

- cancellation 清理：实际 generation `1`、marker/耗尽计数仍存在；预期全部清空。
- re-request：实际继承 generation `1`；预期新 operation generation `0`。
- old callback 隔离：新 operation 仍显示旧 generation/计数。
- due pending scanner：实际候选 `0`；预期 `1`。
- 稳定 operation 对齐：实际 `NULL`；预期 `c480...0001`。
- dispatch failure 后再扫描：实际候选 `0`；预期 `1`。

失败没有部分业务删除、Auth 调用或控制账户变化。红灯直接证明审核 blocker，而非自然语言、source grep 或模拟返回值。

### 4.2 最小修复

新 migration：`20260825140000_fix_pending_account_deletion_recovery.sql`。

- 重新创建 recovery partial index，使其覆盖带 marker 的三种可恢复状态。
- scanner 增加并同时校验 `operation_id`、generation、`retry_exhausted_at`、DB `due_at`、`recovery_eligible_at` 与 dispatch lease。
- marker 明确只接受 `deletion_pending/deleting/deletion_failed`，同 generation 重放不重复推进。
- request 创建新 operation 时把 9 个恢复字段恢复为初始值。
- cancel 在七天窗口内将 9 个恢复字段全部清空；对已经 active 的合法重放也执行安全净化。
- dispatch completion 对已取消 active operation 返回稳定 `cancelled` No-op。
- migration 一次性净化 Phase 3.1 可能留下旧恢复字段的 active 行；不复制业务内容。
- 保持 `SECURITY DEFINER + search_path='' + schema-qualified relation + 最小 execute grant`，未扩大 anon/authenticated 权限。

运行时生产实现无需修改：既有 Inngest `retries: 8`、`onFailure`、15 分钟 bounded scanner、job ID `operationId:generation` 已能承载修正后的数据库状态集合。仅将运行时测试加强为“claim 前 storage failure → 最终 onFailure 使用原 operation/generation”。

## 5. 修改文件清单

| 文件 | 类型 | 内容 |
| --- | --- | --- |
| `supabase/migrations/20260825140000_fix_pending_account_deletion_recovery.sql` | 新增 | forward-only index/RPC/reset 修复 |
| `supabase/tests/0041_account_deletion_pending_retry_recovery_test.sql` | 新增 | 独立 pending exhaustion、未到期、取消/重申请、双连接 scanner、最终收敛测试 |
| `src/infrastructure/jobs/inngest-runtime.test.ts` | 修改 | claim 前 storage failure 与 onFailure generation 绑定测试 |
| `docs/runbooks/阶段6/阶段6_Phase3.2_claim前重试耗尽恢复修复_执行报告.md` | 新增 | 本报告 |

`pnpm db:types` 已运行；RPC 参数和返回签名未变化，因此 `database.types.ts` 生成结果无差异。任何既有 migration 均未修改。

## 6. 冻结分母与 Target-Specific Metrics

| 指标 | 分母 / 尝试 | 结果 |
| --- | ---: | ---: |
| worker finite retries | 配置 `8` | 保持 `8`，未改为无限重试 |
| claim 前 storage failure case | 1 | 1 个错误传播；最终 onFailure marker 1 |
| pending exhaustion marker | 1 | 实际 1 |
| 同 generation marker replay | 1 | generation 额外推进 0 |
| due pending scanner eligible | 1 | 实际 1 |
| not-due pending scanner eligible | 1 | 实际 0，提前执行 0 |
| 并发 scanner | 2 connections | winner 1 / second winner 0 |
| dispatch | failure 1 / retry 1 | retry eligible 1 / success 1 |
| normal deletion claim | 1 | winner 1 |
| business cleanup | eligible 1 | deleted 1 / duplicate 0 |
| Auth boundary（合成结果） | eligible 1 | already absent 1 / duplicate 0 |
| cancel | eligible 1 | cancelled 1 / residual recovery fields 0 |
| old callback / old event | 各 1 | 副作用 0 / 0 |
| re-request | 1 | 新 operation 1 / generation 0 |
| final deleted | 1 | 实际 1 |
| deleted replay | claim 1 / onFailure 1 | No-op 2 |
| control account | 1 | 变化 0 |
| deadlock / timeout / unknown | 2-connection test | 0 / 0 / 0 |
| Phase 3.1 deletion_failed recovery | 1 个既有 case | 通过，回退 0 |
| Webhook residual/concurrency | 2 个既有文件 | 通过，回退 0 |
| 真实 GitHub / AI provider 调用 | 样本 0 | `N/A`；未调用 |

目标达成：到期 pending 漏扫 `0`、未到期提前执行 `0`、取消后副作用 `0`、新申请旧 generation 污染 `0`、重复业务/Auth 副作用 `0`、控制组变化 `0`。

## 7. 验证命令与结果

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| Phase 3.2 红灯 `0041` | `1` | 正确红灯：6/28 失败，见第 4 节 |
| Phase 3.2 绿灯 `0041` | `0` | 最终 29/29 |
| 聚焦 `0036–0041` | `0` | 6 files / 104 tests（补充最终 No-op 断言前；新增文件最终 29/29） |
| Account deletion runtime/application/repository/dispatcher/Auth adapter 聚焦 | `0` | 5 files / 32 tests |
| `pnpm typecheck` | `0` | 通过 |
| `pnpm lint` | `0` | 通过，0 warning |
| `pnpm test` | `0` | 177 files / 1693 tests |
| `pnpm test:integration` | `0` | application 21 files / 67 tests；database 41 files / 962 tests（最终数据库总数见 `pnpm db:test`） |
| `pnpm test:e2e:auth-fixture` | `0` | 1/1；仅本地合成身份 |
| `pnpm test:e2e:connected-panels` | `0` | 8/8 |
| `pnpm db:reset` | `0` | 全部 migration 从零顺序应用，含 `20260825140000` |
| `pnpm db:test` | `0` | 41 files / 963 tests |
| `pnpm db:lint` | `0` | `results: []` |
| `pnpm db:types` | `0` | 生成成功，无文件差异 |
| `pnpm db:types:check` | `0` | generated types up to date |
| `pnpm db:drift:check` | `0` | schema drift empty |
| `pnpm build` | `0` | Next.js production build 成功 |

### 7.1 失败与系统审批记录

1. `pnpm exec supabase` 初次发现命令时因桌面运行时未把 bundled Node 放入 PATH 而退出 `1`；读取 workspace dependency 后仅为本批命令注入明确 Node 路径，没有安装/升级依赖。CLI 为 `2.109.1`。
2. 第一次本地 pgTAP 在 sandbox 内无法读取 Docker credential / named pipe，退出 `1`；按 B 类策略申请精确本地 Supabase/Docker 边界后继续。
3. 红灯夹具前两次分别触发 `account_deletion_time_check` 与 SQL alias 语法错误；均在生产实现前修正，使用 `pnpm db:reset` 清理只属于本批的合成 UUID，随后得到正确 6/28 红灯。
4. 一次 `pnpm test -- <files>` 因脚本参数多出字面 `--` 而长时间无聚焦输出，主动中断，退出 `1`；改用仓库现有 Vitest 的明确 Node 入口后 5 files / 32 tests 通过。没有以该失败冒充通过。
5. `pnpm db:types` 首次在 sandbox 内因 Docker API 权限退出 `1`；精确审批后退出 `0`。

以上非绿色尝试均未产生真实账户删除、外部调用、部分生产写入或不可恢复副作用。

## 8. 安全、回归与禁止动作复核

- 保持五态、七天 UTC 窗口、取消窗口、业务/Auth 非原子边界与稳定错误合同。
- 未把 pending 伪造成 `deletion_failed` 或 `deleted`。
- 未到期 operation 即使存在错误 marker，也必须同时满足 DB `due_at <= clock_timestamp()` 才能被 scanner 选择。
- request/cancel 与 scanner 均锁定同一 lifecycle 行；scanner 使用 `FOR UPDATE SKIP LOCKED`，无 sleep 猜赢家。
- operation ID 更换后，旧 onFailure/event 无法匹配新 operation；新 generation 保持 0。
- Phase 3.1 `deletion_failed` 恢复、Webhook 元数据清理和 request/Webhook 锁序测试全部通过。
- 未修改 UI、Auth Admin、Webhook cleanup 或通用 Inngest 平台。
- 未安装或升级依赖。
- 未删除、修改、整理、暂存或提交 `.pnpm-store/`。
- 未执行 amend、reset、clean、改写历史、push、merge、PR、部署或发布。
- 未接触 Production、真实用户、真实 GitHub/AI 数据。
- 未进入 Phase 4–10。

## 9. Git 提交与最终状态

本批将形成一个本地 commit，建议消息：`fix: recover pre-claim account deletion exhaustion`。由于包含本报告的 Git commit hash 不能在不改变该 commit 内容的前提下自引用，实际 commit hash 由最终执行回执绑定；不会通过 amend 或第二个提交回填。

提交前只暂存第 5 节四个必要文件。最终 `git status --porcelain=v1 -uall | Out-String` 的 SHA-256、字符数、行数及 commit hash 由同一最终回执给出。预期 tracked 状态干净，唯一未纳入项为阶段前 `.pnpm-store/`。

## 10. 最终判定

Phase 3.2 完成：claim 前耗尽的到期 pending operation 可恢复并最终收敛；未到期不提前；取消清空旧恢复状态；重新申请使用新 operation identity 与干净 generation；旧回调和旧 event No-op；既有 Phase 3/3.1 安全与恢复路径无回退。

未进入 Phase 4。

<!-- EXECUTION_REPORT_COMPLETE -->
