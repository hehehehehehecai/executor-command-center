# Project Brief Phase 10：可观测性与隔离 Staging Smoke

## 目的与边界

本 Runbook 只验证 Project Brief 的脱敏观测合同和既有隔离 Staging 成功链。它不允许接触 Production、真实用户项目、完整 Prompt、Evidence 正文、Provider 原始响应或任何 Secret 值。

版本绑定：

- Observation：`project-brief-ai-observation.v1`
- Smoke：`project-brief-staging-smoke.v1`
- Phase 9 Dataset：`83b64904bb184ba35bc9cb965de5560202794adfe41df4974cb6091a05028fdb`
- Phase 9 Result：`9db13d98a88f4f33752885afa13c589a52f5364f725c334030f332e2bee0bb70`

## Observation 合同

实际 Provider 调用由 `ai_invocations`、对应 `energy_reservations` 和成功时的 `project_briefs` 只读组合为严格 Observation。输出仅包含：调用/关联 ID、User、Feature、Project、Provider/Model、Prompt/Schema Version、Evidence 与 Cache Key Fingerprint、Token、Latency、Cost、Cache、Provider Attempt、Quota Charge、Terminal Status、Failure Stage/Code 和时间戳。

Cost 只接受已持久化的 `cost_microunits`。供应商没有可信单价时必须输出 `{ amountMicrounits: null, basis: "unavailable" }`，不得估算。

标准失败阶段为：

- `provider`：传输、供应商失败或空输出；
- `parse`：非空输出无法解析为 JSON；
- `schema`：JSON 可解析但不满足 Project Brief Schema；
- `evidence`：Schema 合法但 Evidence Validation 失败；
- `persistence`：原子保存、扣点或幂等最终化失败。

任何 Observation 都不得包含 API Key、Authorization/Cookie、完整 Prompt、raw response、Evidence 正文、私有文档或原始异常堆栈。

## 本地门禁

在任何外部操作前，必须全部通过：

1. Phase 9 v3：5 files / 44 tests，`releaseGate=passed`，两个 Fingerprint 精确匹配；
2. Phase 1–9 相关回归和全量 Vitest；
3. `typecheck`、`lint`、`git diff --check`；
4. `db:reset`、`db:test`、`db:lint`、`db:types:check`、`db:drift:check`；
5. 变更内容 Secret/私有正文扫描；
6. 一个本地实现 commit，工作区干净。

## Staging 前置证明

以下字段必须由只读元数据填入 `ProjectBriefStagingPreflight`，不得读取 Secret 值：

- 目标为 `staging` + `preview`；
- Staging 与 Production 的项目标识明确不同；
- `implementationCommit === deployedCommit`；
- `rollbackCommit !== implementationCommit`，且回滚路径已冻结；
- 测试 User/Project 仅保存 SHA-256，不得使用真实用户；
- `deepSeekSecretConfigured=true` 只表示受保护配置存在；
- 费用属于既有免费或已配置额度；
- 同一 Artifact 可稳定重放并命中缓存；
- 全部本地门禁已通过。

任一项不可证明，必须在真实调用前停止。尤其是 Phase 3 Evidence Fingerprint 绑定 `now/evaluatedAt`；如果 HTTP 重放会重新构建 Artifact，不能证明相同 Fingerprint，就必须返回 `stable_artifact_replay_unavailable`，不得用相同 `requestKey` 冒充缓存命中。

## Smoke 顺序

仅在 Preflight 为 `ready` 后执行：

1. 记录部署前 Staging SHA 和回滚 SHA；
2. 通过既有路径部署唯一实现 commit，并只读核对运行时 SHA；
3. 固定测试 User/Project 发起一次冷请求；
4. 验证 `generated`、扣 3 点、唯一 Invocation、唯一 Completed Brief；
5. 只读读取 Observation，验证 `cacheStatus=miss`、`providerAttempted=true`、`quotaCharge=3`、lineage 和安全字段；
6. 对逐字段相同且能产生相同 Artifact Fingerprint 的请求重放一次；
7. 验证 `cache_hit`、同一 Brief、0 点、无新 Invocation、Provider 成功调用总数仍为 1；
8. 扫描脱敏证据，恢复临时配置，确认无活动任务或额外调用。

不为制造失败而调用真实 Provider。Provider/Parse/Schema/Evidence/Persistence 的失败关闭由本地确定性测试证明。

## 停止与报告

- 环境或 Artifact 重放不可证明：`PHASE_10_LOCAL_COMPLETE_STAGING_BLOCKED`；
- 全部本地与真实隔离 Staging 门禁通过：`STAGE_5_COMPLETE`；
- 不得把 `blocked` 改写为 `passed`，不得因此访问 Production 或要求用户再次确认 Brief。

Smoke 证据只记录批次、实例、实现/部署/回滚 SHA、脱敏 User/Project hash、不可复用 correlation ID、Provider attempt、Cache、Quota、Token、Latency、Cost basis、Terminal/Failure Stage、Phase 9 Fingerprints、配置恢复与残留检查。严禁记录私密 URL 参数、Header、Cookie、Token、Secret、raw payload 或完整日志。
