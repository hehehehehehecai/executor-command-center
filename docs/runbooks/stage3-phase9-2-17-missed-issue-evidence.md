# 探索者号｜阶段 3｜Phase 9.2.17 受控漏投稳定窗与恢复链路证据

## 1. 结论

- 执行状态：`BLOCKED（产品恢复链路成功，严格取样协议与真实 UI 证据未完全满足）`
- 产品事实：Issue #5 的 `issues/closed` Webhook 确实漏投；GitHub App 配置已恢复；唯一一次正式 Manual Resync 创建唯一 SyncRun/dispatch，并把唯一快照从 stale `open` 收敛为 GitHub 权威 `closed`；同 identity replay 为稳定 `duplicate`。
- 协议偏差：两个 90 秒窗口均超过要求，但浏览器/工具开销导致没有形成逐一精确的 `30/60/90` 与每 `15` 秒直接采样。最终不可变 delivery 记录与数据库单调事实能够证明窗口内没有 delivery/snapshot mutation，但不能冒充按时直接采样。
- UI 边界：真实 `/project-galaxy` 路由返回 404。Freshness 由数据库最新成功时间、活动 run 计数及冻结的 `freshness-status.v1` 规则交叉验证；没有用演示 Command Deck 冒充真实 UI 证据。
- 远端产品/配置最终安全状态：GitHub App 原配置已恢复；Issue #5 保持 `closed`；无 Production、付费、其他仓库或数据库手写。

## 2. 基线与累计证据

- HEAD：`e231a372f7e7fa982e89f098a4972f8f540732fe`
- tree：`f953fceb35aeb53be60d1b8074f85a648912b5e5`
- parent / 已部署产品：`a3fae4d623a278dcd12fdbf4a24491f4d3f961ad`
- message：`test(sync): record blocked post-coalescing staging smoke`
- `origin/staging`：`a3fae4d623a278dcd12fdbf4a24491f4d3f961ad`
- Vercel deployment：`dpl_G5gJ16ZP2JULDVuYLxD7CF6XDvxs`，Preview / READY / `staging`
- Phase 9.2.16 Freeze SHA-256：`f2e78af392ea397e675f004ebd09ba7af109e354d346b34d81a4920452750bba`
- Phase 9.2.16 evidence SHA-256：`66297981211b45a77d8781a0db586595c5aa33fe9028683bbdcaae6bf5cc35d3`
- Phase 9.2.16 已部署产品与全门禁证据按不可变 commit 累计复用，本批未重复部署、First Sync、普通事件或全量门禁。

## 3. 不可回写 Freeze

- 路径：`tests/fixtures/synchronization/stage3-phase9-2-17-missed-issue-freeze.json`
- 创建时刻：`2026-08-12T11:51:02.2320484Z`
- SHA-256：`fe459c2fd4ecef202bb85f4fef58c9df40dabf469acf1f28adecaa1a702aaa9c`
- Freeze 在任何本批有效 Provider 写入前创建，之后未回写。

### 配置哈希口径校正

Freeze 中记录的规范化配置字符串正确，但其 `sha256` 字段误记为 `92273b9e...`。对该字符串按 UTF-8 重新计算，正确 SHA-256 为：

`e58df285c1631af945962b8337e411a22b2fca895106fb0d87cd61855d43c350`

原始字段集合与恢复后的字段集合逐项相同，二者用同一 UTF-8 规范化口径均得到 `e58df285...`。Freeze 保持不可回写；本 evidence 只登记计算口径错误，不追认修改。

## 4. 固定对象与前置读数

- repository：`hehehehehehecai/explorer-staging-private-test-20260804`（ID `1322569219`）
- Issue：`#5`，GitHub object ID `5130138227`
- 已有 opened delivery：`4a8b10a8-963d-11f1-988b-1834615680d5`
- 已有 SyncRun：`e0f2c43d-650d-4fcc-93c6-81c6a910267a`
- 前置 snapshot：唯一 1 条，state=`open`
- 前置 source_version：`2026-08-12T11:02:20.000Z`
- 前置 source_updated_at：`2026-08-12T11:02:20Z`
- 前置 updated_at：`2026-08-12T11:02:38.837688Z`
- Issue delivery 数：3；最大 received_at：`2026-08-12T11:02:22.316Z`

