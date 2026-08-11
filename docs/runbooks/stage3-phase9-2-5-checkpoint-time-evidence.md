# Phase 9.2.5 First Sync checkpoint 时间精度修复证据

## 批次与基线

- 批次：`explorer-stage3-phase9-2-5-checkpoint-time-07dfdfaa`
- prompt：`explorer-stage3-phase9-2-5-checkpoint-time-precision-07dfdfaa`
- 授权信封：`workflow-authorization.v1:07dfdfaa09588451`
- 来源审核票据：`sha256:07dfdfaa095884512338042a662f3c0778c9d5c53f3e75952fc8ad3308495589`
- branch：`feature/stage3-phase8-data-freshness-ui`
- baseline commit：`d737fdfe21e733fc5bad59d21d551b138a63c6c6`
- baseline tree：`384329d6f503462dfad2169deb9c61302b394fe8`
- baseline parent：`f67bf836b8d0dd2826db6fb26178992263b3a1cc`
- 初始工作区：clean
- Pre-Run Freeze：`tests/fixtures/synchronization/stage3-phase9-2-5-checkpoint-time-freeze.json`
- Freeze SHA-256：`2ac80ef53eaab0843a9c10622ba89d020d1ab63eb34d0b6ccec88d6f103b4049`

## 确定性 RED 与根因

合成持久化时间为 `2026-08-11T01:30:16.518718Z`。JavaScript 窗口合同继续 canonical 为 `2026-08-11T01:30:16.518Z`，两者相差 718 微秒。

新增行为测试在实现修改前运行，结果为 1 文件、14 测试，其中 13 passed、1 failed，Exit 1。唯一失败断言：

```text
Expected: 2026-08-11T01:30:16.518718Z
Received: 2026-08-11T01:30:16.518Z
```

同一测试已经先证明 dispatcher 调用 1 次、checkpoint 调用 1 次；失败层精确位于 `StartFirstRepositorySync` 的初始 checkpoint 参数。原实现把 `freezeFirstSyncWindow(canonical(run.queuedAt)).windowEnd` 同时用于 job 和 checkpoint。由于 PostgreSQL 保留微秒，而 JavaScript canonical 只保留毫秒，checkpoint 时间早于 `sync_runs.queued_at`，违反 `sync_runs_timestamp_order_check` 中的 `last_progress_at >= queued_at`。

数据库函数把该 check violation 映射为稳定安全码 `first_sync_cursor_invalid`；本批没有修改通用错误映射。

## 最小修复

产品修改只有一行：初始 checkpoint 的 `checkpointedAt` 从 `window.windowEnd` 改为当前已持久化 queued run 的原始 `run.queuedAt`。

以下合同保持不变：

- First Sync 90 天窗口和六组顺序；
- cursor 的 `windowStart/windowEnd` 毫秒 canonical；
- BackgroundJob `requestedAt` 毫秒 canonical；
- request identity、SyncRun 幂等和一次 dispatch；
- 后续 group checkpoint 继续使用注入 clock；
- cursor exact keys、长度、provider ID、敏感字段和 group 顺序校验；
- 历史 migration、SQL constraint、RPC 权限和数据库类型。

## GREEN 与幂等证据

同一行为测试修复后为 1 文件、14/14 passed、Exit 0：

- `checkpointedAt = 2026-08-11T01:30:16.518718Z`；
- receipt/cursor `windowEnd = 2026-08-11T01:30:16.518Z`；
- job `requestedAt = 2026-08-11T01:30:16.518Z`；
- dispatcher 1 次；
- checkpoint 1 次。

既有 replay 测试继续证明同一 `projectId + requestId` 返回同一 SyncRun/cursor/provider lineage，dispatcher 总调用仍为 1。

## Local PostgreSQL 回滚事务

在本机 Supabase 中使用完全合成 UUID、repository、installation、run 和 provider receipt 执行事务：

