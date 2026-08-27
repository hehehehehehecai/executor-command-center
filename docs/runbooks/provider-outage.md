# Provider Outage Runbook

## 1. 通用原则

先确认故障边界，再停止新增副作用。所有恢复都依赖稳定 idempotency/event/request key，不通过手工改数据库状态、重复扣减或放宽授权来“追绿”。当前仓库没有已验证的生产 SLA、Pager 或自动扩缩容；告警渠道与阈值需在 Phase 8–10 配置和演练。

通用记录：provider、开始/发现 UTC、受影响入口、稳定 reason code、queued/running 数、外部调用数、重试次数、重复副作用、控制组和恢复时间。不要记录 token、cookie、provider body、Prompt、仓库正文、SQL 或 stack。

## 2. GitHub 故障

**信号**：Installation token/API timeout、401/403/404、secondary rate limit、Webhook 延迟或签名失败、sync `partial/failed`、数据 freshness stale。

**用户可见降级**：保留历史数据并标记 stale/partial；不把旧数据显示为 fresh。Installation `revoked` 时显示授权失效并阻止 Sync/AI。

**处置**：

1. 区分平台 outage、rate limit、Installation suspended/revoked、权限漂移和 HMAC 配置错误。
2. 停止 Manual/First Sync 的重复点击放大；依赖数据库限流和既有 idempotency key。
3. queued work 可由 Inngest 重试；worker 在 GitHub read 前重新鉴权。`installation.deleted` 只由验签 Webhook/可信观察触发，不由 UI 状态猜测。
4. 恢复后先用一个合成/受控 Installation 验证 token、仓库列表、同步和 Webhook replay，再逐步恢复对账。

未实现：自动 GitHub 状态页联动和生产告警，需 Phase 10 跟踪。

## 3. Supabase / Postgres / Auth 故障

**信号**：连接/timeout、RPC/transaction failure、Auth session refresh 失败、migration/drift、queue/ledger 写入失败。

**降级**：写接口失败关闭并返回稳定错误；不得切到无 RLS 的备用 direct write。读取无法确认 freshness 时标记 stale/failed。

**处置**：

1. 冻结 migration 和写 worker；区分 Auth、Postgres、PostgREST 与平台控制面。
2. 检查 migration history、RLS/grant/RPC，而不输出 connection string。
3. 事务失败由调用方使用同一 idempotency key 重试；不要创建新 key 规避冲突。
4. 数据损坏才进入 [Database Restore](database-restore.md)；普通 outage 不恢复旧备份。
5. 恢复后验证 Auth、RLS、rate buckets、sync/brief/lifecycle 状态机和控制用户。

## 4. Inngest 故障

**信号**：dispatch 失败、event backlog、worker timeout、retry exhausted、签名失败。

**降级**：API 只有在持久/dispatch 合同成立时返回 receipt；未派发不显示完成。GitHub delivery 保持可重试状态，不能提前 complete。

**处置**：

1. 暂停新增昂贵工作，记录稳定 event/job ID 与 generation。
2. 重放相同 event ID；Sync/Brief/Webhook/Account deletion 由数据库 claim/version 保证单赢家。
3. Account deletion 有限 worker retries 耗尽后写持久 recovery marker；scanner 基于 DB UTC、due/eligible/status/generation/lease 重新派发。dispatch 失败可再次扫描，deleted replay No-op。
4. 恢复后对账 queued/pending/running、dispatch receipt、重复副作用和 control installation。

未实现：生产 scanner/worker 告警是否部署需 Phase 8–10 外部验证。

## 5. AI Provider 故障

**信号**：timeout、5xx、invalid JSON/schema、Evidence mismatch、latency spike、quota/reservation failure。

**降级**：已有 validated brief 可读取；新生成失败显示可安全重试，不把未验证输出持久化。Provider 原始错误映射为稳定 reason code。

**处置**：

1. 生成前 authorization 与 Energy reservation 必须成功；provider 调用前再次鉴权。
2. timeout/invalid output 不写完成 brief；按现有合同释放/退款 reservation，重复重试不重复 ledger side effect。
3. 缓存命中返回等价结果，不调用 Provider、不重复扣减。
4. 恢复后用合成 Prompt 执行成功、schema rejection、failure refund、cache replay；确认 Prompt injection 不传播工具/Secret 请求。

当前没有多 Provider 自动 failover；不得把手工切换写成已实现。

## 6. Vercel / 部署平台故障

**信号**：5xx、edge/proxy 异常、SSR render 失败、CSP nonce 不匹配、环境变量缺失、deployment rollback。

**降级与处置**：冻结新部署，回滚到前一已验证 immutable build；不要修改 CSP 为 `unsafe-inline/unsafe-eval`。回滚后验证 `/`、`/auth/error`、404、动态页 scripts nonce 与 response CSP 一致，检查 Supabase cookie/session、API safe errors 和 webhook route。匿名 OAuth WAF/限流依赖平台可信身份，配置未回读前保持 external confirmation required。

## 7. 恢复验收

每个 Provider 至少证明：新请求成功/失败边界正确；积压按稳定 ID 收敛；重复副作用 0；跨租户变化 0；Energy 非授权消耗 0；revoked/removed/deleted 状态不回退；日志/错误无敏感原文。未取得外部平台证据时只能标记“待确认”，不能宣称恢复完成。
