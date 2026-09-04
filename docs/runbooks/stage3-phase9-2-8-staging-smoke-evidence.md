# Phase 9.2.8 隔离 staging 完整 Smoke 重试证据

## 1. 结论

- 总体：`BLOCKED`。
- Deployment 与 Gate 1 全部通过；Gate 2 在第一类 Push 的业务 lineage 处失败，因此严格停止。
- 直接阻塞：Phase 9.2.2 遗留的 First Sync `06070d6a-23e2-44ba-8db2-90a4c644e8ea` 仍为 `queued/version 1`。`request_project_sync` 将两次 Push webhook consumer 请求 coalesce 到该旧 run，delivery 因而停在 `dispatched`、没有关联 webhook SyncRun，新的 commit snapshot 未写入。
- 未手工修改旧 SyncRun、未重发 Push、未继续创建 Issue/PR/Release/Workflow、未进行 duplicate redelivery、受控漏投、Provider 配置变更或 Reconciliation。

## 2. 调度与不可回写 Freeze

- 批次：`explorer-stage3-phase9-2-8-staging-smoke-a16faaf6`
- prompt：`explorer-stage3-phase9-2-8-full-staging-smoke-a16faaf6`
- 授权信封：`workflow-authorization.v1:a16faaf63d4c2e83`
- 来源审核票据：`sha256:a16faaf63d4c2e83f29d1c6d2a55b8d2f554339b3bc4ee49107078e049ec8b92`
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-8-staging-smoke-freeze.json`
- Freeze SHA-256：`2fdf0a373447c0e25c1fdab732178d000dcfa62dd1101e9af78269ee0d10692d`
- 创建时间：`2026-08-11T08:13:57.4636412Z`；创建后未回写。
- run_id：`stage3-phase9-smoke-20260811T081217Z-84af44f4`
- 未采用候选：`stage3-phase9-smoke-20260811T081202Z-00000000`。本地 RNG API 不可用导致全零后缀；该候选未做碰撞检查、未冻结、未使用。

## 3. 本地基线与历史指纹

- branch：`feature/stage3-phase8-data-freshness-ui`
- commit/tree/parent：`5b730d4e1e8d62837ee75d645d428bdfab0ec35e` / `be33ba6d0b660fe156c764127f48d08a5865073d` / `8e56ae8acea20ee5f556925a82064b32149aa4ab`
- message：`fix(github): request activity read permissions for sync`
- 初始工作树：干净。
- Phase 9.2.7 Freeze/evidence：`a1cb97633ed952a5ab8095ad5d1495eb2785c5254c72e54185e19f380f0eba7d` / `1ae501db6ebaba69e56b60512f640df35c2b7404aa69a87f7dfe2b79adcb3b6d`，未变化。
- `package.json`、`pnpm-lock.yaml`、migration、数据库类型、产品代码：本批零修改。
- `next-env.d.ts` 初始/最终 SHA-256：`4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac`。E2E 自动切换 dev routes import 后，已从 index 精确恢复原 blob 与 CRLF。

## 4. Provider 隔离预检与部署

### GitHub

- 账号：`hehehehehehecai`。
- 唯一仓库：`hehehehehehecai/explorer-staging-private-test-20260804`，ID `1322569219`，Private，默认分支 `main`。
- GitHub App：ID `4480141`；installation `151329457`；selected repository 仅上述唯一仓库。
- read 权限：actions、checks、contents、issues、metadata、pull_requests。
- events：issues、pull_request、push、release、repository、workflow_run。
- Webhook Active：true；SSL verification：enabled。

### Vercel

- plan：Hobby；project：`executor-command-center`，ID `prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`。
- 精确 fast-forward：`origin/staging` 从 `9e07c7bf288f6d0aaa3818a0cc2a9e81a557b220` 更新至 `5b730d4e1e8d62837ee75d645d428bdfab0ec35e`；无 force、无 main/master Push。
- deployment：`dpl_84CuN459FcApPco6dX88iMnEeJ4W`，`READY`、`Preview`、branch `staging`、完整 commit 与本批基线一致。
- deployment URL：`https://executor-command-center-ar4nx2sdw-hehehehehehecais-projects.vercel.app`
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`
- Production/Promotion：0。

### Supabase

- staging ref：`gsnuorsqdcdszjxtymhs`；project `executor-command-center-staging`；Free；`ACTIVE_HEALTHY`；region `ap-northeast-2`。
- migration ledger：15/15。
- 本批远端只读查询均用 read-only SQL；无手工 INSERT/UPDATE/DELETE/RPC/DDL/migration apply。

### Inngest

- environment：`staging-7050a935`；Free；app `executor-command-center`；SDK `4.15.0`。
- 新 deployment sync URL：`https://executor-command-center-ar4nx2sdw-hehehehehehecais-projects.vercel.app/api/inngest`
- functions：3：project sync consumer、GitHub webhook consumer、daily reconciliation；cron `0 2 * * *`。
- 无 event key/signing key/raw payload 持久化。

