# 探索者号｜阶段 6｜Phase 5 核心 E2E 覆盖矩阵

## 1. 冻结基线与证据边界

- 合同：`beta-core-e2e.v1`、`e2e-case-isolation.v1`、`synthetic-external-boundary.v1`、`phase4-security-preservation.v1`
- baseline HEAD：`414a7a31af04b5b37e2a7b05e89661623cccec75`
- 分支：`feature/stage4-bridge-five-panels`
- baseline status SHA-256：`6445e27e0e07b02ac9f34ba8d9bb3acb7a11caef0620f37a366492860869d7e1`
- 阶段前未跟踪项：仅 `.pnpm-store/`；本批排除，不修改、不暂存、不提交。
- 既有浏览器基线：默认 E2E 14/14、connected-panels 8/8、auth fixture 1/1，skip 0。
- 既有三组浏览器测试分别以 Demo、进程内 Connected fixture、合成 Auth HTTP 为主，不能单独证明真实本地数据库串联；Phase 5 新套件以真实 localhost Next.js、真实本地 Supabase、合成 GitHub/AI/Inngest 边界补足。

## 2. 架构与文件职责

- `playwright.core-journeys.config.ts`：单 worker、case 独立、失败保留 trace。
- `scripts/run-core-journey-e2e.mjs`：启动 localhost Next.js 与合成 provider，读取本地 Supabase 安全运行参数但不回显凭据；每次运行生成独立 run ID、数字外部 ID 与控制令牌。
- `tests/e2e-core-journeys/core-journeys.spec.ts`：15 类旅程、16 个浏览器 case；从可见入口发起真实 HTTP，并精确登记预期与非预期浏览器错误。
- `tests/e2e-core-journeys/phase5-fixture.ts`：使用 production RPC 建立独立合成身份/Installation/Repository/Project；只为到期条件调整数据库权威相对时间；清理时复用真实账户删除 application/adapter，并按用户指纹清除短期限流 bucket。
- `src/features/project-galaxy/ProjectLifecycleActions.tsx`：真实 Connected Project Galaxy 的 First Sync、Manual Resync、Validated Brief 最小入口。
- `src/app/api/testing/phase5/session/route.ts`、`src/app/api/testing/phase5/account-deletion/execute/route.ts`：仅 `NODE_ENV !== production`、`PHASE5_E2E=1`、同源且请求级控制令牌匹配时可用，否则 404。
- `project-brief-generation-route-dependencies.ts`：仅显式非生产 Phase 5 环境将 AI 请求重定向到 localhost 合成 provider；生产环境继续使用原 provider 合同。

## 3. 核心旅程注册表

