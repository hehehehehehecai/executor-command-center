# Phase 9.2.11 Push 精确提交 Lineage 修复证据

## 1. 裁决

- 总体：`PASS`。
- 修复范围：仅本地代码、测试、Freeze 与本 evidence；远端副作用 `0`。
- 根因：经签名验证的 Push `after` SHA 已存在于 `WebhookInternalEvent.githubObjectId`，但在 Webhook runtime 构造 BackgroundJob 时丢失；commit reader 又没有专用 target SHA，因此非默认分支 Push 会读取默认分支并可能错误 completed。
- 最小修复：把规范化 SHA 作为 `pushAfterSha` 写入严格 Webhook delivery lineage，仅传给 commit reader；target 缺失时复用安全 `github_activity_not_found` 终结 SyncRun，并使 delivery 进入 failed 而不是 completed。
- 未新增 migration、数据库类型、依赖、环境变量或远端配置。

## 2. 批次、基线与 Freeze

- batch：`explorer-stage3-phase9-2-11-push-ref-lineage-2c491284`。
- prompt：`explorer-stage3-phase9-2-11-push-ref-lineage-repair-2c491284`。
- authorization envelope：`workflow-authorization.v1:2c49128457f9a6d5`。
- 来源审核票据：`sha256:2c49128457f9a6d540d09083fc24c296fcbda1aece5df239799f3b8e03b9fe37`。
- blocker：`sha256:c4ed9ac4539331e611b345ec6f69034cd59143fb280fca58f26a5cc7c8ed866d`，轮次 `1/5`。
- baseline HEAD：`f395153dbf6493dcad2cee1c7cfa26b2201d5d99`。
- tree：`7d5328cb1c25ed1b1857bb378682f105950542dc`。
- parent：`6b82a1a875ac86ba65041f82bed409b6a9714a2b`。
- message：`test(sync): record blocked staging synchronization smoke`。
- 初始工作区：干净。
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-11-push-ref-lineage-freeze.json`。
- Freeze SHA-256：`e9e7665d041453836186f315d265f2ef6a982580c265c93a7b6e2329b59b3707`。
- Freeze 创建后未回写。

## 3. 确定性 RED

首次有效 RED 命令针对 6 个直接文件执行 145 项测试：

```text
Test Files  5 failed | 1 passed (6)
Tests       8 failed | 137 passed (145)
Exit        1
```

8 个预期失败分别证明：

1. 全零 deletion Push SHA 被旧 parser 当作普通 commit；
2. BackgroundJob 不接受带 `kind/pushAfterSha` 的新严格 lineage；
3. Webhook runtime 未派发 `kind/pushAfterSha`；
4. REST commit 请求缺少 `sha` query；
5. project sync 无法接受新的 Push job；
6. project sync 未把 target 仅传给 commit group；
7. target 缺失时未产生安全失败；
8. delivery 仍可能被错误 completed。

最初使用 `pnpm exec vitest` 时因隔离 shell PATH 未找到 `vitest`，没有进入测试，未计作 RED；随后使用 workspace 的实际 Vitest CLI 取得上述确定性失败。

## 4. 实现合同

### Push 规范化

- Push `after` 必须为恰好 40 位小写十六进制且不能是 40 个零。
- uppercase、长度错误和 deletion sentinel 均返回 `github_webhook_payload_invalid`。
- 不保存 raw payload；仍只使用既有 `githubObjectId`。

### BackgroundJob lineage

- 新字段：`kind`、`pushAfterSha`。
- `eventName=push` 必须对应 `kind=github.push.v1` 且 `pushAfterSha` 为合法 SHA。
- Issue/PR/Release/Workflow/Repository 必须 `pushAfterSha=null`。
- eventName/kind 不一致在建立 durable sync request 前拒绝。
- legacy 非 Push Webhook lineage 继续解析；legacy Push 因没有可信目标 fail closed。
- exact-key 与 repository/installation/full-name/version 校验保持。

### Reader 与执行器

- 新建专用 `GitHubCommitReadRequest`，只有 `listCommits` 接受可选 `targetSha`。
- target 存在时，GitHub commits endpoint 只新增 `sha=<40hex>`，并保留 `since` 与分页边界。
- target 不存在时 query 与旧实现相同。
- `ExecuteProjectSynchronization` 只对 commit group 传递 target；其他五组收到通用 request。
- commit 结果必须含精确 target SHA，否则 SyncRun 以安全 `github_activity_not_found` 进入非 completed 终态。
- Webhook runtime 对该 Push 特定失败调用现有安全 fallback，使 delivery failed 而不是 completed。
- target 存在时正常 upsert 并 completed；已 completed Push job replay 不再调用 reader 或 writer。

## 5. GREEN 与分母

### 直接与相邻测试

- 首轮 GREEN：6 文件、145/145、Exit 0。
- 范围修正后：6 文件、146/146、Exit 0。
- 最终加入 Push terminal replay：6 文件、147/147、Exit 0。
- 相邻 Webhook/Inngest/reader/reconciliation 集合：12 文件、193/193、Exit 0。
- module boundaries 独立门禁：1 文件、36/36、Exit 0。

### 全量与集成

- 最终 `pnpm test`：99 文件、1016/1016、skip 0、Exit 0。
- application integration：18 文件、62/62、required skip 0、Exit 0；最终代码复验同为 18 文件、62/62。
- Local Supabase pgTAP：18 文件、570/570、Exit 0。
- production E2E：2/2、Exit 0；最终代码复验同为 2/2。

### 静态与数据库

- lint：Exit 0。
- typecheck：Exit 0；为避免受限工作区写 `tsconfig.tsbuildinfo`，使用等价 `tsc --noEmit --incremental false`，最终代码再次复验 Exit 0。
- db lint：0 error，Exit 0。
- generated database types：up to date，Exit 0。
- schema drift：empty，Exit 0。
- `git diff --check`：Exit 0。

## 6. 环境失败与安全复验

1. `pnpm exec vitest` 与首次 `pnpm run typecheck` 因隔离 shell没有 Node/workspace `.bin` PATH 而未运行目标工具；改为显式 bundled Node/workspace CLI，未修改仓库配置。
2. 首次有效 typecheck 发现两个测试类型错误并同时遇到增量缓存写权限；测试夹具改成完整 `GitHubCommitReadModel`，reader 测试类型加入 `targetSha`，随后用 `--incremental false` 通过。
3. E2E 两次把 `next-env.d.ts` 改成 dev routes import；每次均直接 diff 证明来源并恢复为 HEAD 的精确 CRLF blob `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38`、SHA-256 `4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。
4. Local Supabase 启动输出的仓库既有本地演示凭据没有复制到本 evidence；服务在验证后安全停止。
5. 无 application integration 失败或 required skip，未消耗产品失败复验额度。

