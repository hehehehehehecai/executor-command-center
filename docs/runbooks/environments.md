# Local / Staging / Production Runbook

## 1. 环境隔离原则

Local、Staging、Production 必须使用不同的 Supabase project、GitHub App、Inngest environment、AI Provider key、Vercel project/domain 和 Secret。不得复制真实 Production 数据到 Local，不得把 Staging/Production secret 写进 Git、报告或命令历史。

| 环境 | 当前证据状态 | 允许的数据 | 目的 |
| --- | --- | --- | --- |
| Local | 可由本仓库和 Docker 重建 | seed 与合成 fixture | 开发、测试、恢复验证 |
| Staging | Phase 8 已完成独立资源与验收；本次 Beta 发布不访问或修改 | 专用合成账号与仓库 | migration、E2E、Smoke、回滚验证 |
| Production | `v0.1.0-beta.1` 发布范围；精确 RC runtime 已通过，main/tag/Release 按发布门禁闭环 | 用户主动授权数据 | 公开 Beta |

## 2. Local

### 2.1 前置与工具版本

```powershell
git --version
node --version
pnpm --version
docker --version
docker info
pnpm exec supabase --version
```

要求 CI 权威 Node.js `22.22.3`、`pnpm@11.5.0`、Docker daemon 可用，并使用 `package.json` 固定的 Supabase CLI。Phase 7 另在本机 Node `24.19.0` 完成兼容回归，但发布仍以 CI 固定版本为准。所有命令在仓库根目录执行。

### 2.2 全新安装与环境

```powershell
git -c core.autocrlf=false clone https://github.com/hehehehehehecai/executor-command-center.git
Set-Location executor-command-center
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm env:check
```

Windows 的 LF 保真是硬前置：历史治理 fixture 以原始字节 SHA-256 验证，`core.autocrlf=true` 的 checkout 会把 LF 改为 CRLF 并产生确定性红灯。不要修改 fixture、hash 或测试；删除该次专用临时 clone 后按上述命令重建。

`.env.example` 只列变量名。Preview 可在变量为空时运行；Connected 必须提供成组、合法的配置。Local Supabase 的 URL/anon/service role 值只从本机 `pnpm exec supabase status` 读取并写入未跟踪的 `.env.local`，不得打印到报告。

变量分类：

