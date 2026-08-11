# Phase 9.2.9 陈旧 queued SyncRun 收敛槽修复证据

## 调度与基线

- 批次：`explorer-stage3-phase9-2-9-stale-sync-recovery-699b6009`
- prompt：`explorer-stage3-phase9-2-9-stale-queued-sync-recovery-699b6009`
- 来源审核票据：`sha256:699b600948750f903bf55fb6b6b2822d876acbd39b5ac767bb38cffb4fdb77c3`
- blocker：`sha256:0ce5e8577075b97381f2dddff4e705a7a4b5a03b8aa6d19a56c30b9e9e2a862b`，轮次 `1/5`
- branch：`feature/stage3-phase8-data-freshness-ui`
- 基线 HEAD：`73291f51e74dd5cbb965d2e5a15c0fd6f7d69d8b`
- 基线 tree：`3a1c9e58b15bb1f6a012eeb8754319cf45fdcd35`
- 基线 parent：`5b730d4e1e8d62837ee75d645d428bdfab0ec35e`
- 本地 remote-tracking `origin/staging`：`5b730d4e1e8d62837ee75d645d428bdfab0ec35e`
- 开始时工作区：clean

不可回写 Freeze：

- 路径：`tests/fixtures/synchronization/stage3-phase9-2-9-stale-sync-recovery-freeze.json`
- SHA-256：`39fe60dccf794b7218853c7b5c3e4824d3339507ab51473d58067b583374aced`
- 创建时点：`2026-08-11T17:18:53.9344488+08:00`
- Freeze 创建后未回写。

受保护历史证据：

- Phase 9.2.8 Freeze：`2fdf0a373447c0e25c1fdab732178d000dcfa62dd1101e9af78269ee0d10692d`
- Phase 9.2.8 evidence：`83c3ca5f228507228787dffe4e7e2091bc3c698e6f79e073a5c4110cdad2450a`

## 根因与确定性 RED

旧 `public.request_project_sync(uuid,text,text,uuid,timestamptz)` 在 Project advisory transaction lock 和 same-identity duplicate 检查后，直接把同 Project 任意 `queued`/`running` run 当作 active coalescing target。旧实现没有 lease、进度活性或陈旧阈值，因此从未启动的历史 queued run 会永久占用收敛槽。

最小 RED 先使用固定合成 Project/run，run 为 `queued/version=1`，`started_at`、`last_progress_at`、`finished_at`、`progress_cursor` 均为 null，三项时间为 `2026-08-11T11:44:59Z`，调用时间固定为 `2026-08-11T12:00:00Z`，且 request identity 不同。

- 首次最小 RED：1 文件、1 项、1 项预期失败；have=`coalesced`，want=`new`；Exit 1。
- 完整矩阵 RED：1 文件、41 项、14 项预期失败、27 项通过；Exit 1。
- 失败仅覆盖：旧 run 未 terminalize、新 run/dispatch 未创建、exact-15-minute 边界仍 coalesce，以及同一替代 identity 的后续调用无法 duplicate。
- live queued、running、partial、same-identity 优先级、权限和 schema 安全边界在 RED 时已经通过。

一次环境性复验记录：首次扩展 RED 因沙箱 PATH 找不到 `node` 未进入测试；加入 bundled Node 后又被 Supabase CLI telemetry 用户目录写权限阻断。经精确系统审批后，同一测试命令进入 pgTAP 并取得上述 14/41 产品 RED；没有修改断言或测试分母。

## 最小实现

- 新 migration：`supabase/migrations/20260811093237_recover_stale_queued_sync_requests.sql`
- logical migration ID：`0016`
- 合同：`sync-request-coalescing.v1`、`synchronization-state.v1`
- SHA-256：`6b88fb7e52651468b66e14e15c800ae6e28254a76369946c49aa62910f1a2884`

该 forward-only migration 仅 `create or replace` 既有同签名 RPC，保持：

- 既有输入校验、Project/installation/ownership/manual actor 门禁；
- `security definer`、`search_path=''`、owner=`postgres`；
- public/anon/authenticated 无 EXECUTE，service_role 仅有 RPC EXECUTE；
- service_role/浏览器角色无 `sync_runs` 或 `project_sync_dispatches` 直接写权限；
- Project advisory transaction lock；
- 原返回字段、异常安全码与 dispatch 创建合同。

唯一新增步骤位于 same-identity duplicate 检查之后、active queued/running 查询之前。在同一事务和 Project lock 内，仅更新满足全部条件的 run：

```text
status = queued
started_at = null
last_progress_at = null
finished_at = null
progress_cursor = null
queued_at <= p_requested_at - 15 minutes
created_at <= p_requested_at - 15 minutes
updated_at <= p_requested_at - 15 minutes
```

原子状态转换：

```text
queued(version N)
→ failed(version N+1)
finished_at = p_requested_at
error_code = sync_run_stale_queued
error_summary = Stale queued sync request recovered.
```

summary 为固定低基数文本，不包含 request identity、Provider 原文、payload 或凭据。旧 run 与旧 dispatch 不删除；回收后重新查询 live `queued/running`，仍有 active run 时正常 coalesce，否则创建一个新 SyncRun 与一个 pending dispatch。`partial` 仍不属于 coalescing 状态，也不被本修复更新。

