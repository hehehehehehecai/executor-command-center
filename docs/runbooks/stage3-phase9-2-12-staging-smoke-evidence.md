# Phase 9.2.12 Push 修复后隔离 staging Smoke 脱敏证据

## 1. 裁决

- 总体：`BLOCKED`。
- Gate 1（部署、Authenticated First Sync、同 identity replay、六组 snapshot）通过。
- Gate 2 的第一个对象 Push 未闭合：provider delivery 已接收并得到 Inngest provider receipt，但 delivery 长时间停在 `dispatched/version 3`，未绑定 SyncRun，未建立 project dispatch，目标 after SHA 未写入 `github_commits`。
- 按硬门禁停止：正常 Issue、PR、Release、Workflow、duplicate redelivery、受控漏投、配置恢复、Reconciliation 与最终 Freshness 均未执行。
- 不满足阶段 3 完成条件，不进入下一阶段。

## 2. 批次、基线与 Freeze

- 批次：`explorer-stage3-phase9-2-12-staging-smoke-f085e838`。
- prompt：`explorer-stage3-phase9-2-12-post-push-lineage-smoke-f085e838`。
- 授权信封：`workflow-authorization.v1:f085e8380f9abfe5`。
- 来源 A 级票据：`sha256:4c0182f085e8380f9abfe5cfdd8a6db8346973d6fca9456ccbb04be1516d1b`。
- branch：`feature/stage3-phase8-data-freshness-ui`。
- 产品 commit：`f085e8380f9abfe5cfdd8a6db8346973d6fca945`。
- tree：`6ccbb04be1516d1b7a1fba9665eaa9e102b6d07c`。
- parent：`f395153dbf6493dcad2cee1c7cfa26b2201d5d99`。
- message：`fix(sync): preserve push commit lineage`。
- run_id：`stage3-phase9-smoke-20260812T053040Z-14397338`。
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-12-staging-smoke-freeze.json`。
- Freeze SHA-256：`c7fdadaa259a006321fc1aa401372f17846adc0ef66e467fb2aa60c91f038605`。
- Freeze 创建时间：`2026-08-12T05:34:46.6021304Z`；创建后未回写。

## 3. Provider 与部署绑定

### GitHub

- 账号：`hehehehehehecai`。
- App ID：`4480141`；installation ID：`151329457`。
- selected-only repository：`hehehehehehecai/explorer-staging-private-test-20260804`，repository ID `1322569219`。
- 权限保持 read-only：actions、checks、contents、issues、metadata、pull_requests。
- events：issues、pull_request、push、release、repository、workflow_run。
- Webhook active，SSL verification enabled。

### Vercel

- project：`prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`，Hobby。
- `origin/staging` 由产品基线精确 fast-forward 到 `f085e8380f9abfe5cfdd8a6db8346973d6fca945`，一次，未 force。
- deployment：`dpl_6caMo4hn2Csxhpq1XJBQWDnssj2u`。
- deployment URL：`https://executor-command-center-6d4hmk1hx-hehehehehehecais-projects.vercel.app`。
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`。
- 状态 `READY`，branch `staging`，环境 `Preview`，完整 commit 与产品 commit 一致，未 Promotion、未触碰 Production。
- 构建包含 `/api/inngest`、`/api/github/webhook` 与 authenticated First Sync route。

### Supabase 与 Inngest

- Supabase staging ref：`gsnuorsqdcdszjxtymhs`，Free/healthy，migration ledger `16/16`；本批无 migration apply。
- Inngest environment：`staging-7050a935`，Free。
- deployment-specific sync URL 指向上述 Preview 的 `/api/inngest`。
- 三函数存在：project sync consumer、GitHub webhook consumer、daily reconciliation；cron `0 2 * * *`。
- 未读取或保存 provider secret、环境变量值、Cookie、Authorization 或 raw payload。

## 4. Gate 1：Authenticated First Sync

- project：`81630aa3-a101-421c-b31e-dc16d1592c31`。
- request identity：`stage3-phase9-smoke-20260812T053040Z-14397338-first-sync`。
- 正式请求：HTTP `202`，安全结果 `first_sync_accepted`。
- SyncRun / provider job identity：`edbdc718-b992-45c9-926d-4a4fc0561bc7`。
- 数据库终态：`completed/version 10`，error code/summary 均为空；started、last progress、finished 均存在，时间顺序合法。
- cursor：object，序列化 917 bytes，14 个精确 top-level keys；未持久化 raw cursor 到 evidence。
- completedGroups：repository、commit、issue、pull_request、release、workflow_run，`6/6`。
- snapshot：repository/commit/issue/pull_request/release/workflow_run = `1/1/0/0/0/0`，与当时仓库事实一致。
- 同 identity replay：HTTP `200`，`first_sync_reused`；返回同一 SyncRun/job；新增 SyncRun、dispatch、snapshot 均为 `0`。

## 5. Gate 2 Push 对象

- branch：`stage3-phase9-smoke-20260812T053040Z-14397338`。
- base/main SHA：`4107e7210f5ae10920e5341d18d0cdd4565fb983`。
- 目标 after SHA：`33a40388e8b09dce7b9310b830bc0b2152177c91`。
- 虚构文件：`smoke/stage3-phase9-smoke-20260812T053040Z-14397338.txt`。
- 首次 Git Data API 组合请求只创建了不可达 orphan blob `55405e2cb86ce80fa039f1afeaf37241665efdcc`；tree/commit/ref 请求在客户端 JSON 解析阶段失败，权威读回证明当时分支不存在。
- 随后只创建一次目标 branch，并通过 Contents API 创建上述唯一可达 commit；没有重复业务 Push 对象。

## 6. Push lineage 与硬停止证据

- delivery ID：`d67c04b4-9610-11f1-90d7-9d73d2506ec4`。
- internal event ID：`github-webhook:d67c04b4-9610-11f1-90d7-9d73d2506ec4`。
- received：`2026-08-12T05:44:09.315Z`。
- provider receipt：存在；原值未记录。
- delivery：`dispatched/version 3`，safe error 为空，updated `2026-08-12T05:44:10.759035Z`。
- `sync_run_id=null`；Webhook SyncRun 数 `0`；project dispatch 数 `0`；provider job 数 `0`。
- `github_commits` 中目标 after SHA 精确计数：`0`。
- 初次轮询使用了错误字段名并隐藏 stderr，产生空结果并超时；修正生成类型后，以固定 delivery 的最小只读 SELECT 两次权威确认上述稳定终态。该取证失败未产生数据库写入，也未重复 Push。
- Vercel 安全日志证明该 Preview 的 `/api/github/webhook` 返回 `202`，随后 `/api/inngest` 两次返回 `206`；日志消息为空，未读取 body/header。
- 已排除：错误 Vercel 账号、旧 team URL 404、错误 deployment、请求未到 staging、GitHub provider receipt 缺失。
- 已缩小：Inngest GitHub webhook consumer 的 step/retry 没有推进到 delivery claim / durable webhook SyncRun。由于本批禁止产品修改和不确定写入重试，保留为下一独立本地诊断/修复点。

## 7. 固定分母

| 目标 | 结果 | 分母 |
|---|---|---:|
| deployment version binding | PASS | 1/1 |
| Supabase migration ledger | PASS | 16/16 |
| Authenticated First Sync | PASS | 1/1 |
| First Sync replay | PASS | 1/1 |
| First Sync snapshot groups | PASS | 6/6 |
| normal GitHub events complete lineage | BLOCKED | 0/5 |
| Push after SHA exact snapshot | BLOCKED | 0/1 |
| duplicate replay | NOT RUN | 0/1 |
| controlled missed Issue | NOT RUN | 0/1 |
| webhook configuration restore | NOT RUN | 0/1 |
| Reconciliation repair | NOT RUN | 0/1 |
| final Freshness convergence | NOT RUN | 0/1 |

## 8. 本地门禁与失败记录

- `pnpm test` 首轮因 PATH 缺 Node，Exit 1；补齐仓库 bundled runtime 后，第一次受工具 120 秒上限终止；相同命令完整窗口最终 Exit 0：99/99 files，1016/1016 tests，skip 0。
- `pnpm run test:integration:app` 首轮 Exit 1：Local Supabase 未启动，41 passed、20 skipped，另有 telemetry 文件系统权限错误。
- 启动 Local Supabase 后唯一完整复验仍 Exit 1：17/18 files，55/62 passed，7 skipped；仅 `supabase-selected-repository-writer.test.ts` 内部无法发现本地凭据。required skip 目标 0 未满足，未继续循环复验。
- Local Supabase pgTAP：18/18 files，570/570 tests，Exit 0。
- lint：Exit 0。
- typecheck 首轮因沙箱无法写 `tsconfig.tsbuildinfo`，Exit 2；系统环境等价复验 Exit 0。
- db lint：0 errors，Exit 0。
- database types：up to date，Exit 0。
- schema drift：empty，Exit 0。
- module boundaries：36/36，Exit 0。
- production E2E：2/2，Exit 0。
- E2E 把 `next-env.d.ts` 改为 dev routes import；直接 diff 证明来源后，精确恢复为基线文本与 SHA。

## 9. 安全、范围与远端副作用

- 本地最终允许文件仅为本批 Freeze 与本 evidence；产品代码、migration、package、lock、UI 未修改。
- `package.json` SHA-256：`f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468`。
- `pnpm-lock.yaml` SHA-256：`a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef`。
- `next-env.d.ts` 恢复后 SHA-256：`4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。
- 远端副作用：应用 staging fast-forward Push 1；Vercel Preview 1；Inngest deployment sync 1；First Sync 1；同 identity replay 1；测试仓库 branch 1、可达 commit 1、不可达 orphan blob 1；GitHub webhook delivery 1；其余正常事件、redelivery、配置修改、漏投、Reconciliation、Production、Merge、force push、付费均 0。
- GitHub Smoke branch 与 commit 保留供审核；没有删除非本批对象。

## 10. 下一建议

建立独立本地 B 类诊断/修复单元，针对 `executor/github.webhook.received.v1` 的 Inngest step/retry：使用本批固定 delivery 形态的合成事件，证明为何 provider receipt 已存在且 route 返回 206，却没有执行 delivery claim、创建 webhook SyncRun。不得在本批通过 redelivery、Manual Resync 或数据库写入掩盖该失败。
