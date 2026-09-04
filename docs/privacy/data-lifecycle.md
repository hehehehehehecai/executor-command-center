# Privacy / Data Lifecycle

## 1. 文档边界

本文按当前代码和 migration 描述技术数据生命周期，不构成隐私政策、数据处理协议或法律合规承诺。数据保留期限、数据控制者联系人、跨境安排和法定例外需在公开发布前由有权人员确认。

## 2. 数据分类

| 类别 | 来源/示例 | 用途 | 主要边界 |
| --- | --- | --- | --- |
| 身份与授权 | Supabase Auth user、GitHub identity、Installation、repository selection | 登录与授权范围 | RLS、owner check、server verification |
| GitHub 事实 | repository metadata、commit/issue/PR/release/workflow/check snapshot | 同步、状态与 Evidence | 用户主动授权；GitHub read-only |
| 用户确认记录 | project profile/status history、Decision Record | 事实校准与决策追溯 | 不等同于系统建议 |
| 系统建议 | Candidate、Action Suggestion、Issue Draft | 用户参考 | 必须显式标记，不能自动发布/确认为事实 |
| AI 数据 | Brief/follow-up、Evidence fingerprint、usage/invocation | 结构化项目简报与 quota | 不可信输入隔离、schema/Evidence 校验 |
| 操作与审计 | sync run、Webhook delivery、removal/deletion operation、低敏 receipt | 幂等、重试、审计 | 不保存源码、Prompt/provider body 或 secret |
| 安全与配额 | rate bucket subject hash、Energy ledger | 原子限流与守恒 | 低基数、按用户/请求关联 |
| 合成测试 | `.example.test` / `.example.invalid` identity 与 fixture | 本地测试 | 不得复用真实账号/仓库；测试后清理 |

## 3. 采集与访问

用户使用 Supabase Auth 登录；GitHub OAuth 身份与独立 GitHub App Installation 分离。只有用户主动选择的授权仓库进入项目。代码只请求 `metadata/contents/issues/pull_requests/actions/checks: read`；真实控制台权限需在 Phase 8 回读。

Browser 只持有 public Supabase 配置和会话 cookie。Service Role、GitHub private key/Webhook secret、Inngest signing/event key、AI key 只允许 server/worker 使用。public 表由 RLS 保护，跨表写入经 owner check 和受限 RPC；客户端提交的 actor、project owner 或 table/filter 不能成为授权依据。

## 4. 同步、派生与 Prompt

同步保存经过投影的 GitHub metadata/snapshot，不把 GitHub token 持久化为业务数据。Webhook 保存 delivery lineage、digest 和受支持字段；HMAC 在解析/持久化前完成。

Project Brief 当前不把文档正文发送给 AI Provider，只发送已授权文档的 path/kind/fingerprint；project profile、GitHub summary/facts 和 confirmed decision 仍按不可信 repository-derived text 处理。输入有 UTF-8/control/262 KiB 上限、指令隔离与固定 system contract；输出必须通过 JSON/Zod/Evidence allowlist 才能持久化。

日志与公开错误只包含 request/operation ID、状态、reason code、timing 与不可逆 fingerprint，不得含 Prompt、Provider body、repository 正文、token、cookie、SQL 或 stack。

## 5. 正常保留与新鲜度

当前仓库没有经批准的按日/月通用保留期限，因此具体 retention 为**待确认**。在保留期间：

- GitHub snapshot 与 Brief 可因授权失效或 Provider outage 标记 stale，而不是伪装 fresh；
- Decision Record 和 status history 是用户确认记录；
- Energy/AI usage ledger 用于守恒和审计，不能因删除某个项目而误删其他项目或账户级额度；
- operation tombstone 只保留幂等/审计所需低敏字段。

## 6. Repository removal

### `REMOVE_REPOSITORY_DATA`

项目先进入阻止新 Sync/AI 的移除状态；删除 GitHub 来源数据、文档正文/派生内容和 AI snapshot/cache，保留用户确认归档、status history、Decision Record 和最小审计。保留记录中的 Evidence Link 显式标记 `SOURCE_REMOVED`、失效时间和 operation 关联，读取层不能再呈现为可验证证据。

### `DELETE_PROJECT_SUBTREE`

更强确认后按完整 FK/ledger 合同删除项目专属数据；账户级 ledger 只解除/归档项目关联，不影响用户其他项目。删除后只保留最小 operation tombstone，不含仓库名、文档、AI 内容或 Evidence 来源标识。同一幂等 key 重放返回同一结果。

## 7. Installation revocation

验签通过的 GitHub `installation.deleted` 使 Installation 单向 `revoked`。未执行的 Sync/Webhook/AI 工作取消或稳定终止；已启动工作在下一授权门 No-op；新 Sync/AI 失败关闭。历史项目数据保留但显示授权失效和 stale，不自动删除，也不自动重新授权。

## 8. 七天账户删除

状态机：

```text
active → deletion_pending → deleting → deleted | deletion_failed
```

申请由数据库 UTC 计算 `due_at = requested_at + 7 days`，申请后立即冻结新 Sync、AI、接入和派生写入。未 claim 且在七天窗口内可取消并恢复 active；进入 deleting 后不可取消。

到期 worker 单赢家 claim：先事务清理业务数据和属于目标账户的 Webhook metadata，再由 Auth Admin adapter 删除本地/目标 Auth identity。两边界不能伪装原子；Auth/业务 partial failure 写低敏状态并可重试。有限 worker retries 耗尽后，持久 marker/scanner/generation/lease 可重新派发；取消或新申请使用新 operation identity，旧 callback No-op。完成后只保留最小 tombstone，不保存 email、GitHub login、repository、Prompt、token 或 Provider 原始响应。

## 9. 删除例外与备份

数据库备份/PITR 可能在受限窗口内包含删除前数据；实际 plan、保留期、访问者和法定义务为外部待确认。恢复流程必须避免把已完成的 removal/revocation/account deletion 状态无意复活；见 [Database Restore Runbook](../runbooks/database-restore.md)。

本系统不承诺自动撤销用户在 GitHub 控制台中的 App Installation；Installation 撤销由 GitHub 权威事件驱动。账户删除也不等于删除 GitHub 侧资源。

## 10. 数据请求与待确认项

公开 Beta 前必须确认：隐私联系人、适用地区/法律基础、保留期限、备份删除窗口、Provider 数据处理条款、用户数据导出/访问流程和 Production incident 处理。当前仓库实现 repository/account removal，但没有可宣称完成的法律请求/SLA 流程。
