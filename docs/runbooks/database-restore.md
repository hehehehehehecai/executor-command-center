# Database Restore Runbook

## 1. 目的与边界

本 Runbook 处理 Postgres/Supabase 数据库恢复。Local 可以用合成数据重复演练；Staging/Production 的真实备份、PITR 和恢复只能在 Phase 8–9 相应门禁后由授权人员执行。本文不是恢复已删除用户/项目的产品功能，也不能绕过 Repository removal 或 Account deletion 承诺。

## 2. 恢复前决策

记录 incident ID、目标环境、目标时间/备份、受影响表、预计数据损失窗口、维护窗口、写入冻结、owner/approver 和回退点。先区分：

- **应用缺陷**：优先回滚应用或 forward-fix，不恢复数据库。
- **schema drift/migration 失败**：停止后续 migration，保留 history，使用兼容 migration 或恢复到隔离目标验证。
- **数据损坏/误操作**：评估 backup/PITR；恢复会造成所选时间点之后的数据丢失。
- **Provider 故障**：不要用数据库恢复代替重试/幂等恢复，参见 [Provider Outage](provider-outage.md)。

## 3. 备份事实与限制

Supabase 托管备份/PITR 的可用性、保留期和恢复点取决于实际 plan 与控制台配置，当前属于外部待确认。恢复期间项目可能不可用，应计划 downtime。数据库备份只覆盖数据库及 Storage 元数据，不自动恢复已删除的 Storage object；自定义 role password 也可能需要重新设置。发布前必须在实际环境回读这些限制。

严禁把数据库密码、connection string、PAT、project ref 或备份内容写入 Git/Issue/普通日志。逻辑 dump 应加密、限制访问并按已确认保留期清理；当前保留期为**待确认**。

## 4. Local 合成恢复演练

Local 的权威恢复来源是 Git 中的 migration 和 `supabase/seed.sql`，不是当前 volume。

```powershell
pnpm install --frozen-lockfile
pnpm run db:start
pnpm run db:reset
pnpm run db:test
pnpm run db:lint
pnpm run db:types:check
pnpm run db:drift:check
$env:SUPABASE_TELEMETRY_DISABLED='1'; pnpm test:integration
```

验收：全部 migration 按序应用；seed 成功；pgTAP、应用 integration、RLS/RPC inventory、database types 和 drift 均通过。测试只使用合成 identity/project/operation，结束后不保留真实数据。

可选的“空 volume”演练只针对已确认可丢弃的 Local project：

```powershell
pnpm exec supabase stop --no-backup
pnpm run db:start
pnpm run db:reset
```

不得使用 `--all --no-backup`，不得对 linked/remote project 执行 `db reset`。

## 5. Staging/Production 恢复流程

### 5.1 停写与取证

1. 冻结部署与 migration；暂停会产生 Sync、Webhook dispatch、AI invocation 和 account deletion side effect 的 worker。
2. 保存只读健康、migration history、queue/retry、关键表计数和 RLS/grant fingerprint；不保存业务正文或 secret。
3. 确认恢复目标与 Auth/Storage/外部 Provider 的一致性边界；决定同项目 PITR、历史备份或隔离新项目恢复。

### 5.2 先恢复到隔离目标

优先把备份恢复到隔离的同级环境并验证：

- migration history 与目标 commit 兼容；
- Auth identity 与 `public.users` 对齐；
- public 表 RLS 启用、敏感 RPC owner/search_path/EXECUTE 正确；
- repository removal、revocation、account deletion tombstone 没有被旧数据复活；
- Energy ledger、Webhook delivery、sync run、AI invocation 的唯一键与状态机一致；
- 其他用户/项目控制组没有跨租户变化。

### 5.3 正式恢复

由平台控制台或经审核的 CLI/Management API 在已确认目标上执行；命令和 secret 不写入本仓库。恢复完成前应用保持维护状态。随后按顺序：

1. 重建必要 role password/replication subscription（如果实际环境存在）；
2. 应用恢复点之后、且已审查为兼容的 forward-only migration；
3. 回读 migration history、RLS、grant、RPC 与类型合同；
4. 恢复应用，最后恢复 worker/dispatch；
5. 对重复 delivery/job 依赖幂等 key，观察 survivor、重复副作用与 Energy delta。

## 6. 恢复后 Smoke

- Auth：登录、会话刷新、防枚举。
- GitHub：一个受控 Installation 的只读仓库列表、First Sync、Webhook replay、Manual Resync。
- AI：一次合成 Brief、缓存重放和 provider failure refund。
- 生命周期：revoked/removed/deletion_pending/deleted 状态不会回退，新工作继续失败关闭。
- UI/API：stale/revoked/partial/failed 可见；CSP/cookie/security error 正常。
- 数据：目标行计数、控制组、ledger、operation tombstone 与 Auth identity 对账。

## 7. 失败回退与升级

如果隔离验证失败，不触碰原环境；记录 mismatch 并选择更早恢复点或 forward-fix。如果正式恢复失败，保持停写，保留平台恢复 receipt，按已验证的前一恢复点再次恢复；不得手工删除约束、关闭 RLS 或跳过 migration history。无法证明生命周期/租户边界时结论为 blocked，不开放流量。

## 8. 证据清单

保存低敏信息：incident/approval、目标环境 fingerprint、backup/restore point fingerprint、UTC 时间、commit/migration manifest、命令退出码、测试分母、数据计数、RLS/grant fingerprint、Smoke 与回滚结论。Production 实际执行证据在 Phase 9 产生；本阶段只提供 Local 合成演练。