## 5. GitHub App 原配置与恢复

原始配置与最终读回均为：

- events：`issues,pull_request,push,release,repository,workflow_run`
- repository permissions：`actions:read,checks:read,contents:read,issues:read,metadata:read,pull_requests:read`
- Webhook Active：`true`
- SSL verification：开启（`insecure_ssl=0`）
- installation：`selected-only:1`
- 唯一 repository：ID `1322569219`

只临时取消 `issues`；未改 URL、secret、权限、Active、SSL、安装范围或其他事件。恢复后逐字段一致，规范化 SHA-256 前后均为 `e58df285c1631af945962b8337e411a22b2fca895106fb0d87cd61855d43c350`。

配置变更产生的允许范围内审计对象：`installation.new_permissions_accepted` delivery `bbff9650-9647-11f1-8a91-b5f35731cf6e`。未产生其他仓库业务写入。

## 6. 第一个 90 秒禁用稳定窗

`issues` 取消后首次有效读回：`2026-08-12T12:17:32.8075234Z`。

因浏览器自动化往返开销，为避免伪造时间点，在 `2026-08-12T12:19:05.8127633Z` 建立新的只读观察锚点；期间仓库写入为 0。

| 实际采样时刻 | 相对锚点 | `issues` | 其他五类事件 | 仓库写入 |
|---|---:|---|---|---:|
| `2026-08-12T12:19:51.4627166Z` | 约 46 秒 | 缺失 | 一致 | 0 |
| `2026-08-12T12:20:24.5093075Z` | 约 79 秒 | 缺失 | 一致 | 0 |
| `2026-08-12T12:21:20.6546611Z` | 约 135 秒 | 缺失 | 一致 | 0 |

稳定禁用持续超过 90 秒；但实际采样不是精确 30/60/90 秒，因此按严格协议登记偏差，不把 46/79/135 冒充计划时点。

## 7. Issue #5 唯一状态变更与第二个观察窗

- 关闭动作开始记录：`2026-08-12T12:22:34.8428206Z`
- 只执行一次 `open -> closed`
- 页面确认关闭：`2026-08-12T12:22:48.9118671Z`
- GitHub 权威 `updated_at/closed_at`：`2026-08-12T12:22:38Z`
- 未修改标题、正文，未 reopen，未进行第二次 close。

只读观察：

| 实际采样时刻 | 约相对动作开始 | GitHub `issues/closed` delivery | staging closed delivery | Issue #5 snapshot |
|---|---:|---:|---:|---|
| `2026-08-12T12:23:52.5282531Z` | 78 秒 | 0 | 0 | 仍为 `open`，版本/时间不变，数量 1 |
| `2026-08-12T12:24:52.1443565Z` | 137 秒 | 0 | 0 | 仍为 `open`，版本/时间不变，数量 1 |

最终 delivery 列表没有目标 `issues/closed`，staging delivery 表也没有动作时间后的目标 delivery；delivery 记录只增不减，快照 `updated_at/source_version/source_updated_at` 最终仍为前值，因此可以证明整个窗口没有业务 delivery 或 snapshot mutation。未形成每 15 秒直接采样，按协议偏差保留。

## 8. 正式 Reconciliation / Manual Resync

GitHub App 配置恢复并再次逐字段读回后，staging OAuth 验证：

- `authenticated=true`
- `github_app_installation=active`
- `selected_repository_count=1`
- 固定 repository 与 Project `81630aa3-a101-421c-b31e-dc16d1592c31` 映射可见

触发前只读计数：SyncRun 25、dispatch 18、issue snapshot 3、Issue #5 snapshot 1。

通过产品正式 endpoint：

`POST /api/projects/81630aa3-a101-421c-b31e-dc16d1592c31/resync`

安全 request identity：`phase9-2-17-issue5-reconcile`

首次响应：HTTP 202，`manual_resync_accepted`。

### 唯一业务 lineage