| ID | 旅程 | 真实用户入口/动作 | 可见终态 | 持久化、失败与重试证据 | 外部与清理边界 |
|---|---|---|---|---|---|
| E2E-01 | Demo 探索 | `/` → Project Galaxy Demo | 虚构数据与 Preview Mode 可见 | 不建立 Auth/业务行 | 非 localhost 请求 0 |
| E2E-02 | Onboarding | 无控制令牌会话请求 404；合成凭据建立 SSR session 后打开 `/onboarding` | 登录、active Installation、精确仓库 full name 可见 | 真实 local Auth/RLS；无令牌副作用 0 | case 后走真实账户删除清理 |
| E2E-03 | First Sync | Project Galaxy 点击“启动首次同步” | `first_sync_accepted` 与 durable `syncRunId` 可见 | 真实 API → application → `create_sync_run` → 合成 Inngest receipt | 无真实 dispatcher |
| E2E-04 | Webhook 增量/replay | 对真实 `/api/github/webhook` 投递 raw-body HMAC 请求两次 | 首次 202 accepted，重放 200 duplicate | 同 delivery 重放无第二次 dispatch | 合成 payload，不访问 GitHub |
| E2E-05 | Manual Resync | Project Galaxy 点击“手动重同步” | `manual_resync_accepted` 与 run receipt 可见 | 真实授权、限流、Sync RPC | 合成 dispatcher |
| E2E-06 | Status Confirmation | Onboarding 保存状态为 `polishing` 后 reload | 保存反馈与 reload 后状态一致 | 真实 `save_project_calibration` 持久化 | case 后账户级清理 |
| E2E-07 | Action Suggestion / Issue Draft | Mission Control 接受建议 | accepted、本地 Issue Draft 与“不会创建 GitHub Issue”可见 | 当前产品合同为本地预览；production DB/外部副作用 0 | 不伪装 GitHub Issue 创建 |
| E2E-08 | Decision Record | Decision Archive 手动填写并确认 | 决策、原因、本地“未持久化”状态可见 | 当前产品合同为本地预览；production DB/外部副作用 0 | 不伪装持久化成功 |
| E2E-09 | Validated Brief / Quota / Cache | 同一 Project Galaxy 页面连续生成两次 | 首次 `generated · energy 3`，第二次 `cache_hit · energy 0` | 同一 evidence/range；provider 调用增量 1，cache 不重复扣减 | schema-valid localhost provider |
| E2E-10 | Provider Failure Refund | provider 首次 503，用户在同页重试 | 先稳定 `project_brief_provider_failure`，再 `generated · energy 3` | 若未退款余额不足以重试；成功重试证明 reservation/refund 收敛 | 预期 502 console 1，非预期错误 0 |
| E2E-11 | Installation Revocation | 验签 `installation.deleted` 后查看 Onboarding，再尝试 First Sync | revoked/stale 可见，新 Sync 409 | 真实 Webhook revocation 与授权门；稳定 `first_sync_authorization_revoked` | 预期 409 console 1 |
| E2E-12A | Repository Data Removal | 强确认 `REMOVE <projectId>` | “仓库数据已移除”与 `SOURCE_REMOVED` 可见 | 真实 repository-removal API/RPC；项目保留 | case 后账户级清理 |
| E2E-12B | Project Subtree Delete | 强确认 `DELETE <projectId>` | “项目已删除”可见 | 真实项目子树删除与最小 tombstone 合同 | case 后账户级清理 |
| E2E-13 | Account Delete Request | Onboarding 强确认申请 | 七天恢复窗口与“已冻结”可见 | `deletion_pending`、数据库 UTC due_at；新工作门沿用 Phase 3 | 最终由真实删除链清理 |
| E2E-14 | Account Delete Cancel | pending 状态点击撤销 | “账户当前为正常状态”可见 | 真实 cancel RPC；随后可重新申请并清理 | 旧 pending 不继续执行 |
| E2E-15 | Account Delete Complete | UI 申请；测试只调整 `requested_at/due_at` 的数据库相对时间 | 无控制令牌执行 404；Auth partial failure 后重试完成，页面回到“尚未登录” | `deletion_failed/outcome=failed` → 同 operation → `deleted`；业务清理、Auth Admin、already-absent 均走真实实现 | 预期 404 console/request-failed 各 1，非预期 0 |

## 4. TDD 红绿与独立性

- 红灯：测试会话入口不存在时 404；First Sync/Brief 按钮不存在时 locator 超时；Phase 5 旧夹具直接删 Auth 在 Energy ledger `RESTRICT` 下失败；旧清理遗漏限流 bucket 导致后续数据库全局计数失败。
- 最小修复：增加 Connected 项目操作入口、非生产合成边界、请求级控制令牌、唯一 run identity；清理复用 Phase 3 账户删除链而非复制删除顺序。
- 每次运行每个持久 case 使用唯一 Auth user、Installation、Repository、Project、delivery、request key；无固定共享邮箱或 delivery。
- 最终证明：洁净库运行 Phase 5 16/16 后，不再 reset，立即运行完整 pgTAP 44 files / 1001 tests 仍通过。

## 5. 冻结分母与最终指标

- 核心旅程 15 类；Repository Removal 两种选择独立计数，总 case 16，最终 16/16，skip 0。
- 真实本地 HTTP/UI：16/16；真实本地 Supabase/Auth：除纯 Demo/本地预览 case 外均按实际需要串联。
- 真实 GitHub、AI、Inngest、Production 调用：0。
- Brief cache：请求 2，provider 调用 1，扣减 1，cache 重复扣减 0。
- Provider failure：失败 1、退款后成功重试 1、非授权 Energy 消耗 0。
- Webhook replay：重放 1、重复 dispatch 0。
- Account complete：Auth partial failure 1、同 operation 成功重试 1、最终 deleted 1。
- 预期浏览器 console error：4（404×2、409×1、502×1）；预期 request-failed：2（两个无令牌 404）；非预期 console/page/request error：0。
- case 清理后数据库回归：44/44 files、1001/1001 tests；全局计数污染 0。
