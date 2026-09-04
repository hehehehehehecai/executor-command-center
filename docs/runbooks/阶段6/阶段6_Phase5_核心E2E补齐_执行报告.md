# 探索者号｜阶段 6｜Phase 5 核心 E2E 补齐执行报告

## 1. 编排与授权

- 批次 ID：`explorer-stage6-phase5-8b7b13957f5fca71`
- 提示词实例 ID：`explorer-stage6-phase5-24af51ea49af2a4e`
- 审核票据 ID：`review-ticket-24af51ea49af2a4e`
- 授权策略：`workflow-authorization.v1`
- 目标仓库：`D:\AI workplace\探索者号`
- 结论范围：仅 Phase 5；等待独立审核，未进入 Phase 6。

## 2. Pre-Run Freeze

- baseline/final parent HEAD：`414a7a31af04b5b37e2a7b05e89661623cccec75`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:/AI workplace/探索者号/.git`
- baseline `git status --porcelain=v1 -uall | Out-String` 字符数：17。
- baseline status SHA-256：`6445e27e0e07b02ac9f34ba8d9bb3acb7a11caef0620f37a366492860869d7e1`。
- 阶段前差异仅 `.pnpm-store/`。本批未修改、删除、暂存或提交其中内容；状态工具曾枚举其路径元数据，但未读取文件正文，后续均使用排除式状态审计。
- 既有浏览器分母：默认 E2E 14、connected-panels 8、auth fixture 1。
- 新增分母：15 类旅程、16 个独立 case；localhost Next.js 3015、合成 provider 4015；每次运行生成唯一 run ID、用户、Installation、Repository、Project、delivery 和控制令牌。

覆盖与 lineage 详见：[阶段6_Phase5_核心E2E覆盖矩阵.md](./阶段6_Phase5_核心E2E覆盖矩阵.md)。

## 3. 开始前审计与缺口

1. 默认 E2E 是真实本地 UI/HTTP，但只覆盖虚构 Demo。
2. connected-panels 覆盖两用户界面隔离，但后端为进程内 fixture，仓库移除由 Playwright fulfill。
3. auth fixture 验证合成 OAuth/SSR cookie，但业务 REST 故意失败关闭为 503。
4. First Sync、Manual Resync 与 Validated Brief 在真实 Connected Project Galaxy 缺少最小用户入口。
5. 账户申请/撤销已有 UI，完整删除只有 application/integration/pgTAP，无浏览器到 Auth Admin 的串联。
6. 既有 runner 没有统一记录 console/page/request failure，也没有证明 destructive/AI case 清理后不污染下一套数据库测试。

证据分类：Phase 5 新套件计入“真实本地 UI/HTTP + 真实本地 Supabase/Auth + 合成外部边界”；纯 Demo/本地预览旅程明确不冒充数据库或外部写入。

## 4. TDD 红灯与根因修复

- 会话 bootstrap route 不存在：真实请求 404。
- First Sync、Manual Resync、Brief 按钮不存在：Playwright locator 超时。
- 早期固定合成 email/delivery 在中断后产生偶然复用：改为每次运行唯一稳定 identity。
- Supabase CLI 遥测文件被沙箱拒绝：runner 子进程显式 `SUPABASE_TELEMETRY_DISABLED=1`。
- 账户到期夹具只改 `due_at` 违反 `due_at=requested_at+7 days`：改为同一数据库权威时钟同时派生 `requested_at/due_at`。
- 初次 default integration 的应用 21/67 通过、数据库因旧红灯 E2E 残留计数失败：标准 `db:reset` 后重跑通过；随后修正 case 清理。
- 直接删除 Brief 用户 Auth Identity 被 Energy ledger `RESTRICT` 阻止：清理不再猜测 FK 顺序，改为复用 Phase 3 账户删除 application/adapter。
- 限流 bucket 不随 Auth 级联：按本 case `user_id` SHA-256 指纹精确清理，不清空全表。

最终红绿证明：洁净数据库 → 核心 E2E 16/16 → 不 reset → `pnpm db:test` 44 files / 1001 tests 全绿。

## 5. 最终实现与文件清单

### 产品最小修复

- `src/features/project-galaxy/ProjectLifecycleActions.tsx`：First Sync、Manual Resync、Validated Brief 入口；Brief range 在页面生命周期内稳定，以验证 cache 等价。
- `src/features/project-galaxy/index.ts`
- `src/app/project-galaxy/page.tsx`
- `src/app/api/projects/[projectId]/briefs/generate/project-brief-generation-route-dependencies.ts`：仅非生产显式 E2E 的 localhost provider 注入。

### 测试边界与 E2E

- `src/app/api/testing/phase5/session/route.ts`
- `src/app/api/testing/phase5/account-deletion/execute/route.ts`
- `playwright.core-journeys.config.ts`
- `scripts/run-core-journey-e2e.mjs`
- `tests/e2e-core-journeys/core-journeys.spec.ts`
- `tests/e2e-core-journeys/phase5-fixture.ts`
- `package.json`：新增 `test:e2e:core-journeys`，未升级依赖。

### 文档

- `docs/runbooks/阶段6/阶段6_Phase5_核心E2E覆盖矩阵.md`
- `docs/runbooks/阶段6/阶段6_Phase5_核心E2E补齐_执行报告.md`

未新增或修改 migration；构建自动改写的 `next-env.d.ts` 已恢复为基线 blob，不进入提交。

## 6. 15 类旅程最终证据

| 旅程 | case | 最终证据 |
|---|---:|---|
| Demo | 01 | Preview 可见；非 localhost 请求 0 |
| Onboarding | 02 | 无控制令牌 404；真实 SSR session/RLS 后 owned Installation/Repository 可见 |
| First Sync | 03 | UI → 202 → `first_sync_accepted` + durable run receipt |
| Webhook/replay | 04 | raw-body HMAC 首次 202、同 delivery 重放 200 duplicate |
| Manual Resync | 05 | UI → 202 → `manual_resync_accepted` |
| Status Confirmation | 06 | 保存 `polishing`，reload 后仍为 `polishing` |
| Suggestion / Issue Draft | 07 | accepted、本地 draft、GitHub 外部写入 0 |
| Decision Record | 08 | 用户确认本地 preview；明确未持久化、外部写入 0 |
| Brief / Quota / Cache | 09 | `generated/3` → `cache_hit/0`；两请求 provider 增量 1 |
| Provider Failure Refund | 10 | 502 稳定失败后同页重试 `generated/3`，证明 refund 可用 |
| Installation Revocation | 11 | signed delete → revoked/stale UI；新 Sync 409 |
| Repository Removal | 12A | 强确认 REMOVE → removed + `SOURCE_REMOVED` |
| Project Subtree Delete | 12B | 强确认 DELETE → project deleted |
| Account Delete Request | 13 | 七天窗口与冻结提示 |
| Account Delete Cancel | 14 | pending → active 可见 |
| Account Delete Complete | 15 | 无令牌 404；`deletion_failed` → 同 operation retry → `deleted`，Auth 会话消失 |

## 7. 指标与副作用

- 新核心 case：16/16 通过，skip 0。
- Webhook replay：1；重复 dispatch：0。
- Brief cache：请求 2；provider 调用 1；首次扣减 3；cache 扣减 0。
- Provider failure：1；退款后成功重试 1；重复/非授权 Energy 消耗 0。
- Installation revoked 后新 Sync：尝试 1，阻止 1。
- Account Auth partial failure：1；同 operation 成功重试 1；最终 deleted 1。
- 真实 GitHub/AI/Inngest/Production 调用：0。
- 预期 console error：4（404×2、409×1、502×1）；预期 request-failed：2；非预期 console/page/request error：0。
- case 后不 reset 数据库回归：44/44 files、1001/1001 tests；全局计数污染 0。
- 失败 trace：红灯运行按 Playwright 规则生成；最终绿色运行失败截图/trace：N/A。

## 8. 质量门与命令证据

| 命令 | 退出码 | 结果/分母 |
|---|---:|---|
| `pnpm env:check` | 0 | 1 file / 1 test |
| `pnpm typecheck` | 0 | TypeScript 0 error |
| `pnpm lint` | 0 | ESLint 0 warning/error |
| `pnpm security:test` | 0 | 12 files / 55 tests |
| `pnpm test` | 0 | 184 files / 1716 tests |
| `SUPABASE_TELEMETRY_DISABLED=1 pnpm test:integration` | 0 | 最终 21/67 application + 44/1001 database；首次污染失败已记录 |
| `pnpm test:e2e:core-journeys`（桌面 runtime 等价直接 runner） | 0 | 16/16，skip 0 |
| `pnpm test:e2e:auth-fixture` | 0 | 1/1，skip 0 |
| `pnpm test:e2e:connected-panels` | 0 | 8/8，skip 0 |
| `pnpm test:e2e` | 0 | 14/14，skip 0 |
| `pnpm db:reset` | 0 | 全部 forward-only migration + seed |
| `pnpm db:test` | 0 | 44 files / 1001 tests；最终一次在核心 E2E 后未 reset |
| `pnpm db:lint` | 0 | findings 0 |
| `pnpm db:types:check` | 0 | generated types up to date |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm security:secret-scan` | 0 | 最终暂存后结果见第 10 节 |
| `pnpm audit --prod --audit-level high --json` | 0 | high 0、critical 0；production 244、optional 77、total 321 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | Next.js 16.3.0 production build |
| `pnpm test:security:csp-runtime` | 0 | 4 routes；40/40 script nonce 匹配；error 0 |