- SyncRun：`6af8854d-a309-4d40-b065-d37eae655e37`
- trigger_source：`manual`
- idempotency_key：`sync-request:manual:phase9-2-17-issue5-reconcile`
- terminal：`completed`
- version：3
- queued_at：`2026-08-12T12:49:19.421Z`
- started_at / finished_at：`2026-08-12T12:49:22.397Z`
- error_code：null
- dispatch：`8a17f2e2-85e8-476a-8cd5-811de1b5a457`
- request_identity：`manual:phase9-2-17-issue5-reconcile`
- dispatch_status：`dispatched`
- dispatch version：3
- provider job：存在（仅记录布尔，不保存 provider 内容）

触发后计数：SyncRun 26、dispatch 19、issue snapshot 3、Issue #5 snapshot 1。即新增恰好 1 run、1 dispatch、0 重复 issue snapshot。

### Issue #5 收敛

- state：`open -> closed`
- source_version：`2026-08-12T11:02:20.000Z -> 2026-08-12T12:22:38.000Z`
- source_updated_at：`2026-08-12T11:02:20Z -> 2026-08-12T12:22:38Z`
- updated_at：`2026-08-12T11:02:38.837688Z -> 2026-08-12T12:49:26.226506Z`
- closed_at：`2026-08-12T12:22:38Z`
- exact snapshot count：始终 1

版本和时间均单调前进，且与 GitHub 权威关闭时间一致。

## 9. Replay / no-op

对同一 endpoint 和同一 request identity 只 replay 一次：

- HTTP：200
- result：`duplicate`
- code：`manual_resync_duplicate`
- SyncRun：仍为 `6af8854d-a309-4d40-b065-d37eae655e37`
- 最终 SyncRun：26；目标 run 数：1
- 最终 dispatch：19；目标 dispatch 数：1
- issue snapshot：3；Issue #5 snapshot 数：1

因此 replay 新增 run=0、dispatch=0、snapshot=0。

## 10. Freshness

只读数据库观测：

- observed_at：`2026-08-12T12:52:25.265681Z`
- last_successful_at：`2026-08-12T12:49:22.397Z`
- age：183 秒
- queued/running active count：0
- latest relevant run：completed，无错误

依据仓库冻结的 `freshness-status.v1` 24 小时规则，结果为 `fresh`；时间顺序合法。

真实 `/project-galaxy` 页面返回 404，因此本批没有可见真实 Freshness UI 证据。根页面为固定演示数据，明确未用其替代真实状态。此项后端/合同 PASS、UI BLOCKED。

## 11. 安全、范围与门禁

- 本批产品代码修改：0
- 本批 migration/schema/RLS/RPC 修改：0
- 手写数据库：0；所有 staging 数据库查询均使用 `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`
- GitHub 新 Issue/PR/Release/Workflow/Push/redelivery：0
- 允许的远端写：GitHub App `issues` disable 1、Issue #5 close 1、GitHub App restore 1、Manual Resync 1、同 identity replay 1
- GitHub App 最终配置：已恢复
- Production、付费、Trial、其他仓库：0
- Phase 9.2.16 全门禁：按不可变产品 commit 累计复用，未重复运行
- 本批只运行：Freeze/evidence JSON/内容检查、范围检查、secret 扫描、`git diff --check`

## 12. 裁决

| 目标 | 结果 |
|---|---|
| Freeze 在 Provider 写入前且未回写 | PASS |
| GitHub App 仅禁用 Issues 并恢复逐字段一致 | PASS |
| 禁用稳定超过 90 秒且无仓库写入 | PASS（直接采样时点偏差） |
| Issue #5 唯一 close | PASS |
| 漏投窗口 provider delivery=0 / staging delivery=0 / snapshot mutation=0 | PASS（缺每 15 秒直接采样） |
| Reconciliation 唯一 SyncRun/dispatch completed | PASS |
| Issue #5 唯一快照收敛且版本单调 | PASS |
| replay/no-op | PASS |
| Freshness 后端/合同 | PASS |
| Freshness 真实 UI | BLOCKED（route 404） |
| 严格观察采样协议 | BLOCKED（实际采样非计划频率） |

总体为 `BLOCKED`，不能据此自行宣布阶段 3 完成或进入收口审核；产品漏投恢复能力本身已获得真实 staging 正向证据，剩余阻塞是证据协议完整性与真实 UI 路由。
