# 探索者号｜阶段 6｜Phase 4.4 CSP nonce 生产运行时最小修复｜执行报告

## 1. 编排标识、授权与结论

- 批次 ID：`explorer-stage6-phase4.4-5ce0c0646694a2da`
- 提示词实例 ID：`explorer-stage6-phase4.4-d77b2ada26801b3d`
- 审核票据 ID：`review-ticket-d77b2ada26801b3d`
- 授权：`workflow-authorization.v1`
- 仓库：`D:\AI workplace\探索者号`
- baseline：`016cfdcba7fd3499eac485943353df0ff7f1252b`
- 结论：**Phase 4.4 完成，可重新审核 Phase 4；等待独立审核，未进入 Phase 5。**

本批只修复 Next.js request/response CSP nonce 与动态渲染兼容性，未修改数据库、Rate Limit、Webhook、Prompt、日志、GitHub permission、依赖或 lockfile。未 push、PR、部署、发布或操作 Production/真实账号/Secret/数据。

## 2. Pre-Run Freeze

| 项目 | 冻结值 |
|---|---|
| HEAD / branch | `016cfdcba7fd3499eac485943353df0ff7f1252b` / `feature/stage4-bridge-five-panels` |
| origin | `ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git` |
| Git common dir | `D:\AI workplace\探索者号\.git` |
| staged | 0 |
| tracked 实际内容差异 | 0；`next-env.d.ts` 首次 stat 显示 modified，但 worktree/index/HEAD blob 均为 `9edff1c7...` |
| non-`.pnpm-store` untracked | 0 |
| `.pnpm-store/` | 阶段前未跟踪目录，只观察顶层状态，不读取、修改、暂存或提交内容 |
| Phase 4.3 report SHA-256 | `ee9f5dd20e3221ee93f5174291ef3e4151341524239d7682b25147814cac68f5` |
| `src/proxy.ts` | `61fa4f579a351023c95c8bf94dffba5fd612f78eaddbca0b8f75151f0a9dcd5a` |
| CSP helper | `d4eaf35bc97caf6fbc6c0c74011103e47c6e435f92f7086aec92dba718eb88ec` |
| root layout | `af48520cfe2712e50cecc13d235842efc4a8ffb6002a7e3c0df9d07e368c2b5a` |
| `/` / `/auth/error` | `de8050...b432` / `bf264e...e37` |
| package / lock | `b5243f...936e` / `486860816c0dd48be09d62711cb35350703601c7c4c4a64b72fa89fe6ed5ea05` |

允许文件冻结：`src/proxy.ts`、`src/proxy.test.ts`、`src/app/layout.tsx`、`src/shared/security/http-security-headers.ts` 及其测试、`scripts/test-production-csp-nonce.mjs`、`package.json`、`docs/security/beta-threat-model.md` 与本报告。`pnpm-lock.yaml` 必须且实际保持不变。

## 3. 根因与红灯生产证据

### 3.1 数据流根因

Phase 4.3 的 proxy 生成随机 nonce，把 `x-nonce` 传给 request，却只在 `refreshSupabaseSession` 返回后构建 response CSP。Next.js renderer 只能从 request `Content-Security-Policy` 提取 nonce，因此 response header 虽严格且含 nonce，静态预渲染 HTML 的 framework/page scripts 没有 nonce。动态页因既有请求 API 路径产生了 nonce，形成误导性的局部绿色。

冻结 lineage：

`request → proxy nonce → request x-nonce only → static renderer sees no request CSP → HTML scripts without nonce`

`same nonce → response CSP → browser strict-dynamic → scripts blocked`

### 3.2 Baseline build 与真实 HTTP 红灯

`NEXT_TELEMETRY_DISABLED=1 pnpm build` 退出 0，但 route 分类为：`○ /`、`○ /_not-found`、`○ /auth/error`，`ƒ /mission-control`。随后使用本地 `next start` 和四个独立合成请求：

| case | route/status | CSP | script 总数 | 匹配 nonce | 缺失 nonce | 红灯 |
|---|---|---|---:|---:|---:|---|
| `CSP-STATIC-ROOT-01` | `/` / 200 | nonce + strict-dynamic | 11 | 0 | 11 | 是 |
| `CSP-AUTH-ERROR-01` | `/auth/error` / 200 | nonce + strict-dynamic | 10 | 0 | 10 | 是 |
| `CSP-NOT-FOUND-01` | missing route / 404 | nonce + strict-dynamic | 9 | 0 | 9 | 是 |
| `CSP-DYNAMIC-CONTROL-01` | `/mission-control` / 200 | nonce + strict-dynamic | 10 | 10 | 0 | 对照绿 |

随机 nonce 只用于内存比较，报告不保存完整值。

