# Phase 9.2.15 Release Webhook Consumer 诊断与修复证据

## 身份与基线

- 批次：`explorer-stage3-phase9-2-15-release-consumer-14802702`
- 授权信封：`workflow-authorization.v1:9d40fd841f42769e`
- 来源审核票据：`sha256:148027028e0cab0394e4aa65e13c198fc639f50b9327996c747f3b53037a697f`
- 基线：`9d40fd841f42769e94873a920a540c4a18a98fe8`，tree `fa56204cd1d1cf5ba66f8a45838160beaff7ad21`，parent `2a430601ff4796927291006b483abfc797806b88`
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-15-release-consumer-freeze.json`
- Freeze SHA-256：`8c515040adb52dc56451a033fb5f35f098bf4c43ad8697536b088dc45af8ea64`
- 远端写入：0

## 真实只读运行轨迹

固定 Release delivery `263e3250-9626-11f1-98f3-7a6dc91ee73f` 的 Inngest run 为 `01KZTGQ5D9P64QSPSTPY9NGFR0`。函数 `executor-command-center-executor-github-webhook-consumer` attempt 0 完成；`await-webhook-dispatch` Sleep 和 `request-webhook-sync` StepRun 均完成且无重试。事件的安全规范字段为 `release / github.release.v1 / published / object 369085554 / processingVersion 2`。

同一 Release 操作还产生 `created`、`prereleased` 与 tag Push delivery。它们的 Inngest consumer 均完成，但数据库只为 `prereleased` delivery `26302890-9626-11f1-803c-6d8162d9e212` 建立并完成 SyncRun `e379b72b-bada-4c45-8efd-d8c3a12af9a4`。固定 `published`、`created` 与 tag Push delivery 均停在 `dispatched/version 3`、`sync_run_id=null`、safe error null。

权威断点因此不是 Sleep、StepRun、route 206 或 Release payload 校验，而是并发请求进入 `public.request_project_sync` 后的 Project 级 coalescing：后续 identity 收到已有活动 run 与 `dispatchState=dispatched`，应用把它当作成功的 `coalesced` 返回，Inngest 随即把 StepRun memoize 为完成；该 delivery 没有 claim，也没有自己的后续 job 能把它推进到 terminal。

## TDD RED 与根因

环境首轮命令因 PATH 缺少项目 `vitest`/`node` 分别 Exit 1；改用已安装 Node 的绝对路径后，真实 RED 为：

- 文件：`src/application/synchronization/webhook-sync-use-cases.test.ts`
- 分母：9；通过 7，失败 2，skip 0，Exit 1。
- 两个失败均为：预期 `github_webhook_sync_coalesced` 可重试异常，实际 Promise 正常返回 `{ outcome: "coalesced", syncRunId, providerJobId: null }`。
- 此时 delivery claim 0、provider dispatch 0。

安装版 `inngest@4.15.0` 的 `InngestFunction.createExecution` 证明：Release `published/created/prereleased` 均按 `Sleep discovery → Sleep memoized → StepRun discovery → RunComplete` 执行，并且同一成功 Step memoized replay 不重复调用业务 request。Step 抛错时，SDK 产生 `step-ran / StepError`，保留 retry，而不是 RunComplete。

## 最小修复

仅在 `WebhookSynchronizationRuntime.request()` 增加一条产品分支：当 `SyncRequestReceipt.outcome === "coalesced"` 时抛出稳定低基数错误 `github_webhook_sync_coalesced`。既有 Inngest function 的 `retries: 5` 会持久重试同一 event/step；活动 run 结束后，同一 delivery identity 再次请求可建立自己的 SyncRun、claim delivery 并 dispatch 一次。

未修改数据库、migration、provider route、Inngest function 配置、依赖或 lockfile。same-identity duplicate、completed delivery replay、Push after SHA、First Sync、manual 与 reconciliation 语义保持不变。

## GREEN 与回归

- 直接 GREEN：2 文件、24/24、skip 0、Exit 0。
- production-like Release：`published/created/prereleased` 3/3；每个业务 request 1 次；memoized replay 额外 request 0。
- coalesced retry：首次 claim 0/dispatch 0 并产生 StepError；后续 `new` receipt claim 1、dispatch 1。
- 相邻回归首轮：183/184；唯一 module-boundary 子进程固定 10 秒环境超时。完全相同唯一复验：36/36、Exit 0。
- 全量单元：99 文件、1026/1026、skip 0、Exit 0。
- application integration 首轮：18 文件中 11 通过、7 失败，41 通过、20 skip；统一根因是子进程 PATH 缺少 `node` 且 Local Supabase 未启动。显式注入本地 Node/Supabase CLI 路径并启动本地栈后唯一复验：18/18 文件、62/62、required skip 0、Exit 0。
- Local Supabase pgTAP：18 文件、570 tests、全部通过。
- lint：Exit 0。
- typecheck 首轮：测试夹具字面量推断过窄且 `tsconfig.tsbuildinfo` 写权限失败；夹具显式绑定既有 `SyncRequestReceipt` 类型，`tsc --noEmit --incremental false` Exit 0。
- db lint：0 error，Exit 0。
- database types：up to date，Exit 0。
- schema drift：empty，Exit 0。
- production E2E 首轮：Next.js 本地 lockfile access denied，未进入业务断言；系统边界同命令唯一复验：2/2，Exit 0。
- Local Supabase 已停止；临时配置目录已删除；Next 自动改写的 `next-env.d.ts` 已精确恢复。

## 范围与安全

实际产品改动只有 `src/application/synchronization/webhook-sync-use-cases.ts` 一行；测试改动限于该用例及安装版 Inngest execution-engine 覆盖。Freeze 未回写。`package.json`、`pnpm-lock.yaml`、`next-env.d.ts`、migration tree、Phase 9.2.14 Freeze/evidence 均保持受保护指纹。

本批 diff 的强特征 token、private key、JWT、Cookie、Authorization、raw payload/header 扫描为 0。未执行 Push、部署、redelivery、Manual Resync、远程数据库写入、Provider 配置变更或测试仓库对象操作。

## 结论

本地确定性证据支持 PASS：真实根因已闭环，最小修复使 coalesced delivery 保留为可重试 StepError，后续只会建立并 dispatch 自己的逻辑 run 一次。是否进入下一 staging Smoke：否，停止并等待审核。