## 15 分钟边界与收敛合同

- `p_requested_at - 15 minutes`：精确等于阈值时回收并返回 `new`。
- 比阈值新 1ms：保持 `queued/version=1`，返回 `coalesced`。
- 存在 `last_progress_at`：不回收。
- 存在 `progress_cursor`：不回收。
- `created_at` 或 `updated_at` 任一晚于阈值：不回收。
- `running`：保持 active coalescing target，不修改 status/version/finished_at。
- `partial`：保留历史，允许创建新 run；不修改历史状态。
- same identity：始终先返回 `duplicate`，即使其 run 满足 stale 时间条件也不 terminalize、不创建第二 run。
- advisory-lock 串行等价请求：第一次 `new`；相同 identity 重放 `duplicate`；另一 identity `coalesced` 到新 run；最终仅 old failed + one new queued、一个新 dispatch。
- 所有恢复判断和 `finished_at` 都由固定 `p_requested_at` 驱动；测试不依赖 `now()`。

## GREEN 与数据库验证

- migration-first 无 seed reset：16/16 migrations 顺序应用，Exit 0。
- 0018 定向 GREEN：1 文件、41/41，skip 0，Exit 0。
- 0016 + 0017 回归：2 文件、86/86，skip 0，Exit 0。
- 标准含 seed reset：16/16 migrations + seed，Exit 0。
- 全量 pgTAP：18 文件、570/570，skip 0，Exit 0。

全量 pgTAP 首轮曾因 migration-first reset 使用 `--no-seed` 导致 0001 baseline seed 的 5/570 断言失败；0018 与其余业务文件均通过。根因是本地环境准备而非产品，随后按仓库标准含 seed reset 并以同一全量命令复验，570/570 通过。

## 应用、相邻回归与静态门禁

- First Sync / Project Sync / Webhook / Reconciliation 定向：14 文件、109/109、skip 0、Exit 0。
- module boundaries：1 文件、36/36、skip 0、Exit 0。
- `pnpm test`：99 文件、1000/1000、skip 0、Exit 0。
- `pnpm run test:integration:app` 最终：18 文件、62/62、skip 0、Exit 0。
- `pnpm run test:integration:db` 最终：18 文件、570/570、skip 0、Exit 0。
- `pnpm run lint`：Exit 0，warning 0。
- `pnpm run typecheck`：Exit 0。
- `pnpm run db:lint`：0 findings，Exit 0。
- `pnpm run db:types:check`：generated types up to date，Exit 0。
- `pnpm run db:drift:check`：schema drift empty，Exit 0。
- `pnpm run test:e2e`：2/2，skip 0，Exit 0。
- `git diff --check`：Exit 0。

应用集成首轮在沙箱内被 Local Supabase CLI telemetry 写权限阻断，产生 6 个 suite failure、1 个 type-check 子进程 failure 和 20 个条件 skip；没有产品断言失败。精确系统审批后以完全相同命令复验，62/62、skip 0。

## 范围、指纹与安全审计

最终允许文件：

1. `tests/fixtures/synchronization/stage3-phase9-2-9-stale-sync-recovery-freeze.json`
2. `supabase/migrations/20260811093237_recover_stale_queued_sync_requests.sql`
3. `supabase/tests/0018_stale_queued_sync_recovery_test.sql`
4. `docs/runbooks/stage3-phase9-2-9-stale-sync-recovery-evidence.md`

无需修改生成数据库类型或 TypeScript error taxonomy。受保护指纹保持：

- `package.json`：`f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468`
- `pnpm-lock.yaml`：`a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef`
- 历史 reconciliation migration：`5b820e5eb5c896befd37a269ab50b3c01d673e92f5dea15a2dd80c9f8ebc1928`
- 0016 旧测试：`62f934cfa5306ccc63c431d170054a27d9238c8102ade3d22e60e0338a7ef1b7`
- 0017 旧测试：`799f903e8a7c761e590f17909c375b7f936117dd5f0cf6a6591f080bb6747176`
- generated database types：`f00caab1bb436be624c1774a8535d692a682e48268ba98d3fd2ad315cf38f4ac`
- `next-env.d.ts` 工作区/index/HEAD blob：均为 `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38`

production E2E 曾自动把 `next-env.d.ts` route import 改为 dev 路径；直接 diff 证明来源后已精确恢复，三方 blob 相等，未纳入本批 diff。

强特征扫描范围为本批四个文件；token/JWT/private key/Cookie/Authorization/raw payload/secret 值命中 0。合同文字中的禁止词与测试字段名不作为秘密值。未读取或连接任何 staging/Production/Provider；GitHub、Vercel、Inngest、远程 Supabase 查询与写入均为 0；Push/PR/Merge/部署/远程 migration/测试仓库对象/付费动作均为 0。

## 结论

陈旧 queued SyncRun 不再永久占用同 Project coalescing 槽。15 分钟阈值、same-identity 优先级、live queued/running/partial 不抢占、advisory-lock 串行收敛、service-role-only RPC 与完整回归均由本地确定性测试证明。本证据只支持代码具备进入独立 staging 重试审核的前提，不代表 staging 已部署或 Smoke 已通过。