## 5. 碰撞检查

- 本地 evidence、Issue/PR、branch、tag、精确 Release、workflow_dispatch run 均为 0。
- workflow 文件初始不存在；Gate 2 在 Push 失败后停止，因此没有使用 `main/.github/workflows/stage3-phase9-smoke.yml` 例外。

## 6. Gate 1：Authenticated First Sync

- project：`81630aa3-a101-421c-b31e-dc16d1592c31`
- request identity：`stage3-phase9-smoke-20260811T081217Z-84af44f4-first-sync`
- 首次 POST：HTTP `202`，`accepted` / `first_sync_accepted`。
- SyncRun/job：`b762c1e5-747d-4b47-b1df-30964c16e770`。
- provider job ID：`01KZQYFDBAHGEW1QP9RMCTGTEV`，长度 26，安全字符校验 true。
- Inngest run：`01KZQYFDP2GQFWXY19SMEXPBR1`，function `executor-project-sync-consumer`，Completed。
- 数据库终态：`completed`、version 10、error null、retryable false、error summary null。
- queuedAt：`2026-08-11T08:19:26.983545Z`；lastProgressAt：`2026-08-11T08:19:29.328Z`；顺序校验 true，718 微秒问题未回归。
- cursor：非空，序列化长度 917；top-level exact keys 已核验；无失败组。
- completedGroups：repository、commit、issue、pull_request、release、workflow_run，6/6。
- 初始 snapshot：repository 1、commit 1、issue 0、pull_request 0、release 0、workflow_run 0，符合当时仓库事实。
- 同 identity 唯一 replay：HTTP `200`，`duplicate` / `first_sync_reused`，返回同一 SyncRun/job。
- replay 后：idempotency 对应 SyncRun 1、同 run 1、terminal run 1；snapshot 仍为 `1/1/0/0/0/0`；没有第二逻辑 run 或 snapshot。

Gate 1：`PASS`。

## 7. Gate 2：Push 与阻塞证据

### 远端对象

- 临时 branch：`stage3-phase9-smoke-20260811T081217Z-84af44f4`，从 main commit `4107e7210f5ae10920e5341d18d0cdd4565fb983` 创建。
- 虚构文件：`smoke/stage3-phase9-smoke-20260811T081217Z-84af44f4.txt`，87 bytes。
- Push 后 commit：`fa0e4823eed2c06318011a14bd61456eb422a575`。
- 因创建 branch 与写入文件，GitHub 产生两条 push webhook：
  - delivery `2ad35344-955f-11f1-8879-2f23e727463b`，provider receipt `01KZQZ70ZBW994Z464Y6EW1C9H`；
  - delivery `36416f0e-955f-11f1-94df-0c5d1d7bcbbe`，provider receipt `01KZQZ7KJAF4EHEJT2Y3TNVHB8`。
- 两条 delivery 均验签/持久化成功，但终态均为 `dispatched/version 3`、`sync_run_id=null`、safe_error_code null。
- 两条 `executor-github-webhook-consumer` Inngest run 均为 Completed；本次文件 Push run `01KZQZ7MRM57WV6C5RST0BHZ26` 的安全 Output 为：`outcome=coalesced`、`providerJobId=null`、`syncRunId=06070d6a-23e2-44ba-8db2-90a4c644e8ea`。
- 本次 commit snapshot present：0；快照仍为 `1/1/0/0/0/0`。

### 精确阻塞状态

- 被复用的旧 run：`06070d6a-23e2-44ba-8db2-90a4c644e8ea`。
- idempotency：`first-sync:stage3-phase9-1ef8fde8-first-sync`；trigger `first_sync`。
- 状态：`queued/version 1`；queuedAt `2026-08-11T01:30:16.518718Z`。
- startedAt、lastProgressAt、finishedAt 均 null；progress cursor null；error code null。
- 因数据库收敛规则优先复用同 Project 的 active queued/running run，本次 Webhook 无法建立新的 durable webhook SyncRun。

Gate 2 Push 完整 lineage：`FAIL/BLOCKED`。按串行门禁，后续对象全部未执行。

## 8. 固定分母与结果

