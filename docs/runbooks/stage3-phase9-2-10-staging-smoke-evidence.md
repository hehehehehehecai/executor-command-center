# Phase 9.2.10 隔离 staging 完整 Smoke 脱敏证据

## 1. 裁决

- 总体：`BLOCKED`。
- 直接阻塞：Gate 2 的 Push 已完成 provider object、Webhook delivery、stable event、consumer、Webhook SyncRun、project dispatch、repository snapshot 更新，但 Push 的精确 `after` SHA `2282e735a8d8751c40ca9376616274739a8182a9` 未进入 `github_commits` snapshot。对应 SyncRun 已是 `completed`，等待不会改变结果。
- 硬停止：未创建正常 Issue、PR、Release、Workflow；未做 duplicate redelivery；未执行受控漏投、配置修改或 Reconciliation。
- 不能宣称阶段 3 完成；不得进入阶段 4。

## 2. 批次与不可回写 Freeze

- 批次：`explorer-stage3-phase9-2-10-staging-smoke-441f33cb`。
- prompt：`explorer-stage3-phase9-2-10-full-staging-smoke-441f33cb`。
- 授权信封：`workflow-authorization.v1:441f33cba2bf3382`。
- 来源审核票据：`sha256:441f33cba2bf3382abdae15ef7d880c2f255d114c6f83a92a3edc4b7204ef2af`。
- run_id：`stage3-phase9-smoke-20260812T020232Z-41e9892f`。
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-10-staging-smoke-freeze.json`。
- Freeze SHA-256：`52787de6d5d35a7c9a8f719d4c781d16deef4319d23dc2d840f99f637bf0e2df`。
- Freeze 创建后未回写。

## 3. 基线与受保护指纹

- branch：`feature/stage3-phase8-data-freshness-ui`。
- commit：`6b82a1a875ac86ba65041f82bed409b6a9714a2b`。
- tree：`c2061175fbf3f6d63977364a8b028b473a5f9b10`。
- parent：`73291f51e74dd5cbb965d2e5a15c0fd6f7d69d8b`。
- message：`fix(sync): recover stale queued sync requests`。
- 初始工作区：干净。
- Phase 9.2.9 Freeze：`39fe60dccf794b7218853c7b5c3e4824d3339507ab51473d58067b583374aced`。
- Phase 9.2.9 evidence：`dfcaf3f5c8af2697351b3a26d203b749e61fa860ab896ddfb7b53751998d7a15`。
- migration：`6b88fb7e52651468b66e14e15c800ae6e28254a76369946c49aa62910f1a2884`。
- `package.json`：`f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468`，未变。
- `pnpm-lock.yaml`：`a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef`，未变。
- `next-env.d.ts`：E2E 将 production routes import 自动改成 dev routes import；直接 diff 证明来源后，精确恢复至基线 SHA-256 `4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。

## 4. Provider 预检与部署

### GitHub

- 账号：`hehehehehehecai`。
- App ID：`4480141`；installation ID：`151329457`。
- installation：selected-only，selected repository count `1`。
- 唯一仓库：`hehehehehehecai/explorer-staging-private-test-20260804`，repository ID `1322569219`，private，default branch `main`。
- 权限：actions/checks/contents/issues/metadata/pull_requests 均为 read。
- 事件：issues、pull_request、push、release、repository、workflow_run。
- Webhook：Active；SSL verification enabled。

### Vercel