## 7. Scope 与受保护指纹

- 实际产品/测试改动：12 文件，最终代码 diff 为 181 insertions / 14 deletions（evidence/Freeze 另计）。
- 所有实际路径都属于不可回写 Freeze 的 `allowedPaths`。
- 未修改 `src/application/webhooks/ingest-github-webhook.ts`；其 strict exact-key 行为由测试保留，eventName/kind 一致性在已冻结 Webhook runtime 完成。
- `package.json`：`f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468`，未变。
- `pnpm-lock.yaml`：`a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef`，未变。
- migration tree：`8343afc72903200790cfef0533fadb5e2c13564cf9dbe5a6ee286b537ae06890`，未变。
- Phase 9.2.10 Freeze/evidence 指纹未变。
- 无 migration、RLS、RPC、数据库类型、UI、环境变量或依赖变化。

## 8. 安全与远端动作

- 强特征扫描在完整变更文件中得到 3 个候选行，均为 HEAD 基线已存在的 Authorization header 构造或合成测试值；相同规则的基线候选同为 3，本批新增 diff 候选为 0。实际秘密值与新增敏感字面量命中均为 0。
- raw webhook payload、header、token、Cookie、repository 源码内容均未写入 lineage、日志或 evidence。
- Git Push：0。
- deployment：0。
- 远程 Supabase/GitHub/Vercel/Inngest 调用或配置变更：0。
- GitHub 测试对象：0。
- Production、付费、Trial：0。

## 9. 残余风险与下一建议

- 本批只提供本地确定性证据，没有执行 staging live retry，符合授权边界。
- 下一步应由独立审核验证本 commit；通过后创建新的 staging Smoke 批次，用全新 run_id 证明非默认分支 Push 的精确 after SHA 进入 `github_commits`，并继续剩余 Issue/PR/Release/Workflow、duplicate、漏投与 Reconciliation 门禁。
