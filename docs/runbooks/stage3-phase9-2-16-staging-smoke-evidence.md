# Phase 9.2.16 并发 Release 修复后隔离 staging Smoke 证据

## 结论

总体结论：`BLOCKED`。部署、First Sync、First Sync replay、Release 并发专项、其余正常事件和 official redelivery 均通过；受控漏投 Issue 的固定分母失败。GitHub App 的 Issues 事件虽被临时取消并随后精确恢复，但唯一 missed Issue 仍产生了真实 delivery 并进入 snapshot，因此不得把该对象认定为漏投，也不得继续执行 Reconciliation 或 Freshness 收敛证明。

## 身份、基线与 Freeze

- 批次：`explorer-stage3-phase9-2-16-staging-smoke-a3fae4d6`
- prompt：`explorer-stage3-phase9-2-16-post-release-coalescing-smoke-a3fae4d6`
- 授权信封：`workflow-authorization.v1:a3fae4d623a278dc`
- 来源 A 级票据：`sha256:812c94b9135a86b7c5885ec4c97489d6919598a7600bb76c6d580ad81d400d5d`
- 产品基线：`a3fae4d623a278dcd12fdbf4a24491f4d3f961ad`
- tree：`685307f7b12e8d8fa117a7cc2e69532052cd5706`
- parent：`9d40fd841f42769e94873a920a540c4a18a98fe8`
- message：`fix(sync): retry coalesced webhook deliveries`
- run_id：`stage3-phase9-smoke-20260812T102108Z-63197518`
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-16-staging-smoke-freeze.json`
- Freeze SHA-256：`f2e78af392ea397e675f004ebd09ba7af109e354d346b34d81a4920452750bba`
- Freeze 创建时点：`2026-08-12T10:21:54.7531935Z`
- Freeze 创建后未回写。

## 隔离部署与 Provider 绑定

- 应用 `origin/staging` 仅一次 fast-forward：`2a430601ff4796927291006b483abfc797806b88` → `a3fae4d623a278dcd12fdbf4a24491f4d3f961ad`；未 force、未触碰 Production。
- Vercel：Hobby / Preview，deployment `dpl_G5gJ16ZP2JULDVuYLxD7CF6XDvxs`，状态 READY，branch `staging`，完整 SHA 与产品基线一致。
- deployment URL：`https://executor-command-center-jf6apemv0-hehehehehehecais-projects.vercel.app`
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`
- Supabase：项目 `gsnuorsqdcdszjxtymhs`，Free、ACTIVE_HEALTHY，migration `16/16`。
- Inngest：环境 `staging-7050a935`，Free；deployment-specific endpoint 指向本次 Preview；project sync、GitHub webhook、daily reconciliation 三函数与 `0 2 * * *` cron 存在；consumer 代码含 `github_webhook_sync_coalesced` 与 retries=5。
- GitHub App：App `4480141`，installation `151329457`，selected-only 且仅仓库 `hehehehehehecai/explorer-staging-private-test-20260804`（ID `1322569219`）。权限保持 actions/checks/contents/issues/metadata/pull_requests read；事件为 issues/pull_request/push/release/repository/workflow_run；Webhook Active，SSL verification enabled。
- 成本：免费或现有套餐内；无 Trial、无升级、无付款。

## Gate 1：First Sync 与 replay

- request identity：`stage3-phase9-smoke-20260812T102108Z-63197518-first-sync`
- 首次 HTTP：202；SyncRun / provider job：`9f4f27ea-3030-431c-855c-f2f1068ede9d`
- 终态：completed/version 10；trigger `first_sync`；error 为空。
- 时间：queued `2026-08-12T10:24:05.481246Z`；started/last progress/finished `2026-08-12T10:24:07.225Z`，时间顺序合法。
- progress cursor 非空，安全序列化长度 917；repository、commit、issue、pull_request、release、workflow_run 六组 `6/6` 完成。
- 同 identity replay：HTTP 200 / `first_sync_reused`；同一 SyncRun；新增 SyncRun 0、dispatch 0、snapshot 0。

## Gate 2A：Release 并发专项

唯一 prerelease：

- Release database ID `369155888`
- node `RE_kwDOTtTOA84WAN8w`
- tag 精确等于 run_id
- prerelease=true，published `2026-08-12T10:27:09Z`

本次单次 Release 操作产生的四条 supported delivery 均进入 terminal completed，均有独立 SyncRun、dispatched project dispatch 与非空 provider job：

| 事件 | delivery | SyncRun | 终态 |
| --- | --- | --- | --- |
| release/published | `5fcecf40-9638-11f1-8d95-12092fbded2a` | `78f62753-3965-48f1-8e9c-b496dd34abef` | completed |
| release/prereleased | `5fbea2a0-9638-11f1-8d68-cec151be84e7` | `7f3807a3-dcc1-467b-accf-634eab404a98` | completed |
| release/created | `5fc643c0-9638-11f1-865d-5efa44466c35` | `053d3c8b-29ee-479a-b3b4-b54223915301` | completed |
| tag push | `5fee2020-9638-11f1-84b7-48b50d3c3e76` | `4e5d4d4f-2439-44ea-a401-96b26aa609c1` | completed |

对应 Inngest runs：`01KZTR60RDWKFWRJ00TQ025X1B`、`01KZTR5ZY22QD56EQ2STDK6CPJ`、`01KZTR60ZJPFXERFNZTHHS7XK4`、`01KZTR60GMH90YTHWTN23N0GNC`，最终均 Completed。Release exact object/tag 计数 1；tag 指向 SHA `4107e7210f5ae10920e5341d18d0cdd4565fb983`，commit snapshot exact count 1。Release 类型 `1/1`，实际 Release delivery `4/4` terminal。

## Gate 2B：其余正常事件

### Push

- branch：`stage3-phase9-smoke-20260812T102108Z-63197518`
- after SHA：`feb0356dc11341c844678d15199f37416004c6bb`
- delivery：`57517862-9639-11f1-8e37-c6fda8b9b40b`
- SyncRun：`ce83e8cc-febc-4bbe-951e-fba09a760ea9`
- dispatch：`dc7493e8-eaff-41c3-b7e9-ec857aaef34b`
- 终态 completed；目标 commit snapshot exact count 1。

### Issue

- Issue #3，database ID `5129926396`，node `I_kwDOTtTOA88AAAABMcR2_A`
- delivery：`7c00e8dc-9639-11f1-8bf5-c06cc2bfad71`
- SyncRun：`02798816-f457-44bb-a540-6e08fd40ded8`
- dispatch：`1789dffe-5f01-4e27-90d2-63e44a29cea0`
- 终态 completed；snapshot exact count 1。

### Pull Request

- PR #4，database ID `4261446278`，node `PR_kwDOTtTOA87-AIKG`
- head SHA：`feb0356dc11341c844678d15199f37416004c6bb`
- delivery：`a1c0b7a0-9639-11f1-907f-9dcdc065519e`
- SyncRun：`0c2c0b59-f2ee-4060-8b25-a5204602ec96`
- dispatch：`c5d80183-9012-4768-88b9-97d4a35b53fe`
- 终态 completed；未 Merge；snapshot exact count 1。

### Workflow

- 唯一 main 例外文件：`.github/workflows/stage3-phase9-smoke.yml`；内容虚构、无秘密、使用免费 GitHub Actions。
- workflow ID `332669341`；run ID `31588693048`；node `WFR_kwLOTtTOA88AAAAHWtU0OA`；run number 1。
- head SHA：`a25f37b2d805ff8a7bade2e98f4e676b6dc15029`；conclusion success。
- requested delivery `ac9d3710-963a-11f1-98af-0a7c1062bcf2` / SyncRun `72bd6cf5-3ee4-44dc-b246-7ef733a12ab6`
- in_progress delivery `b04e3120-963a-11f1-98e3-0008fed26362` / SyncRun `eb9eecca-aeba-4faf-8d57-6b4f3070bf4a`
- completed delivery `b28c8860-963a-11f1-9a3a-e33443f52153` / SyncRun `5ffdcd7d-b6a4-4314-8102-116edbbfe045`
- 三条 delivery 均 completed，均有 dispatched project dispatch 与 provider job；workflow snapshot exact count 1。

正常事件类型结果：Push、Issue、PR、Release、Workflow `5/5`。正式 Gate 2 的实际 lineage 分母为 Release 4 + Push 1 + Issue 1 + PR 1 + Workflow 3 = `10/10` terminal。创建 workflow 文件另产生一条 main push；最终批次窗口的所有数据库 delivery 均为 completed 且具有 SyncRun/provider receipt。

## Gate 3：duplicate 与受控漏投

### Official redelivery

对正常 Issue delivery `7c00e8dc-9639-11f1-8bf5-c06cc2bfad71` 使用 GitHub 官方 Redeliver 一次。前后均为：delivery count 1、SyncRun count 1、dispatch count 1、snapshot count 1、delivery completed/version 5；新增逻辑结果为 0。duplicate `1/1 PASS`。

### 受控漏投失败

修改前 GitHub App 配置 canonical：

`events=issues,pull_request,push,release,repository,workflow_run|permissions=actions:read,checks:read,contents:read,issues:read,metadata:read,pull_requests:read|active=true|ssl=true`

配置指纹：`37aa505679cbe8b8b397728ab4fba617eb22ed7d9b9031a698a526d8e1139bc0`。

仅取消 Issues 事件并保存后，事件读回为 pull_request/push/release/repository/workflow_run；未修改权限、URL、Active、SSL 或其他事件。随后创建唯一 missed Issue：

- Issue #5
- database ID `5130138227`
- node `I_kwDOTtTOA88AAAABMceycw`
- created `2026-08-12T11:02:20Z`

Issues 事件随后立即重新勾选并保存。重新载入页面后六类事件全部恢复；Save changes 为 disabled；General 页面读回 Active=true、SSL verification enabled。恢复后的 canonical 与修改前逐字段一致，配置恢复 `1/1 PASS`。

然而 staging 数据库权威事实显示漏投条件未成立：

- delivery `4a8b10a8-963d-11f1-988b-1834615680d5`
- event/action `issues/opened`
- received `2026-08-12T11:02:22.316Z`
- status completed/version 5
- SyncRun `e0f2c43d-650d-4fcc-93c6-81c6a910267a`
- provider receipt 存在
- 目标 Issue snapshot 在 `2026-08-12T11:02:38.837688Z` 创建，exact count 1

因此固定期望 delivery/snapshot `0/0`，实际 `1/1`；controlled missed Issue `0/1 FAIL`。首轮失败未删除、未换对象重做、未 redeliver、未手工改库。

按照硬停止规则，Reconciliation/Manual Resync 与 Freshness 收敛均为 `NOT RUN`，固定分母分别保留为 `0/1`。本批没有制造第二个漏投对象。

## 最终只读计数

项目最终只读计数：SyncRun 25、project dispatch 18、webhook delivery 24、commit snapshot 4、issue snapshot 3、pull request snapshot 2、release snapshot 2、workflow run snapshot 1。批次窗口内 deliveries 的 event/action 分组均为 completed，均具有 SyncRun 与 provider receipt。

## 本地门禁

| 门禁 | 首轮 | 最终 | 分母 / skip |
| --- | --- | --- | --- |
| 全量单元 `pnpm test` | 执行环境在约 124 秒终止，Exit 124 | 同命令唯一复验 Exit 0 | 99 files；1026/1026；skip 0 |
| application integration | Exit 0 | Exit 0 | 18 files；62/62；required skip 0 |
| Local Supabase pgTAP | Exit 0 | Exit 0 | 18 files；570 tests；skip 0 |
| module boundaries | Exit 0 | Exit 0 | 1 file；36/36；skip 0 |
| production E2E | Exit 0 | Exit 0 | 2/2；skip 0 |
| lint | Exit 0 | Exit 0 | warnings 0 |
| typecheck | Exit 0 | Exit 0 | errors 0 |
| database lint | Exit 0 | Exit 0 | errors 0 |
| database types | Exit 0 | Exit 0 | up to date |
| schema drift | Exit 0 | Exit 0 | empty |
| `git diff --check` | Exit 0 | Exit 0 | whitespace errors 0 |

Local Supabase 测试后已安全停止。E2E 把 `next-env.d.ts` route reference 改为 dev 路径；前后 SHA 和 diff 证明该变化来自本次工具，已精确恢复，最终 Git blob 与 HEAD 相同。

## 失败记录与安全边界

- 两次只读 SQL 初查使用了不存在的列名 `dispatched_at`、`github_number`，各自 Exit 非 0；通过 information_schema 只读确认列名后修正，无数据库副作用。
- 一次最终汇总只读 SQL引用不存在的 `github_repositories` 表而失败；缩小为现有 snapshot 表后成功，无数据库副作用。
- 强特征扫描首轮因以连字符开头的模式被 `rg` 误判为选项而 Exit 1；使用显式 `-e` 后完成扫描，Exit 1 表示 0 命中。
- 官方 redelivery 页面曾在浏览器工具输出中显示 provider 请求详情；这些内容未复制到仓库、evidence 或报告。本文件只保留安全 ID、状态和时间。
- 本批 diff 的强特征扫描要求：凭据值、private key、JWT、Cookie 值、Authorization 值、provider secret 值、raw payload/header 为 0 命中。
- 未执行 Production、Promotion、Merge、force push、其他仓库、付费或 Trial。

## 分母与裁决

- deployment/version binding：`1/1 PASS`
- First Sync：`1/1 PASS`
- First Sync replay：`1/1 PASS`
- snapshot groups：`6/6 PASS`
- normal event types：`5/5 PASS`
- Release actual deliveries：`4/4 PASS`
- Gate 2 actual normal deliveries：`10/10 PASS`
- duplicate replay：`1/1 PASS`
- controlled missed Issue：`0/1 FAIL`
- webhook configuration restore：`1/1 PASS`
- Reconciliation repair：`0/1 NOT RUN`
- Freshness convergence：`0/1 NOT RUN`
- required skipped：`0 PASS`

总体为 `BLOCKED`，不能判定阶段 3 完成。下一步应由独立审核判断 GitHub App 事件配置变更是否存在异步生效窗口，并设计新的、明确等待 Provider 配置生效确认的独立 Smoke；本批不自动进入下一任务。

## 远端副作用与清理状态

- 应用 `origin/staging` fast-forward 1 次；保留。
- Vercel Preview 自动部署 1 次；保留，未 Promotion。
- First Sync 1 次及同 identity replay 1 次。
- prerelease/tag 1 组、测试 branch/commit 1 组、正常 Issue 1、PR 1、workflow main 单文件 1、workflow run 1。
- official redelivery 1 次。
- GitHub App Issues 事件 disable/restore 1 个受控窗口，最终配置已恢复。
- missed Issue 1；因 Provider 仍送达，已正常同步。
- Reconciliation/Manual Resync 0。
- 未删除、未合并、未清理本批远端对象，全部保留供独立审核。
- Production、其他仓库、付费/Trial：0。

是否进入下一阶段：否，停止并等待审核。