- plan：Hobby；project：`prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`。
- 精确 fast-forward：`5b730d4e1e8d62837ee75d645d428bdfab0ec35e` → `6b82a1a875ac86ba65041f82bed409b6a9714a2b`，一次，未 force。
- deployment：`dpl_FjZUo9QYfNGUfLHMzcduxf97Ynoz`。
- deployment URL：`https://executor-command-center-1eklqxgmd-hehehehehehecais-projects.vercel.app`。
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`。
- 状态：READY；branch `staging`；完整 commit `6b82a1a875ac86ba65041f82bed409b6a9714a2b`；target `null`，即 Preview、非 Production。
- 最终 `origin/staging` 只读复核仍为 `6b82a1a875ac86ba65041f82bed409b6a9714a2b`。

### Supabase

- ref：`gsnuorsqdcdszjxtymhs`；staging；Free；ACTIVE_HEALTHY。
- `supabase db push --linked --dry-run` 只列出 `20260811093237_recover_stale_queued_sync_requests.sql`。
- 单一 forward-only apply Exit `0`；远端 ledger 从 15/16 到 16/16。
- apply 后 Docker catalog cache 警告仅影响本地 catalog cache；权威 ledger 复核为 16/16。
- 未手工修复任何远端 SyncRun，未执行任意业务表 INSERT/UPDATE/DELETE。

### Inngest

- environment：`staging-7050a935`；工作区 `hehehehehehecai / staging`；Free。
- app：`executor-command-center`；SDK `4.15.0`；Active。
- 自动同步 URL：`https://executor-command-center-1eklqxgmd-hehehehehehecais-projects.vercel.app/api/inngest`。
- Vercel deployment：`FjZUo9QYfNGUfLHMzcduxf97Ynoz`；commit ref `staging`；commit `6b82a1a`。
- 函数 3 个：`executor-project-sync-consumer`、`executor-github-webhook-consumer`、`executor-daily-reconciliation`。
- cron：`0 2 * * *`。
- Runs 页面安全只读视图没有返回具体数据行；未扩大到 event payload、key 或私密日志。

## 5. run_id 零碰撞

- 本地 evidence：0。
- Issue/PR：0。
- branch：精确 404。
- tag：精确 404。
- Release：精确 404。
- workflow 文件：默认分支初始不存在，因此 workflow run 0；未提前创建 main 单文件例外。
- 首次零碰撞批处理把预期 404/`rg` Exit 1 汇总成组失败；后续改为逐项只读确认，未更换 run_id、未发生写入。

## 6. Freeze 时数据库基线

- Project：`81630aa3-a101-421c-b31e-dc16d1592c31`，存在。
- 历史 SyncRun：3；project dispatch：0。
- snapshot：repository/commit/issue/pull_request/release/workflow_run = `1/1/0/0/0/0`。
- 旧 run `06070d6a-23e2-44ba-8db2-90a4c644e8ea`：queued/version 1；started/last_progress/finished/progress_cursor 全空；error null。

## 7. Gate 1：Authenticated First Sync

### 认证前置

- 首次页面检查发现 session 已过期：`authenticated=false`；在任何 First Sync 请求前暂停。
- 用户完成 staging GitHub OAuth 后只读复核：`authenticated=true`；installation `active`；selected repository count `1`；唯一选仓和 Project 均匹配。

### 正式请求

- request identity：`stage3-phase9-smoke-20260812T020232Z-41e9892f-first-sync`。
- 首次 POST：HTTP `202`，`first_sync_accepted`。
- SyncRun：`334b6ea0-53b3-4ce4-ac15-87566c806dbf`。
- 业务终态：completed；version 10；error null；error summary null。
- 时间：queued `2026-08-12T02:16:44.15791Z`；started/last_progress/finished `2026-08-12T02:16:46.22Z`，满足 `last_progress_at >= queued_at`，718 微秒缺陷未回归。
- cursor：非空；contract `first-sync-cursor.v1`；top-level keys 精确记录但未保存 raw cursor。
- completed groups：repository、commit、issue、pull_request、release、workflow_run；failed group null；6/6。
- provider job ID：仅记录长度 26 和 SHA-256 `5bfea202d65178138fcabab663e55bc80a3366244648946a906226182e218b2d`，不记录原值。
- 初始 snapshot：`1/1/0/0/0/0`，与当时仓库事实一致。

### Replay

- 同 identity replay：HTTP `200`，`first_sync_reused`，result `duplicate`。
- 返回同一 SyncRun/job ID；identity 对应 run 数仍为 1；run 仍 completed/version 10；snapshot 仍 `1/1/0/0/0/0`。
- 新 SyncRun 0、新 snapshot 0；PASS 1/1。

## 8. Phase 9.2.9 stale queued recovery 真实证据

该合同不是 First Sync start 路径的一部分；在 Gate 2 Push 的 Webhook consumer 首次调用 `request_project_sync` 时触发：