| Target | 结果 | 分子/分母 | 说明 |
| --- | --- | ---: | --- |
| deployment version binding | PASS | 1/1 | READY Preview 与完整 SHA 一致 |
| authenticated First Sync | PASS | 1/1 | 真实入口、业务终态 completed |
| First Sync replay | PASS | 1/1 | 同一 run，无第二 dispatch/snapshot |
| snapshot groups | PASS | 6/6 | 六组 completed |
| normal GitHub events | BLOCKED | 0/5 | Push 对象存在但完整 lineage 未闭合；其余按门禁未创建 |
| complete lineage events | BLOCKED | 0/5 | Push delivery 停在 dispatched |
| duplicate delivery replay | NOT RUN | 0/1 | 需要先有成功正常 delivery |
| controlled missed Issue | NOT RUN | 0/1 | 需要正常 5/5 |
| webhook config restore | NOT RUN | 0/1 | 未改配置 |
| reconciliation repair | NOT RUN | 0/1 | 未制造漏投事实 |
| freshness convergence | BLOCKED | 0/1 | Gate 2 未闭合，不能宣称最终一致 |
| required skipped | PASS | 0 | 无 required skip |

## 9. 本地门禁

| 门禁 | 结果 | 分母 |
| --- | --- | --- |
| Phase 4–9.2.7 定向回归 | PASS | 22 files / 281 tests / skip 0 |
| `pnpm test` 首轮 | ENVIRONMENT TIMEOUT | 外层 184 秒终止；无断言失败输出 |
| `pnpm test` 唯一等价复验 | PASS | 99 files / 1000 tests / skip 0 |
| Application integration | PASS | 18 files / 62 tests / skip 0 |
| Local Supabase pgTAP | PASS | 17 files / 529 tests / skip 0 |
| lint | PASS | exit 0 |
| typecheck | PASS | exit 0 |
| db lint | PASS | 0 error |
| db types check | PASS | up to date |
| db drift | PASS | empty |
| production E2E | PASS | 2/2 / skip 0 |
| `git diff --check` | PASS | 0 error |

Local Supabase 仅本机启动并已停止；CLI 输出的本地演示凭据未复制到本证据。

## 10. 非预期失败与安全复验

1. 本地 RNG API 不可用导致全零候选；未使用，改为平台密码学 RNG 生成唯一 run_id。
2. workflow 文件初始 API 返回 404；证明文件不存在，没有写入。
3. 一次本地 JSON/jq quoting 失败；无远端写。
4. First Sync 前聚合只读 SQL 因 CLI 只返回最后 statement、以及一次表名错误而失败；均为 read-only，无副作用，修正后取得唯一聚合证据。
5. 浏览器命令不在 PATH；改用既有 localhost:9222 CDP 会话，未读取 Cookie/token。
6. Push 文件写入后的本地 jq 表达式失败，但远端写已成功；通过权威 readback 确认，未重发写入。
7. Inngest 页面一次非业务 telemetry timeout；详情页与业务 run 状态仍可读。
8. `pnpm test` 首轮外层 timeout；同命令唯一等价复验通过 1000/1000。
9. E2E 自动改写 `next-env.d.ts`；已证明来源并精确恢复原 blob/CRLF。

## 11. 安全、范围与清理

- secrets、private key、JWT、Cookie、Authorization、Webhook secret、service-role key、raw provider payload：证据文件 0 持久化。
- 本批未输出真实 Provider secret；本地 Supabase 演示值未写入文件或报告。
- 产品代码、migration、schema/RLS/RPC、generated types、UI、package/lock：零变化。
- 保留供审核的远端对象：应用 `staging` SHA、READY Preview、测试仓库 run_id branch 与其一个虚构文件 commit、两条 delivery/Inngest run、First Sync run/snapshots。
- 未创建/未执行：Issue、PR、Release、workflow file/dispatch、redelivery、missed Issue、GitHub App 配置变更、Reconciliation。
- 未执行不可逆清理、未删除 branch/tag/release、未 Merge、未 Promote、未触碰 Production。
- 成本：0，均为 Free/Hobby 或既有套餐。

## 12. 下一步建议

在独立产品修复批次中处理“失败但仍为 queued 的 First Sync 长期占用 active sync 收敛槽”问题。修复需确保失败路径把 SyncRun 推进到可信 terminal/partial/failed 状态，或使 sync request coalescing 排除不可恢复的陈旧 queued run；不得在 staging 手工改行。修复通过本地数据库并发/重放测试后，再使用新 run_id 独立重试 Smoke。