- Browser：`APP_ORIGIN`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- Server-only Supabase：`SUPABASE_SERVICE_ROLE_KEY`。
- GitHub App：`GITHUB_APP_ID`、`GITHUB_APP_SLUG`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_REST_API_VERSION`、`GITHUB_WEBHOOK_SECRET`。
- Worker：`INNGEST_EVENT_KEY`、`INNGEST_SIGNING_KEY`。
- AI：`DEEPSEEK_API_KEY`。

除 `NEXT_PUBLIC_*` 外，所有 secret 禁止出现在客户端环境；`APP_ORIGIN` 仍由 server 端同源检查使用。

### 2.3 数据库、开发与验证

```powershell
pnpm run db:start
pnpm run db:reset
pnpm run db:test
pnpm run db:types:check
pnpm run db:lint
pnpm run db:drift:check
pnpm dev
```

完整质量门：

```powershell
pnpm typecheck
pnpm lint
pnpm security:test
pnpm test
$env:SUPABASE_TELEMETRY_DISABLED='1'; pnpm test:integration
pnpm security:secret-scan
pnpm audit --prod --audit-level high --json
$env:NEXT_TELEMETRY_DISABLED='1'; pnpm build
pnpm test:security:csp-runtime
```

更详细的数据库命令和禁止的远程命令见 [Local Database Runbook](local-database.md)。

### 2.4 清理

```powershell
pnpm run db:stop
```

`pnpm exec supabase stop --no-backup` 会删除本项目 Local volume，只能在确认数据为可重建合成数据时执行；不得使用 `--all --no-backup`。

## 3. Staging（Phase 8 已执行）

以下清单保留为环境重建和后续发布复验要求；历史完成状态以 Phase 8 执行报告为准：

1. 创建专用 Supabase/Vercel/Inngest/AI 环境和专用 GitHub App；记录 owner、region、project/ref 的安全 fingerprint，不记录 secret。
2. 配置独立域名和 callback：Supabase Auth callback、GitHub App setup/callback、Webhook URL、Inngest serve endpoint；逐项验证 HTTPS 与精确 origin。
3. 回读 GitHub App 只有 `metadata/contents/issues/pull_requests/actions/checks: read`，events 只有 `installation/issues/pull_request/push/release/repository/workflow_run`。
4. 在 Vercel server-only scope 配置 `.env.example` 中的变量；检查没有 `NEXT_PUBLIC_` Service Role/provider/GitHub/Inngest secret。
5. 在任何远程 migration 前保存备份与 migration history；CI 先运行本页质量门。`supabase db push --dry-run` 与实际 `db push` 只能在明确 link 到 Staging 后执行并保留输出摘要。
6. 用专用合成账号、仓库和 GitHub App Installation 执行 Onboarding、First Sync、Webhook replay、Manual Resync、Brief/refund、revocation/removal/account deletion 的 Staging Smoke。
7. 回读 CSP/security headers、cookie、匿名 OAuth WAF/rate limit、日志脱敏、worker retry/alert 与外部调用计数。
8. 验证回滚路径；失败时停止推广，不得把 Staging 数据/secret 复制到 Production。

Staging 现有 Onboarding 证据模板见 [Staging Connected Onboarding Smoke Test](staging-onboarding-smoke-test.md)。

## 4. Production（Phase 9 发布门禁）

### 4.1 发布前门禁

- Phase 8 PR/CI/Staging 全绿并经独立审核；目标 commit、migration manifest、lockfile 与构建产物 fingerprint 固定。
- 备份/PITR 能力、恢复点、维护窗口、rollback owner、监控与告警全部人工确认。
- Production GitHub App/Supabase/Inngest/AI/Vercel 资源与 Staging 完全隔离；所有 secret 通过平台 secret store 注入。
- 运行 dependency audit、Secret scan、数据库 RLS/RPC inventory 和安全 header/CSP runtime；high/critical 为 0。

### 4.2 Migration 与部署顺序

1. 宣布变更窗口，停止会写入受影响 schema 的后台任务，记录当前健康与 queue 深度。
2. 保存备份和 migration history；执行 migration dry-run/差异审核。
3. 由双人确认目标 project/ref 后应用 forward-only migration；禁止 Production `db reset`、`--include-seed` 或破坏性 repair。
4. 验证 migration history、RLS、grant、受限 RPC、关键计数和应用兼容性。
5. 部署绑定的不可变 commit/build；验证环境变量存在性而不回显值。
6. 执行最小 Production Smoke：登录、授权读取、一个合成/受控项目读取、同步/Brief 安全边界、Webhook HMAC、CSP/cookie 和错误映射。
7. 观察日志、延迟、错误率、queue/retry、Energy/refund 和 database health；满足观察窗口后才 tag/release。

`v0.1.0-beta.1` 的精确 RC runtime、OAuth、Installation 和核心只读面板已通过 Phase 9.1 验证。Git-integrated `main` deployment、tag、GitHub Release、回滚切换与恢复必须在 Phase 9.2 以平台回读为准，不得用先前 CLI deployment 代替。

### 4.3 回滚

应用部署优先回滚到已验证的前一构建。数据库 migration 是 forward-only：若 schema 变更不向后兼容，应用回滚前必须使用预先设计的兼容 migration；不得修改旧 migration 或直接手工恢复部分表。数据灾难按 [Database Restore Runbook](database-restore.md) 执行。

## 5. 证据保留

每个环境保留 commit、lockfile、migration manifest、工具版本、命令退出码、测试分母、安全 fingerprint、Smoke 结果、审批人与 UTC 时间。禁止保留 secret 原文、cookie、Authorization、Provider body、私有仓库正文或真实用户数据快照。
