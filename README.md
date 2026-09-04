# EXECUTOR — Command Your Projects

**中文语境名称：执行者号**

EXECUTOR 是面向个人开发者和 AI 创作者的 GitHub 项目指挥中心。它把用户主动授权的仓库转化为可追溯的项目状态、近期进展、候选行动、决策记录和有 Evidence 边界的 AI 项目简报。

当前仓库的首个公开 Beta 版本为 **`v0.1.0-beta.1`**。Preview 使用合成数据；Connected 模式只读取用户明确授权的 GitHub 仓库。Production 运行时、OAuth、GitHub App 单仓库安装、数据库 migration 与核心只读面板已经过发布 smoke；具体 deployment、回滚与证据边界见阶段 6 发布执行报告和 [Beta 发布回滚与监控 Runbook](docs/runbooks/阶段6/阶段6_Beta发布回滚与监控_Runbook.md)。

## 已实现能力

- Preview 与 Connected 两种体验，以及 Onboarding、Project Galaxy、Flight Log、Mission Control、Decision Archive、Copilot 五个工作区。
- GitHub App 安装与仓库选择；只读仓库元数据、commit、issue、pull request、release、workflow/check 信息。
- First Sync、Webhook 增量同步、每日对账和 Manual Resync，具有幂等、重试、撤权与晚到写入保护。
- 用户确认的项目状态、Action Suggestion / Issue Draft、Decision Record 与 Evidence Link。
- 结构化项目简报、follow-up、缓存等价、Energy/Quota 预留与失败退款。
- 两种仓库数据处置：保留个人记录并移除来源数据，或删除整个项目子树。
- Installation 撤销，以及七天可撤销的账户删除生命周期。
- RLS/受限 RPC、Webhook raw-body HMAC、数据库原子限流、日志脱敏、严格 CSP nonce、Secret scan、依赖审计、移动端与可访问性门禁。

## Beta 边界与已知限制

- GitHub 权限是只读；不创建或修改真实 Issue、PR、源码或仓库设置。Issue Draft 只是草稿，不会自动发布。
- 系统建议、Candidate 和 AI 输出不是已确认事实；正式状态与关键决策由用户确认。
- 不实现团队、支付、BYOK、多模型、完整源码/Diff 扫描、公开项目页或自动修改仓库。
- 外部平台可用性、配额与成本受对应账户计划约束；当前 Beta 不承诺 Production SLA，长期趋势告警与成本自动化仍待后续运维增强。
- 请求级 CSP nonce 使 HTML 路由动态渲染；这是当前严格 CSP 的已接受性能成本。
- 安全与隐私文档描述的是当前代码和本地证据，不构成“生产绝对安全”或法律合规承诺。

## 技术栈与架构

- Next.js 16 App Router、React 19、TypeScript、Tailwind CSS
- Supabase Auth、Postgres、RLS/RPC 与本地 CLI/Docker
- GitHub App、GitHub Webhook、Inngest、DeepSeek 结构化生成
- Vitest、pgTAP、Playwright、ESLint

从 [Architecture Overview](docs/architecture/overview.md) 开始了解浏览器、Server Route、Service Role、数据库函数与外部 Provider 的信任边界。模块依赖规则见 [模块边界](docs/architecture/module-boundaries.md)，安全控制见 [公开 Beta 威胁模型](docs/security/beta-threat-model.md)。

## 快速开始

### 前置条件

- Git
- Node.js `22.22.3`（`.github/workflows/ci.yml` 的权威 CI 版本；本 Phase 的兼容回归也记录 Node `24.19.0`，但发布仍以 CI 固定值为准）
- pnpm `11.5.0`（由 `package.json#packageManager` 固定）
- Docker Desktop 或兼容 Docker Engine
- 本项目固定的 Supabase CLI `2.109.1`（通过 pnpm devDependency 使用，不使用全局漂移版本）

```powershell
git -c core.autocrlf=false clone https://github.com/hehehehehehecai/executor-command-center.git
Set-Location executor-command-center
pnpm install --frozen-lockfile
pnpm env:check
pnpm run db:start
pnpm run db:reset
pnpm dev
```

未配置外部变量时可以浏览 Preview。Connected 模式按 [.env.example](.env.example) 配置 `.env.local`；只复制变量名，不要提交或打印真实值。Local Supabase 凭据可用 `pnpm exec supabase status` 在本机查看，但不得进入 Git、Issue、报告或日志。

Windows 必须在 clone 时保持 LF；仓库包含字节级 SHA-256 治理 fixture，默认 `core.autocrlf=true` 会改变其工作树字节并使精确验证失败。已有 clone 不应通过改测试或放宽 hash 修复，应重新创建 LF 保真的干净 clone。

完整步骤、环境隔离和清理见 [Local / Staging / Production Runbook](docs/runbooks/environments.md) 与 [Local Database Runbook](docs/runbooks/local-database.md)。

## 质量门

```powershell
pnpm env:check
pnpm typecheck
pnpm lint
pnpm security:test
pnpm test
pnpm test:integration
pnpm test:e2e:core-journeys
pnpm security:secret-scan
pnpm audit --prod --audit-level high --json
pnpm build
pnpm test:security:csp-runtime
```

`pnpm test:integration` 和浏览器 Connected fixture 需要已运行的 Local Supabase。数据库变更还必须运行 `pnpm db:reset`、`pnpm db:test`、`pnpm db:lint`、`pnpm db:types:check` 与 `pnpm db:drift:check`。

## 运维与数据文档

- [Local / Staging / Production Runbook](docs/runbooks/environments.md)
- [Database Restore Runbook](docs/runbooks/database-restore.md)
- [Provider Outage Runbook](docs/runbooks/provider-outage.md)
- [Privacy / Data Lifecycle](docs/privacy/data-lifecycle.md)
- [安全政策](SECURITY.md)
- [CHANGELOG](CHANGELOG.md)

## 贡献、安全与版权

MVP/Beta 阶段不接受外部 Pull Request；普通 Bug 和非敏感产品反馈可通过 GitHub Issue 提交，详细规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题不得公开披露，请先阅读 [SECURITY.md](SECURITY.md)。

This repository is publicly visible for review purposes only. Copyright © 2026. All rights reserved. No license is granted to copy, modify, distribute, sublicense, or create derivative works from this source code.