## 4. TDD 红→绿与实现

### 4.1 Case Registry

| case | 会捕获的生产破坏 | 红灯 | 最小实现 | 绿灯 |
|---|---|---|---|---|
| `CSP-REQUEST-HEADER-01` | request CSP 缺失或与 response 不同 | proxy test：expected CSP，received empty，退出 1 | CSP 只构建一次，同时写 request/response；保留 `x-nonce` | 1/1，后续 2 files/3 tests |
| `CSP-STATIC-ROOT-01` | `/` scripts 无 nonce | runtime：`0 !== 11`，退出 1 | root layout `await connection()` | 11/11 |
| `CSP-AUTH-ERROR-01` | auth error scripts 无 nonce | 10/10 缺失 | 同一动态根布局 | 10/10 |
| `CSP-NOT-FOUND-01` | 404 scripts 无 nonce | 9/9 缺失 | 同一动态根布局 | 9/9 |
| `CSP-DYNAMIC-CONTROL-01` | 既有动态页 nonce 回退 | baseline 10/10 对照 | 保持同一 request/response CSP | 10/10 |
| `CSP-PRODUCTION-DIRECTIVES-01` | 以弱 directive 绕过 | production helper/runtime assertions | 保留 strict-dynamic/object/frame；禁 production unsafe-* 和 wildcard | 全绿 |
| `CSP-DEVELOPMENT-CONSOLE-01` | React dev eval 产生浏览器 CSP violation | 首次 Auth E2E 1/1 但 console 有 violation；unit 1/2 红 | 仅 `NODE_ENV=development` 加官方要求的 `unsafe-eval` | unit 2/2；Auth E2E 1/1 且 violation 0 |

### 4.2 最小修改

1. `src/proxy.ts`：生成一次 nonce、一次规范化 CSP；先把 CSP 与 `x-nonce` 写入 forwarded request，再把完全相同的 CSP 写入 response。
2. `src/app/layout.tsx`：调用 Next.js `connection()`，使全部 HTML route 等待真实请求并动态渲染。
3. CSP helper：只在 development 加 `unsafe-eval` 以满足 React 调试；production 仍明确禁止 `unsafe-inline` script、`unsafe-eval`、wildcard，保留 `strict-dynamic`、`object-src 'none'`、`frame-ancestors 'none'`。
4. production runtime script：动态分配 localhost 空闲端口、等待条件而非 sleep 猜测、启动真实 `next start`、对账 HTML，并在 Windows 精确终止测试进程树。

## 5. Production 绿灯与动态渲染影响

最终 production build 中所有 App route 均为 `ƒ`；`/`、`/_not-found`、`/auth/error` 不再是静态 `○`。最终真实 HTTP 对账：

| case | status | scripts | 匹配 | 缺失 | 错配 | error |
|---|---:|---:|---:|---:|---:|---:|
| root | 200 | 11 | 11 | 0 | 0 | 0 |
| auth error | 200 | 10 | 10 | 0 | 0 | 0 |
| 404 | 404 | 9 | 9 | 0 | 0 | 0 |
| dynamic control | 200 | 10 | 10 | 0 | 0 | 0 |

四个请求 CSP 均仅含一个 nonce，各请求 nonce 互不相同；每个 script nonce 与其响应 CSP 完全相等。production script-src 没有 `unsafe-inline`、`unsafe-eval`、wildcard，且保留 `strict-dynamic`、object/frame 限制。

缓存/性能影响：请求级 nonce 禁用这些 HTML 页面的静态优化、ISR/PPR 与默认 CDN HTML cache；每次请求执行 server render，可能增加 TTFB、server 负载与托管成本。这是严格 nonce 的已接受代价，已写入 `docs/security/beta-threat-model.md`。未来如采用 SRI/hash 必须另立安全合同，不能在本批削弱 CSP。

## 6. 失败与安全替代

| 失败 | 退出码 | 根因 | 安全替代/结果 |
|---|---:|---|---|
| 首次 runtime 自动化 | 1 | 正确暴露 root `0 !== 11` | 作为 TDD 红灯保留 |
| 实现后首次 runtime | 1 | Windows 上红灯 server 未终止，3104 被旧 build 占用；新 child `EADDRINUSE` 后请求误中旧 server | 动态空闲端口 + child 存活校验 + Windows 精确进程树清理；新 build 4/4 全绿 |
| 首次 lint | 1 | 测试脚本 `_nonce` 脱敏解构触发 unused warning | 改为显式安全字段投影；nonce 仍不输出；lint 退出 0 |
| 首次 Auth E2E | 0（功能绿） | development CSP 缺少 React 调试所需 `unsafe-eval`，console 有 CSP violation | development-only 分支；production 不变；复跑 E2E violation 0 |
| development CSP unit 红灯 | 1 | helper 未区分 development | 新增明确环境合同；2/2 绿 |
| 首次组合式版本回读 | 1 | PowerShell 引号解析错误，未输出数据 | 改用简单只读命令；Node/pnpm/Next 与时间回读成功 |

