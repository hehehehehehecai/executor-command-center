# 探索者号｜阶段 3｜Phase 9.2.13 Inngest Webhook Consumer Step 本地证据

## 批次与基线

- 批次：`explorer-stage3-phase9-2-13-inngest-webhook-consumer-1628d923`
- prompt：`explorer-stage3-phase9-2-13-inngest-webhook-consumer-repair-1628d923`
- 授权信封：`workflow-authorization.v1:1628d923a79f391d`
- 来源审核票据 / blocker：`sha256:1628d923a79f391d4b158d188dfbaf1f550545a7f708ace95c627632f995a0e3`，轮次 `1/5`
- 基线 commit / tree / parent：`d6e4324c64d21abddcccc44cdac80cf8df7af77b` / `5b75d6d4af20c5b6347654ee18e2ea253d4d3801` / `f085e8380f9abfe5cfdd8a6db8346973d6fca945`
- Phase 9.2.12 Freeze / evidence：`c7fdadaa259a006321fc1aa401372f17846adc0ef66e467fb2aa60c91f038605` / `05f91ed85f3c9f916eb60bdf6d454ad1e45bed0ecf9c0216ef59029d91fe01a9`
- 本批 Freeze：`tests/fixtures/synchronization/stage3-phase9-2-13-inngest-webhook-consumer-freeze.json`
- Freeze SHA-256：`423ddcc93fab891d505e203978f850ffd1f19877d97711117d540c16e78ee332`
- 远端副作用：`0`

## Inngest 4.15.0 合同证据

本地安装版本为 `inngest@4.15.0`。直接读取安装包类型与实现确认：

- `createFunction` 接受当前 singular `triggers` 对象并规范化为 trigger 列表，现有注册方式有效；
- `step.run` 在 SDK execution engine 的 async-checkpointing 流程中形成 `StepRun` operation；
- `step.sleep` 形成可持久化、可 memoize 的 `Sleep` operation；
- 当前安装未包含 `@inngest/test` 或 `@inngest/test-harness`，因此测试使用安装包真实 `InngestFunction.createExecution` execution engine 作为最接近 production 的确定性边界；没有创建自定义假 handler；
- route 的 `GET/POST/PUT` 仍由 `serve` 绑定同一 client 和 project/webhook/daily 三函数。

## 确定性 RED 与根因

发送端的真实顺序为：取得 Inngest provider receipt 后，才将 delivery 从 `dispatching` 完成到 `dispatched`。修复前 consumer 的首个 operation 直接是 `request-webhook-sync` 的 `StepRun`，因此 provider 可以在 delivery 仍为 `dispatching` 时启动业务 request；`WebhookSynchronizationRuntime.request` 对该状态 fail closed 为 `github_webhook_dispatch_not_ready`。

RED 使用固定合成 Push event envelope，字段完整覆盖 `github-webhook-event.v1`，不含真实 payload 或秘密。安装版 execution engine 的首个 operation 实际为 `StepRun`，而测试要求首个 operation 为 readiness `Sleep` 且业务 request 调用为 0。结果：`8` 项中 `7` 通过、`1` 预期失败，退出码 `1`。补全负例后，修复前为 `11` 项中 `8` 通过、`3` 预期失败：step 排序、kind/eventName 不一致、全零 Push SHA。

首个尝试 `pnpm exec vitest` 因受限 Windows PATH 未发现 `vitest`，退出码 `1`，未进入测试；使用工作区固定 Node 与本地 `vitest.mjs` 做唯一等价复验后取得上述产品 RED。

## 最小修复

只修改 Inngest runtime 边界：

1. Webhook function 先执行 durable `step.sleep("await-webhook-dispatch", "1s")`，再执行原 `step.run("request-webhook-sync", ...)`；保留 retries=5、idempotency=`event.data.eventId`、concurrency key=`event.data.deliveryId`。
2. consumer handler 在调用业务 runtime 前复核 eventName/kind 映射；Push 只接受非全零、40 位小写十六进制 after SHA 与 `action=null`。
3. 不修改 route、dependency composition、数据库、migration、RPC、payload 合同、依赖或 lockfile。