1. 创建 queued SyncRun version 1；
2. 精确设置 `queued_at = 2026-08-11T01:30:16.518718Z`；
3. 用合法、无敏感字段的 First Sync cursor 调用 checkpoint；
4. 先传 `.518Z`，得到 `first_sync_cursor_invalid`；
5. 再传数据库原样 `.518718Z`，返回 version 2；
6. 返回 `last_progress_at = 2026-08-11T01:30:16.518718+00:00`；
7. `progress_cursor` 非空且 `app_private.first_sync_cursor_is_valid = true`；
8. `ROLLBACK` 后目标 SyncRun 行数为 0。

本批未新增或修改 migration，未生成数据库类型。

## 测试与门禁

| 门禁 | 首轮/最终结果 | 文件 / 测试 / skipped | Exit |
|---|---|---:|---:|
| 新增 TDD RED | 预期失败，目标断言唯一失败 | 1 / 14（13 pass，1 fail）/ 0 | 1 |
| 新增定向 GREEN | PASS | 1 / 14 / 0 | 0 |
| First Sync、Phase 5–9 相邻、module boundaries 定向 | PASS | 23 / 232 / 0 | 0 |
| 方括号 Route 路径显式定向 | PASS | 3 / 14 / 0 | 0 |
| `pnpm run test:integration:app` 首轮 | 环境失败：子进程 PATH 无 `node`，未进入产品断言 | 0 / 0 / 0 | 1 |
| 应用集成直接入口首轮 | 环境失败：sandbox 阻止 Supabase telemetry；41 pass、20 skipped、1 fail | 18 / 62 / 20 | 1 |
| 应用集成系统环境复验 | PASS | 18 / 62 / 0 | 0 |
| 精确 pnpm 脚本补充首轮 | 环境失败：本批本机 Supabase 已在第一次收尾中停止；41 pass、20 skipped、1 fail | 18 / 62 / 20 | 1 |
| `pnpm run test:integration:app` 最终 | 本机 Supabase 恢复后 PASS | 18 / 62 / 0 | 0 |
| `pnpm run test:integration:db` | PASS | 17 / 529 / 0 | 0 |
| lint | PASS | 全仓库 / 0 warnings | 0 |
| typecheck 首轮 | 环境失败：sandbox 阻止 `tsconfig.tsbuildinfo` 写入 | n/a | 1 |
| typecheck 系统环境复验 | PASS | n/a | 0 |
| db lint | PASS，0 findings | 3 schemas | 0 |
| db types check | PASS，types up to date | 1 check | 0 |
| db drift check | PASS，empty | 1 check | 0 |
| production E2E | PASS | 1 file set / 2 / 0 | 0 |
| `pnpm test` | PASS，无需分片 | 99 / 993 / 0 | 0 |
| `git diff --check` | PASS | 本批 diff | 0 |

首次应用集成与 typecheck 失败均属于本机 sandbox/PATH 边界，不是产品失败；补充精确脚本时的一次失败源于本批已先安全停止本机 Supabase，恢复同一服务后原命令通过。所有环境复验均未修改实现。E2E 两次自动把 `next-env.d.ts` 从 production routes import 改为 dev routes import，均经审计后用精确一行补丁恢复，最终 SHA-256 与基线一致。

## 安全、范围与副作用

- 远端 Provider、staging、Production 连接或写入：0；
- Push、PR、Merge、部署、OAuth、GitHub 测试对象：0；
- migration/schema/RLS/RPC/数据库类型变化：0；
- package/lock/历史 Phase 9.2.4 证据变化：0；
- token、Cookie、Authorization、private key、provider raw payload 持久化：0；
- Local Supabase 在验证结束后已安全停止；
- E2E 工具副作用 `next-env.d.ts` 已精确恢复；
- 最终允许文件仅为 Freeze、use-case 测试、use-case 一行修复和本证据。

## 结论

Phase 9.2.5 已用行为 RED、Local PostgreSQL 回滚事务和全量回归共同证明根因与修复。当前代码具备再次进入 staging Smoke 审核的本地代码前提；本批未自行部署或重新 Smoke。