没有通过延长 sleep、忽略浏览器 console、加入 production unsafe directive、删 case 或放宽断言取得绿色。

## 7. 修改文件

最终必要文件预计 9 个：

- `src/proxy.ts`
- `src/proxy.test.ts`
- `src/app/layout.tsx`
- `src/shared/security/http-security-headers.ts`
- `src/shared/security/http-security-headers.test.ts`
- `scripts/test-production-csp-nonce.mjs`
- `package.json`（只增加 `test:security:csp-runtime`）
- `docs/security/beta-threat-model.md`
- `docs/runbooks/阶段6/阶段6_Phase4.4_CSP_nonce_生产运行时修复_执行报告.md`

`next build` 自动加入的 `next-env.d.ts` root-params 行已用明确补丁恢复，最终不纳入 diff。`pnpm-lock.yaml` SHA-256 始终为 `486860816c0dd48be09d62711cb35350703601c7c4c4a64b72fa89fe6ed5ea05`，未修改依赖或 lockfile。

## 8. 验证命令

| 命令 | 退出码 | 分母/结果 |
|---|---:|---|
| `pnpm env:check` | 0 | 1 file / 1 test |
| `pnpm typecheck` | 0 | TypeScript noEmit |
| `pnpm lint` 首次/复跑 | 1 / 0 | 1 warning → 0 warning |
| `pnpm security:test` | 0 | 12 files / 55 tests |
| proxy/CSP 聚焦 | 0 | 2 files / 3 tests；另保留各自红灯 |
| `pnpm test` | 0 | 最终复跑 184 files / 1716 tests |
| `SUPABASE_TELEMETRY_DISABLED=1 pnpm test:integration` | 1 / 0 | 首次审批 shell 的 `PATH` 缺少 `node`，测试未启动；随后用同一默认脚本及 bundled Node/pnpm 绝对路径复跑，app 21/67 + DB 44/1001 全部通过 |
| `pnpm test:e2e:auth-fixture` | 0 | 1/1；最终浏览器 CSP violation 0 |
| `pnpm test:e2e:connected-panels` | 0 | 8/8；CSP violation 0 |
| `pnpm test:e2e` | 0 | 14/14；CSP violation 0 |
| `pnpm db:types:check` | 0 | generated types current |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm security:secret-scan` | 1 / 0 | 首次 shell `PATH` 缺少 `node`，扫描未启动；bundled Node/pnpm 绝对路径复跑：701 tracked / 700 scanned / 3 allowlisted / 0 finding |
| `pnpm audit --prod --audit-level high --json` | 0 | production 244 + optional 77；all severity 0 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | Next 16.3.0；全部 route `ƒ` |
| `pnpm test:security:csp-runtime` | 0 | 4 route cases，40/40 scripts nonce 匹配，error 0 |

无 skip/xfail。最终工具回读时间 `2026-08-26T15:51:25.3659013+08:00`；Node `v24.19.0`、pnpm `11.19.0`、Next `16.3.0`。未使用真实会话或外部平台。

## 9. Git 与禁止动作

- 只暂存第 7 节 9 个文件；`.pnpm-store/` staged/committed 必须为 0。
- 新 commit message：`fix: align CSP nonces with dynamic rendering`；不 amend `016cfdc...`。
- 本报告在 commit 前封装，因此不能自指写入包含自身字节的最终 commit hash；可用 `git log -1 --format=%H -- <本报告>` 无歧义回读，精确 hash 同步写入任务终态。
- 提交前必须满足 `git diff --cached --check` 退出 0、unstaged tracked 0、non-`.pnpm-store` untracked 0；提交后再只读确认 staged/tracked/non-store 均为 0。
- 未 reset、clean、checkout、改写历史；未 push/merge/PR/deploy/release/tag；未操作 Production；未进入 Phase 5。

## 10. 最终判定

`http-security-headers.v1`、`nextjs-request-response-csp-nonce.v1`、`nonce-dynamic-rendering.v1` 与 `phase4-security-preservation.v1` 已由 unit、production build、真实 `next start` HTTP/HTML、E2E 和全量回归共同验证。Phase 4.3 其他安全控制与数据库合同没有回退。

**Phase 4.4 完成，可重新提交 Phase 4 独立审核；等待独立审核，未进入 Phase 5。**

<!-- EXECUTION_REPORT_COMPLETE -->