1 秒是 durable ordering grace，不是业务超时：正常 sender 会在 `send` 返回后立即完成 dispatch；完成失败时，后续 request 仍按既有安全错误和 Inngest retry 合同处理。

## Production-like GREEN、重放与负例

- 首轮 execution：`Sleep`，业务 request `0` 次；
- Sleep memoized replay：`StepRun`，业务 request 精确 `1` 次；
- Sleep + StepRun memoized replay：`RunComplete`，业务 request 仍精确 `1` 次；
- 完整合法 Push envelope：接受；
- extra field：在 request/claim 前拒绝；
- eventName/kind 不一致：在 request/claim 前拒绝；
- 全零 Push SHA：在 request/claim 前拒绝；
- first_sync、webhook project job、reconciliation、manual 四类 executor 路由保持；daily cron 保持 `0 2 * * *`；
- project/webhook/daily 三函数和 Next route `GET/POST/PUT` 生产引用保持。

## 测试与静态门禁

| 门禁 | 结果 | 分母 / skip |
| --- | --- | --- |
| Inngest runtime GREEN | PASS | 11/11，skip 0 |
| route + composition + runtime | PASS | 3 文件，14/14，skip 0 |
| webhook / project sync / first sync / reconciliation / Push lineage 相邻回归 | PASS | 9 文件，141/141，skip 0 |
| module boundaries 独立 | PASS | 36/36，skip 0 |
| 全量单元首轮 | 环境失败 | 313.5 秒外层超时，exit 124；扫描项曾耗时 51.2 秒 |
| 全量单元唯一等价复验 | PASS | 99 文件，1020/1020，skip 0 |
| application integration 定向 | PASS | 7/7，required skip 0 |
| application integration 全量 | PASS | 18 文件，62/62，required skip 0 |
| Local Supabase pgTAP | PASS | 18 文件，570/570 |
| lint | PASS | exit 0，warnings 0 |
| typecheck 首轮 | 环境失败 | `tsconfig.tsbuildinfo` 写入 EPERM，exit 2 |
| typecheck 唯一等价复验 | PASS | exit 0 |
| db lint | PASS | errors 0 |
| db types check | PASS | up to date |
| db drift | PASS | empty |
| production E2E | PASS | 2/2，skip 0 |
| `git diff --check` | PASS | errors 0 |

Local Supabase 在 application integration 与 pgTAP 后已安全停止。`supabase-selected-repository-writer` 的历史 required skip 问题通过显式本地 Node、Docker 和 CLI PATH 注入闭合；未修改产品逻辑、测试 skip 或凭据发现合同。E2E 自动把 `next-env.d.ts` 指向 dev routes，已在 blob 相等证明后精确恢复到基线 SHA-256 `4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。

## 范围与安全

最终产品/测试变更限于：

- `src/infrastructure/jobs/inngest-runtime.ts`
- `src/infrastructure/jobs/inngest-runtime.test.ts`
- 本批不可回写 Freeze
- 本 evidence

受保护的 route、composition、Webhook application runtime、migration、生成类型、package、lockfile、`next-env.d.ts` 与 Phase 9.2.12 资产均零变化。未连接或写入 GitHub、Vercel、Inngest、远程 Supabase；未执行 redelivery、Manual Resync、Push、部署或其他仓库操作。

本批 diff 的强特征 credential/JWT/private-key/Cookie/Authorization/provider-secret 值扫描为 0。测试仅包含合成 key 标识和一个空的 `rawPayload` 负例字段，不包含真实值或原始 provider body。

## 残余风险与下一建议

本地真实 SDK execution engine 已覆盖 `Sleep → StepRun → RunComplete` 与 memoized replay；未覆盖 Inngest Cloud 调度器到 Preview HTTP 的真实网络边界，因为本批远端副作用预算为 0。下一步只能在独立审核通过后创建新的 staging Smoke 单元，验证固定 delivery 后续能从 `dispatched` 推进到 claim、Webhook SyncRun、project dispatch、目标 after SHA snapshot 与 delivery terminal state；本批不进入该 Smoke。
