# 阶段 6｜Phase 8.15.1 登录态首页展示与撤权生产入口失败关闭最小修复｜执行报告

## 编排与授权

批次 ID：explorer-stage6-phase8.15.1-ee3778efa0eec548

提示词实例 ID：explorer-stage6-phase8.15.1-e73e23f5d0c02027

来源审核票据：review-ticket-d68c5facfa40108d5e5a4904

授权策略：workflow-authorization.v1

适用仓库：D:\AI workplace\探索者号

执行范围仅为根页登录态展示与五类已撤销 Installation 生产入口的本地 fail-closed 证据；未重放 Phase 8.13 三组 Staging harness，未触发 GitHub、Vercel、Supabase Cloud、Inngest、Production 或浏览器写操作。

## 冻结与根因

- 基线 HEAD/tree：`5dcbee2af9b3489323949db31d145d04230f2c7a` / `eba337f966a002d118cf8283dcb33284baa6c90f`。
- 分支：`feature/stage4-bridge-five-panels`；repo-local 作者和提交者均为 `hehehehehehecai <250114232+hehehehehehecai@users.noreply.github.com>`。
- 开始时 tracked/staged 均为空；所有 Git 状态检查使用 `--untracked-files=no`，未读取、枚举或触碰 `.pnpm-store/`。
- 上游 Phase 8.15 报告 SHA-256：`30AF5FC7183E758C73BED1855725C8AD2A0C1B937156F8D5224F4A1C8AAD001B`。

根因已由代码审计确认：`src/app/page.tsx` 原先无条件渲染静态 `CommandDeckPage` Preview Shell；该组件无会话输入，所以认证用户仍看到“使用 GitHub 登录”。`/onboarding` 则声明 `force-dynamic`，通过 `cookies()`、`createSupabaseServerClient()` 与 `auth.getUser()`读取 SSR 会话。Proxy 已把更新后的 Supabase session cookie 传给动态请求；问题是根页未消费该会话，而不是 cookie 刷新失败。

## 红灯、最小实现与文件范围

红灯通过一次受控的临时基线还原复现：新增根页和 Command Deck 认证断言均失败（`2 failed / 16 passed`），表现为认证输入仍没有“GitHub 身份已登录”，且“使用 GitHub 登录”仍存在。随后立即恢复实现；未发生外部副作用。

最小实现：

- `src/app/page.tsx`：根路由改为 `force-dynamic`，仅读取服务器端已验证会话的布尔值；异常按匿名安全降级，不暴露 cookie 或用户标识。
- `src/features/command-deck/command-deck-page.tsx`：认证态显示“GitHub 身份已登录”和 `/onboarding` 的 GitHub App 状态入口；匿名态保留原有登录入口。认证状态与 installation 的 active/revoked 状态保持正交，撤权用户不会被表现成登出。
- 两个根页/组件测试：覆盖匿名与认证状态。
- 三个生产 HTTP route 测试：First Sync、Manual Resync、Brief 在撤权结果下分别返回安全错误且不返回 run/job/brief/invocation 成功回执。
- `src/application/webhooks/ingest-github-webhook.test.ts`：覆盖完成态 `installation.deleted` 重投递为 duplicate/no-op，既不再次完成撤权也不 dispatch。

本批没有修改 migration、RLS、RPC、依赖、锁文件、环境配置或业务数据。构建自动改写的 `next-env.d.ts` 已仅恢复其无关生成差异。

## 六项冻结分母

| 分母 | 本地生产组合证据 | 结果 |
| --- | --- | --- |
| 1. 已登录根页身份 | SSR 会话为真时不显示登录主操作，显示状态入口；匿名仍保留登录入口 | PASS |
| 2. First Sync | `StartAuthenticatedFirstRepositorySync` 在 revoked 前置状态下不调用 start；HTTP 返回 `409 first_sync_authorization_revoked` 且 run/job 为 null | PASS |
| 3. Manual Resync | reconciliation coordinator 的 revoked receipt 不 dispatch；HTTP 返回 `409 manual_resync_authorization_revoked` 且 syncRunId 为 null | PASS |
| 4. Brief/AI | 授权 gate 非 active 时拒绝；HTTP 仅返回 `403 project_brief_authorization_failed`，不含内部细节、Brief 或 invocation | PASS |
| 5. Production reconciliation | `RunDailyRepositoryReconciliation` 对 revoked Installation 在 remote reader、store request、dispatcher 之前结束，决策为 `authorization_revoked` | PASS |
| 6. trusted `installation.deleted` 重投递 | 合法已完成 delivery 返回 `200 github_webhook_duplicate`；`completeInstallation=0`、`dispatch=0` | PASS |

