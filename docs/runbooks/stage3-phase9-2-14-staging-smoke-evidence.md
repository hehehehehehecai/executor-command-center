# Phase 9.2.14 Inngest 竞态修复后隔离 staging Smoke 脱敏证据

## 1. 裁决

- 总体：`BLOCKED`。
- 部署、Authenticated First Sync、同 identity replay、六组 snapshot 与前三类正常事件（Push、Issue、PR）完整通过。
- 第四类正常事件 Release 的 provider object、Webhook delivery、provider receipt 与 Release snapshot 存在，但该固定 delivery 在五分钟轮询上限后仍停在 `dispatched/version 3`，`sync_run_id=null`，未建立 Webhook SyncRun 或 project dispatch。
- 按硬门禁停止：Workflow、duplicate redelivery、受控漏投、配置修改、Reconciliation 与最终 Freshness 均未执行。
- 不满足阶段 3 完成条件，不进入下一阶段。

## 2. 批次、基线与 Freeze

- 批次：`explorer-stage3-phase9-2-14-staging-smoke-2a430601`。
- prompt：`explorer-stage3-phase9-2-14-post-inngest-race-smoke-2a430601`。
- 授权信封：`workflow-authorization.v1:2a430601ff479692`。
- 来源 A 级票据：`sha256:c8bf88b0e55cd230d605aef2373bf7b5d27d436e53a318da1289cbf053f3d9b9`。
- branch：`feature/stage3-phase8-data-freshness-ui`。
- 产品 commit：`2a430601ff4796927291006b483abfc797806b88`。
- tree：`6ada893bfb6a9a775310826cb47bcbeada16ec58`。
- parent：`d6e4324c64d21abddcccc44cdac80cf8df7af77b`。
- message：`fix(sync): execute webhook consumer step reliably`。
- run_id：`stage3-phase9-smoke-20260812T075632Z-3529722d`。
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-14-staging-smoke-freeze.json`。
- Freeze SHA-256：`801a707114e9a9b8ac35f7209f8128d5b17f982c4a78380092b84d99c8f056df`；创建后未回写。
- 来源 Phase 9.2.13 Freeze/evidence SHA-256 分别为 `423ddcc93fab891d505e203978f850ffd1f19877d97711117d540c16e78ee332`、`6e391dff34cf4a70bf364f6f1cd8d61c01cb1683129a20bf3306a2434787c7e1`。

## 3. Provider 与部署绑定

### GitHub

- 账号：`hehehehehehecai`。
- App ID：`4480141`；installation ID：`151329457`。
- selected-only repository：`hehehehehehecai/explorer-staging-private-test-20260804`，repository ID `1322569219`，仅 1 个选定仓库。
- 权限保持 read-only：actions、checks、contents、issues、metadata、pull_requests。
- events：issues、pull_request、push、release、repository、workflow_run。
- Webhook active，SSL verification enabled；本批未修改配置。

### Vercel

- plan：Hobby；project：`prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`。
- `origin/staging` 从 `f085e8380f9abfe5cfdd8a6db8346973d6fca945` 精确 fast-forward 到 `2a430601ff4796927291006b483abfc797806b88`，一次，未 force。
- deployment：`dpl_8NhFoPH1k7UzgwSjt4D5FFWxGmSn`。
- deployment URL：`https://executor-command-center-bylzku855-hehehehehehecais-projects.vercel.app`。
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`。
- 状态 `READY`，branch `staging`，target 非 Production，完整 commit 精确匹配。

### Supabase 与 Inngest

- Supabase staging ref：`gsnuorsqdcdszjxtymhs`，Free、`ACTIVE_HEALTHY`、migration ledger `16/16`；本批无 migration apply 或手工数据库写入。
- Inngest environment：`staging-7050a935`，Free；SDK `4.15.0`。
- app 已同步到上述新 Preview 的 deployment-specific `/api/inngest`；project sync、GitHub webhook、daily reconciliation 三函数存在，daily cron `0 2 * * *`。
- 部署 commit 包含 Phase 9.2.13 的 `await-webhook-dispatch` Sleep step。

## 4. 初始数据库事实

只读事务并回滚所得：SyncRun `7`、project dispatch `2`；repository/commit/issue/pull_request/release/workflow_run snapshot 为 `1/1/0/0/0/0`。初始计数首次系统审批连接中断；用户明确批准后只重试一次成功。远端数据库写调用为 0。

## 5. Gate 1：Authenticated First Sync 与 replay

- project：`81630aa3-a101-421c-b31e-dc16d1592c31`。
- request identity：`stage3-phase9-smoke-20260812T075632Z-3529722d-first-sync`。
- 正式请求：HTTP `202`，安全码 `first_sync_accepted`。
- SyncRun：`1cd4712a-e895-499b-bab8-ea82e365537b`。
- 业务终态：`completed/version 10`；error code/summary 均为空。
- queued `2026-08-12T08:07:22.745951Z`；started/last_progress/finished `2026-08-12T08:07:24.559Z`，时间顺序合法，微秒精度修复未回归。
- cursor：存在、917 bytes、contract `first-sync-cursor.v1`；未保存 raw cursor。
- completed groups：repository、commit、issue、pull_request、release、workflow_run，`6/6`。
- 同 identity replay：HTTP `200`，`first_sync_reused` / `duplicate`；返回同一 SyncRun；identity run 仍为 1，六组 snapshot 计数零增长。
- 首轮只读取证错误地查询不存在的 `retryable` 列，数据库拒绝查询且无写入；修正为实际 schema 后得到上述权威结果，未重发正式请求。

## 6. Gate 2：正常事件

### 6.1 Push — PASS

- branch：`stage3-phase9-smoke-20260812T075632Z-3529722d`。
- parent/main：`4107e7210f5ae10920e5341d18d0cdd4565fb983`。
- after commit：`b6176489f21d7b15c05ecf40c99869565a5ef80b`。
- tree：`96dbe0d94a8e4783ba2995b2de63ba0d4c2dd478`；虚构 blob：`a94ce25fe7997e85b3dbceb18bdd0ee1bbadc2f3`。
- 虚构文件：`smoke/stage3-phase9-smoke-20260812T075632Z-3529722d.txt`。
- delivery：`5f734084-9625-11f1-96b5-d44e18a12076`，internal event `github-webhook:5f734084-9625-11f1-96b5-d44e18a12076`。
- delivery `completed/version 5`，provider receipt retained，safe error null。
- Webhook SyncRun：`a7ef0e58-b9fb-40c5-8bd0-ca38d36a0883`，`completed/version 3`。
- dispatch：`a3f277dc-510d-490f-9538-e71077fd3bda`，dispatched，provider job present。
- 目标 after SHA 在 `github_commits` 精确计数 `1`；首次 delivery 的 Sleep → claim → SyncRun → dispatch → snapshot → terminal 完整闭合。
- 首次本地 blob 命令只在 PowerShell 解析阶段失败，GitHub 未收到请求；随后 Git data 对象先构造为不可达，唯一 ref 创建产生一次业务 Push。
- delivery 取证曾使用错误列名 `error_code`、commit 取证曾使用错误列名 `sha`；两次只读查询均由数据库拒绝、无写入，随后按生成类型修正，未重复 Push。

### 6.2 Issue — PASS

- GitHub object：database ID `5128743185`，node ID `I_kwDOTtTOA88AAAABMbJpEQ`，number `1`。
- delivery：`c6b6164a-9625-11f1-899e-0b6cbd110876`，`completed/version 5`。
- SyncRun：`7b644663-ce94-4860-8cb2-f8a94f03ba9f`，`completed/version 3`。
- dispatch：`4093e84b-c7aa-49bc-b8d2-8d67647098d8`，provider job present。
- snapshot 精确计数 `1`。

### 6.3 Pull Request — PASS

- GitHub object：database ID `4260448446`，node ID `PR_kwDOTtTOA8798Ui-`，number `2`；head SHA 为本批 Push after SHA；未 Merge。
- delivery：`fc35b2d0-9625-11f1-8a48-1a127a0f73b0`，`completed/version 5`。
- SyncRun：`59f6b6fd-0942-44d6-89e3-92d891bbca8a`，`completed/version 3`。
- dispatch：`86830b57-4321-414e-9372-9c06b9940a44`，provider job present。
- snapshot 精确计数 `1`。

### 6.4 Release — BLOCKED

- GitHub object：database ID `369085554`，node ID `RE_kwDOTtTOA84V_8xy`。
- exact tag：`stage3-phase9-smoke-20260812T075632Z-3529722d`；prerelease=true。
- delivery：`263e3250-9626-11f1-98f3-7a6dc91ee73f`；received `2026-08-12T08:16:43.372Z`。
- `/api/github/webhook` 返回 202；同一 Preview 的 `/api/inngest` 随后多次返回 206。
- provider receipt present；Release snapshot 精确计数 `1`，但这是全仓活动读取事实，不能替代该 delivery 的业务 lineage。
- 在冻结五分钟上限后的 `2026-08-12T08:22:10.504671Z`，delivery 仍为 `dispatched/version 3`，`sync_run_id=null`、Webhook SyncRun 0、dispatch 0、safe error null。
- 结论：Release provider object 与 snapshot 存在，但 Release delivery → claim → SyncRun → dispatch → terminal 不完整；正常事件完整 lineage 固定分母为 `3/5`，第四项失败，第五项未运行。

### 6.5 Workflow — NOT RUN

Release 硬门禁失败后停止。授权的 `.github/workflows/stage3-phase9-smoke.yml` 初始不存在，本批未创建 main workflow 文件、未 dispatch workflow。

## 7. Duplicate、漏投、恢复与 Freshness

- duplicate redelivery：NOT RUN，`0/1`。
- controlled missed Issue：NOT RUN，`0/1`。
- GitHub App 配置变更：0；因此无需恢复，固定分母记 NOT RUN `0/1`。
- Reconciliation/Manual Resync：NOT RUN，`0/1`。
- final Freshness convergence：NOT RUN，`0/1`。
- 没有用 redelivery、Manual Resync、数据库写入或后续对象掩盖 Release 失败。

## 8. 固定分母

| 目标 | 结果 | 分母 |
| --- | --- | ---: |
| deployment version binding | PASS | 1/1 |
| migration ledger | PASS | 16/16 |
| Authenticated First Sync | PASS | 1/1 |
| First Sync replay | PASS | 1/1 |
| First Sync snapshot groups | PASS | 6/6 |
| Push first delivery terminal | PASS | 1/1 |
| Push after SHA exact snapshot | PASS | 1/1 |
| normal GitHub events complete lineage | BLOCKED | 3/5 |
| duplicate replay | NOT RUN | 0/1 |
| controlled missed Issue | NOT RUN | 0/1 |
| webhook configuration restore | NOT RUN | 0/1 |
| Reconciliation repair | NOT RUN | 0/1 |
| final Freshness convergence | NOT RUN | 0/1 |

## 9. 本地门禁与失败记录

| 门禁 | 结果 | 分母 / skip |
| --- | --- | --- |
| 全量单元首轮 | 环境失败 | 99 文件，1019/1020；唯一 module-boundaries ESLint 子进程 10 秒超时，skip 0 |
| 全量单元唯一等价复验 | PASS | 99/99 文件，1020/1020，skip 0 |
| application integration 首轮 | 环境失败 | 11/18 文件通过，41/62 tests，20 required skipped；受限 telemetry/CLI 状态目录 |
| application integration 系统环境唯一复验 | PASS | 18/18 文件，62/62，required skip 0 |
| Local Supabase pgTAP | PASS | 18/18 文件，570/570 |
| lint | PASS | exit 0，warnings 0 |
| typecheck | PASS | exit 0 |
| db lint | PASS | errors 0 |
| db types check | PASS | up to date |
| db drift | PASS | empty |
| module boundaries 独立 | PASS | 36/36，skip 0 |
| production E2E | PASS | 2/2，skip 0 |

独立 module-boundaries 前两次只因 Windows 命令发现失败，测试未启动；补齐 bundled Node PATH 后同一文件 36/36。E2E 自动把 `next-env.d.ts` 指向 dev routes；精确 diff 证明来源后，仅该文件恢复为 HEAD 原始 CRLF，SHA-256 回到 `4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。Local Supabase 验证后已安全停止。