系统边界：本地 Docker/Supabase、Chromium、registry audit 按 B 类发起精确审批并获准。未运行项：无。非预期 skip/xfail：0。

## 9. 安全与合成边界

- 测试 route 在 production、未启用 Phase 5、非同源或控制令牌不匹配时统一 404。
- 控制令牌每次 runner 随机生成，仅存在于服务/Playwright 进程环境，不进入客户端 bundle、日志或报告。
- 合成 provider 只返回 schema-valid Brief 或低基数 503；不保存或回显 prompt、token、cookie。
- 所有 GitHub payload、Auth identity、Repository 与 Project 均为本地合成稳定 ID。
- Secret scan 与日志中没有真实 token、Service Role key、cookie 或 provider payload。
- RLS、Rate Limit、CSP、Webhook HMAC、Quota/Refund、Revocation、Repository/Account deletion 均未绕过。

## 10. Scope、Secret Scan 与 Git

- 允许文件之外业务差异：0。
- migration/依赖版本/lockfile 变化：0。
- `.pnpm-store/` staged/committed：0。
- 最终 Secret scan：`trackedFiles=710`、`scannedFiles=709`、`findingCount=0`、`allowlistedCount=3`，退出码 0。
- 提交前要求：`git diff --cached --check` 退出 0；staged 仅第 5 节文件。
- 计划提交消息：`test: complete beta e2e coverage`。
- final commit：本报告所在的单一本地提交；commit hash 由包含本报告的 Git 对象生成，实际 hash 在提交后最终任务回执中绑定（报告无法自引用其自身 commit hash）。
- final HEAD/status：提交后回读并在最终任务回执给出；除阶段前 `.pnpm-store/` 外应无 tracked/staged/non-store untracked。

## 11. 禁止动作声明

- 未 push、merge、PR、部署、发布、tag。
- 未访问真实 GitHub/Vercel/Supabase Cloud、Production、真实账号、真实 Secret 或真实业务数据。
- 未修改既有 migration，未升级依赖，未改写 Git 历史。
- 未进入 Phase 6；阶段 6 后续动作未从总纲删除。

## 12. 结论

Phase 5 完成：15 类核心旅程已由 16 个独立浏览器 case 覆盖；真实本地 UI/HTTP、Supabase/Auth、合成外部边界、失败/重试/幂等/授权/恢复与清理均有可重复证据。等待独立审核，未进入 Phase 6。

<!-- EXECUTION_REPORT_COMPLETE -->