以上为本地应用/route/test 证据，不能替代新的真实 Staging 验证。因为本批 C 类未授权 Staging 部署，且下列本地质量 blocker 未清除，未发起 Staging 请求、未签发 ticket、未写入任何 Staging 数据。

## 质量门与命令证据

| 门禁 | 结果 | 分母 / 说明 |
| --- | --- | --- |
| 聚焦根页与撤权集 | 退出 0 | `9 files / 124 tests` |
| `pnpm env:check` | 退出 0 | `1/1` |
| `pnpm typecheck` | 退出 0 | TypeScript 无输出错误 |
| `pnpm lint` | 退出 0 | 零 warning |
| `pnpm security:test` | 退出 0 | `12 files / 59 tests` |
| `pnpm test` | 退出 0 | `193 files / 1804 tests` |
| `pnpm security:secret-scan` | 退出 0 | scanned `747` tracked files，finding `0`，allowlist `3` |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 退出 0 | 根路由为动态请求渲染 |
| `pnpm test:security:csp-runtime` | 退出 0 | 四路由共 `40/40` script nonce 匹配，错误 `0` |
| `pnpm test:e2e:preview` | 退出 1 | `PREVIEW_BASE_URL is required`；未自行伪造 URL 或启动外部环境 |
| `SUPABASE_TELEMETRY_DISABLED=1 pnpm test:integration` | 退出 1 | 本地 Docker Linux Engine named pipe 不存在；应用集 `45 passed / 21 skipped / 8 failed suites`，pgTAP 未启动 |
| `pnpm db:types:check` | 退出 1 | Supabase telemetry 临时文件写权限被拒，且 Docker API 不可用 |
| `pnpm db:drift:check` | 退出 1 | 同一 telemetry/Docker 本地环境阻塞 |
| `pnpm audit --prod --audit-level high --json` | 退出 1 | `high=2`、`critical=0`，均为 production 传递 `browserslist@4.28.6`；总依赖 `321` |

首次 Supabase 状态读取在普通受限环境中失败；按 B 类仅做一次更小权限替代后，项目 CLI 明确返回 `dockerDesktopLinuxEngine` named pipe 不存在。未再重试、未重置 Docker、未删除卷或数据。依赖审计首次为网络 `fetch failed`，经一次受控只读网络重试得到上述可核验的 2 个 high advisory。

## 安全、外部边界与终态

- 所有新增/复用撤权测试使用合成 UUID、delivery 与错误码；没有读取或输出 cookie、token、OAuth state、Webhook 签名、Provider payload、Secret 或真实用户内容。
- 真正 Staging 验证、push、PR、CI、部署、stable alias、重授权、repository removal、account deletion、Production、Phase 9 动作均为 `0`。
- `git diff --check` 通过；当前修改仅限本报告、根页/Command Deck 与对应最小测试。`.pnpm-store/` staged/committed 为 `0`。
- 未创建本地 commit：生产依赖 audit 的 2 个 high 与本地 Docker/Supabase 质量门失败均未解释，按 fail-closed 不将未通过修改作为可部署 RC 提交。
- C 类 Staging 部署票据未签发：先决本地质量门未通过，不能以部署替代或掩盖本地安全/数据库 blocker。

## 结论

根页登录态根因和最小修复、六项撤权 fail-closed 本地证据已闭合；但 Phase 8.15.1 **不是 A 级可审完成**。必须先恢复可访问的本地 Docker/Supabase 环境并重新通过 integration、types、drift，且处理或获独立裁决 production audit 的 2 个 high advisory；之后才可申请一次精确的 C 类 Staging 部署/验证授权。Phase 8 仍未完成，未进入 Phase 9 或 Production。

<!-- EXECUTION_REPORT_COMPLETE -->