## 10. 最终数据库安全计数

只读事务并回滚：SyncRun `12`、dispatch `6`、delivery `12`；repository/commit/issue/pull_request/release/workflow_run snapshot 为 `1/2/1/1/1/0`。Release snapshot 已存在不改变其固定 delivery lineage BLOCKED 的裁决。

## 11. 范围、安全与远端副作用

- 本地允许文件仅为本批 Freeze 与本 evidence；产品代码、migration、package、lock、UI 未修改。
- `package.json` SHA-256：`f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468`。
- `pnpm-lock.yaml` SHA-256：`a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef`。
- `next-env.d.ts` SHA-256：`4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。
- CLI 曾向瞬时终端输出 Local Supabase 默认演示值；未复制到 evidence、Freeze 或 Git diff，最终强特征扫描须为 0。
- 远端副作用：应用 staging fast-forward Push 1；自动 Vercel Preview 1；自动 Inngest deployment sync 1；First Sync 1；同 identity replay 1；测试仓库 Git blob 1、tree 1、commit 1、branch ref/Push 1；正常 Issue 1；PR 1（未 Merge）；prerelease/tag 1；对应 Webhook deliveries 4；workflow 0；redelivery 0；GitHub App 配置修改 0；missed Issue 0；Reconciliation/Manual Resync 0；数据库手写 0；Production 0；其他仓库 0；付费/Trial 0。
- 本批分支、Issue、PR、tag/release 保留供审核；未删除或修改非本批对象。

## 12. 残余风险与下一建议

Phase 9.2.13 的 Sleep 修复在真实 Push、Issue、PR 首次 delivery 上已证明有效，但本批 Release delivery 在 Inngest route 多次 206 后仍未执行 claim。下一独立 B 类单元应只针对 `release` 的规范化 event envelope、Inngest step/retry 与 `WebhookSynchronizationRuntime.request` 前边界，用本批固定 delivery 形态的脱敏合成事件取得确定性 RED；不得通过 redelivery 或 Manual Resync 掩盖。

阶段 3 尚不能判定完成。是否进入下一任务：否，停止并等待审核。
