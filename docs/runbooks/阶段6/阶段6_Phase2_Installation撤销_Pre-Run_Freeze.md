# 阶段 6｜Phase 2 Installation 撤销｜Pre-Run Freeze

- 批次 ID：`explorer-stage6-phase2-549147eec50c9288`
- 提示词实例 ID：`explorer-stage6-phase2-b113a9781f6a6f80`
- 审核票据 ID：`review-ticket-b113a9781f6a6f80`
- baseline HEAD：`3f607a5f72f7d9aca79e471f4592573e0e18123f`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:/AI workplace/探索者号/.git`
- linked worktree：`false`
- baseline `git status --porcelain=v1 -uall | Out-String` UTF-8 SHA-256：`4c87c8cdc9209bdb9eba0ce0fbe943f74aa6dc7b67374925e57ba39480e046b0`
- baseline status 字符数：`346467`
- baseline status 行数：`1935`
- baseline 非 `.pnpm-store/` 差异：`0`
- `.pnpm-store/`：阶段前未跟踪缓存噪声；本批禁止读取后写回、删除、整理、暂存或提交。

## 冻结文件

- 新 migration：`supabase/migrations/20260825033542_installation_revocation_lifecycle.sql`
  - 红灯前 SHA-256：`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`
- 新 pgTAP：`supabase/tests/0034_installation_revocation_lifecycle_test.sql`
  - 首次运行前 SHA-256：`57AF4294986F423BE28FA48CBB013217E46561A44B7C0CF8F1BDCF2C0DE06DEB`

## 开始前真实控制流

1. HTTP Webhook 在 JSON 解析和数据库访问前完成 body 大小、header 与 HMAC 校验。
2. `installation.deleted` 映射为 `revoked`，注册到 `github_webhook_deliveries` 后由 service-role `complete_github_webhook_installation` 完成。
3. 现有函数能把 Installation 置为 revoked，并阻止之后新注册的普通 Webhook 进入 dispatch；`suspend`/`unsuspend` 不会覆盖 revoked。
4. 缺口：不同 delivery 的重复撤销会覆盖 `revoked_at`；撤销事务不取消既存 queued Sync、pending dispatch、pending ordinary Webhook、reserved Energy 或 pending/running AI Invocation。
5. `request_project_sync` 已阻止 revoked 下的 Manual/Webhook/Reconciliation 请求；`create_sync_run`（First Sync）缺少 Installation 门；dispatch claim/complete 缺少撤销复核。
6. First Sync 与通用 Project Sync 仅在 worker 启动时检查一次 Installation；外部读取前及读取后持久化前缺少再次鉴权。
7. Project Brief 首次 Evidence 构建会检查授权，但 reserve、cache observation、provider 和 finalize 边界缺少统一复核；数据库 reserve/finalize 也未检查 Installation。
8. follow-up HTTP 生产依赖仍是显式 `follow_up_unavailable`，因此当前不会调用 AI provider；application 用例本身仍需在未来接线前具备授权门。
9. UI 展示组件已有 `Authorization revoked` 与 stale 说明，但真实连接查询只从最近 SyncRun 的错误码推断 revoked；只有撤销事件而没有新失败 run 时会误显 fresh。

## 状态与授权检查矩阵（红灯前）

| 边界 | 当前检查 | 缺口 |
|---|---|---|
| 验签 Webhook 注册 | HMAC 后注册 | 无 |
| Installation 完成 | service-role、pending/version | 未取消关联工作；重复撤销改时间 |
| 新 ordinary Webhook | 注册时要求 active | 已注册 pending/dispatching 未抑制 |
| First Sync 请求 | 项目存在 | 未检查 revoked/suspended |
| Manual/Webhook/Reconciliation 请求 | DB 检查 Installation | claim 与 dispatcher 调用前竞态 |
| Sync worker 启动 | 读取一次 context | 每次外部读取前、写入前缺检查 |
| Brief Evidence | source reader 检查 | reserve/provider/finalize 前缺检查 |
| Energy reserve/finalize | 所有权/额度/幂等 | 未检查 Installation |
| Project Galaxy | 最近 Sync error 推断 | 未直接读取 Installation 状态 |

## 合成 Lineage 与事件顺序

| Case | delivery ID | installation | project | task / operation | 预期 |
|---|---|---:|---|---|---|
| 首次撤销 | `f2490000-0000-4000-8000-000000000001` | `824001` | `f2430000-0000-4000-8000-000000000001` | queued run `f244...0001`; dispatch `f245...0001`; reservation `f246...0001`; invocation `f247...0001` | revoked；queued/pending 终止；reservation 释放；AI 失败 |
| pending Webhook | `f2480000-0000-4000-8000-000000000001` | `824001` | 同上 | ordinary dispatch | ignored，dispatcher 调用 0 |
| 重复撤销 | `f2490000-0000-4000-8000-000000000002` | `824001` | 同上 | 同一生命周期 | `revoked_at` 不变；重复副作用 0 |
| 乱序 suspend | `f2490000-0000-4000-8000-000000000003` | `824001` | 同上 | installation observation | 仍 revoked |
| 控制组 | N/A | `825002` | `f2530000-0000-4000-8000-000000000002` | run/dispatch/reservation/invocation 各 1 | 全部不变 |

## 分母冻结

- Installation 非 revoked → revoked：`1`
- 重复/乱序 installation 事件：`2`
- 可取消 queued Sync：`1`
- 可取消 pending project dispatch：`1`
- 可抑制 pending ordinary Webhook：`1`
- 已启动、需下一门失败关闭的 Sync：本 pgTAP 夹具 `0（N/A）`；由 application 聚焦测试覆盖。
- 可释放 reservation：`1`
- 可终止 pending/running invocation：`1`
- 撤销后新 First/Manual Sync 尝试：`2`
- 撤销后新 AI reserve/provider 尝试：由数据库与 application 聚焦测试冻结；每个入口至少 `1`。
- 应保留但标记 stale 的目标项目：`1`
- 不应变化的控制 installation/project/run/dispatch/reservation/invocation：`6`
- 目标 provider/GitHub/dispatcher 撤销后预期调用：`0`

## 最小预计修改文件

- 上述 migration、pgTAP 与本 Freeze；
- First Sync / Project Sync application 用例及其聚焦测试；
- Project Brief 生成、follow-up 授权门及其聚焦测试、最小 Supabase adapter/route wiring；
- Project Freshness reader 及其真实 revoked UI 测试；
- 生成数据库类型（仅真实 schema 变化所需）；
- 最终执行报告。

冻结后不改变合成 ID、分母和核心预期；若夹具结构性错误必须修正，将在最终报告保留原因与前后哈希。

## Freeze correction 1（首次红灯后）

- 原首次运行哈希和红灯证据保持不变。
- pgTAP 首次运行暴露 `github_installations.status` 的 `varchar/text` 比较类型差异，以及 migration 尚未创建 `project_sync_dispatches.safe_error_code`；前者仅对断言显式转为 `text`，后者由产品实现提供，不放宽业务预期。
- 补齐原需求中遗漏的独立 late `active` case `f2490000-0000-4000-8000-000000000004`；重复/乱序事件分母由 `2` 更正为 `3`，原因是原冻结只列了 replay + suspended，未完整覆盖用户明确要求的 active + suspended。
- 补齐撤销后新 Brief reservation 尝试 `phase2:new-brief`，分母 `1`；预期数据库在创建 reservation 和 daily grant 副作用前失败关闭。