- 旧 run `06070d6a-23e2-44ba-8db2-90a4c644e8ea`：queued/version 1 → failed/version 2。
- `finished_at=2026-08-12T02:24:46.463Z`。
- `error_code=sync_run_stale_queued`。
- summary：固定安全文本 `Stale queued sync request recovered.`。
- 旧记录保留，未删除或覆盖为 completed。
- 同一事务后创建新 Webhook SyncRun 与 dispatch；真实 staging 合同 PASS 1/1。

## 9. Gate 2 Push：首个产品失败

### Provider 对象

- branch：`stage3-phase9-smoke-20260812T020232Z-41e9892f`。
- commit：`2282e735a8d8751c40ca9376616274739a8182a9`。
- parent：`4107e7210f5ae10920e5341d18d0cdd4565fb983`。
- tree：`1bb50ab17b103dc7c716902084a45dec0511ece6`。
- 仅包含一个虚构文本文件，无生产数据或秘密。

### 已闭合 lineage

- delivery ID：`fbf1ea36-95f4-11f1-9107-e8b6d879ad1c`。
- event：push；received `2026-08-12T02:24:46.463Z`。
- body 仅保留 SHA-256：`af903f02a6a8903f94d2fbb50357c8946d61c6a6e8f87c683f602e3721027843`，未保存 raw payload。
- internal event：`github-webhook:fbf1ea36-95f4-11f1-9107-e8b6d879ad1c`。
- delivery：completed/version 5；safe error null；provider receipt retained。
- Webhook SyncRun：`157946e2-0df7-4d79-bc5b-43d902204854`；completed/version 3；error null。
- idempotency：`sync-request:webhook:fbf1ea36-95f4-11f1-9107-e8b6d879ad1c`。
- dispatch：`835e4d06-c3c5-444f-8bd9-9b6edd0d5249`；request identity `webhook:fbf1ea36-95f4-11f1-9107-e8b6d879ad1c`；dispatched/version 3；provider job present。
- repository snapshot 于该 run 后更新。

### 未闭合事实

- `github_commits` 中精确 after SHA `2282e735a8d8751c40ca9376616274739a8182a9` 计数：0。
- Webhook run 终态后 `github_commits` 仅有默认分支 SHA `4107e7210f5ae10920e5341d18d0cdd4565fb983`，且 updated_at 已被该 run 刷新。
- `ExecuteProjectSynchronization` 对 commit group 调用 `GitHubActivityReader.listCommits(request)`；`GitHubActivityReader` 请求 `/repos/{owner}/{repo}/commits` 时只传 `per_page` 与 `since`，没有传 Push `after`、branch 或 ref。GitHub endpoint 因此读取默认分支历史。
- 结论：Push delivery/consumer 成功，但非默认分支 Push 对象的 commit snapshot lineage 不完整；Push case FAIL，正常事件完整 lineage固定分母为 `0/5`。

## 10. 硬停止后的 NOT RUN

- 正常 Issue：NOT RUN。
- PR：NOT RUN。
- Release：NOT RUN。
- Workflow file/dispatch：NOT RUN。
- duplicate delivery replay：NOT RUN。
- 受控 missed Issue：NOT RUN；GitHub App 配置变更 0，故无需恢复。
- Reconciliation/Manual Resync：NOT RUN。
- 最终 Freshness 收敛：NOT RUN。
- 没有用后续对象、重试或 Manual Resync 掩盖 Push 失败。

## 11. 固定分母

| 目标 | 结果 | 分母 |
|---|---:|---:|
| deployment version binding | PASS | 1/1 |
| migration 16/16 | PASS | 1/1 |
| stale queued recovery | PASS | 1/1 |
| authenticated First Sync | PASS | 1/1 |
| First Sync replay | PASS | 1/1 |
| First Sync snapshot groups | PASS | 6/6 |
| normal GitHub events complete lineage | BLOCKED | 0/5 |
| duplicate replay | NOT RUN | 0/1 |
| controlled missed Issue | NOT RUN | 0/1 |
| webhook configuration restore | NOT RUN | 0/1 |
| Reconciliation repair | NOT RUN | 0/1 |
| Freshness convergence | NOT RUN | 0/1 |

## 12. 本地门禁

### 通过

- Phase 4–9.2.9 定向：19 文件中 18 文件首轮通过，首轮 234/235；唯一 module-boundaries case 是 ESLint 子进程超过既有 10 秒限制。
- module-boundaries 唯一等价复验：1 文件、36/36，Exit 0；未改超时或断言。
- `pnpm test`：99 文件、1000/1000，Exit 0，232.36 秒。
- 0018：1 文件、41/41，Exit 0。
- Local Supabase 全量 pgTAP：18 文件、570/570，Exit 0。
- lint：Exit 0。
- typecheck：Exit 0。
- db lint：0 error，Exit 0。
- database types：up to date，Exit 0。
- schema drift：empty，Exit 0。
- production E2E：2/2，Exit 0。
- `git diff --check`：通过。

### 未闭合

- 应用集成首轮：Local Supabase 已被提前停止，6 个套件无法取得本地配置；41 passed、20 skipped、1 failed，Exit 1。
- 启动同一 Local Supabase 后唯一原样复验：17/18 文件通过，59 passed、3 skipped，Exit 1；仅 `supabase-github-installation-repository.test.ts` 内部 `supabase status` 未取得本地凭据。
- 相同环境原因的复验额度已用尽，未循环、未删测、未降低断言。required skip 目标 0 未满足。
- Local Supabase 在验证后安全停止；本地数据卷保留。

## 13. 失败记录

1. GitHub CLI `/user/installations`：缺少 `read:user`，HTTP 403；未扩 scope，改用已登录 App/installation 页面只读核验。
2. 两次 CDP/Playwright 高层页面读取超时；改用 localhost CDP Runtime.evaluate，只读且无秘密访问。
3. 零碰撞并行命令将预期 404/`rg` Exit 1 汇总为失败；逐项原 identity 复核，不换 run_id。
4. First Sync 后首次 SQL 把 text cursor 当 jsonb，第二次又查询不存在的 `retryable` 列；两次均为 read-only 失败，随后按生成类型修正。无数据库写副作用。
5. Local Supabase 首次停止命令的审批服务连接中断；用户回复“重试”后，仅重试同一命令并成功。
6. 应用集成环境失败如第 12 节所述；未掩盖为成功。

## 14. 秘密、安全与清理

- Evidence/Freeze 不含 token、Cookie、private key、Webhook secret、Authorization value、raw cursor、raw payload 或完整私有日志。
- Supabase Local CLI 打印的仓库既有本地演示 key 未复制到本 evidence，也不是远端 secret。
- 本地临时 CDP 脚本与测试仓库克隆均已删除。
- 远端 Smoke branch 与 commit 保留供审核；未删除、未 Merge。
- GitHub App 配置未改；Production 未触碰；无付费/Trial。
- Freeze 未回写；产品代码、migration、package、lock、UI 均未在本批修改。

## 15. 远端副作用清单

1. 应用 `origin/staging`：一次 fast-forward Push 到 `6b82a1a875ac86ba65041f82bed409b6a9714a2b`。
2. Vercel：由该 Push 自动创建一次 Preview deployment `dpl_FjZUo9QYfNGUfLHMzcduxf97Ynoz`；未 Promotion。
3. Supabase staging：应用唯一 migration `20260811093237`；无手工业务数据写入。
4. Inngest staging：自动同步新 deployment-specific endpoint；无手工 event/function trigger。
5. 应用 First Sync：正式请求 1 次、同 identity replay 1 次。
6. 测试仓库：创建并 Push run_id branch 1 个、虚构 commit 1 个。
7. 正常 Issue/PR/Release/Workflow：0。
8. duplicate redelivery：0。
9. GitHub App 配置更改：0。
10. missed Issue：0。
11. Reconciliation/Manual Resync：0。
12. Production、其他仓库、Merge、force push、付费动作：0。

## 16. 下一建议

下一个独立本地产品修复应把 Webhook Push 的 `after`/ref 安全 lineage 传入 project synchronization，并让 commit reader 在 Push 触发时精确读取该 ref；同时保持 first_sync/reconciliation/manual 的默认分支或既有集合语义。修复需用确定性 TDD 证明非默认分支 after SHA 写入 snapshot，且不得在本批直接修改产品或继续 Smoke。
