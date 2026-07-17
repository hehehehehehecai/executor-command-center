# EXECUTOR 阶段 1：工程基线实施计划

> **规划状态：** 已确认的设计已拆分为 Issue 级实施工作。本文件只描述计划，不执行代码实现。

**目标：** 建立公开、可测试、可部署、可恢复的仓库基线，包括模块边界、Preview Mode、本地数据库 Migration、CI 与 Preview 部署。

**架构说明：** 本阶段不实现真实登录与产品业务。先搭建外壳与工程护栏，证明项目可构建、可测试、可迁移、可预览。


## 全局约束

- 产品名称：`EXECUTOR — Command Your Projects`
- MVP 时间盒：6 周；第 6 周进入 Editor Mode，禁止增加重大新功能。
- 架构：Next.js + TypeScript 模块化单体。
- 数据：Supabase/PostgreSQL，Migration-first，Local / Staging / Production 完全隔离。
- GitHub：Supabase GitHub 登录 + 独立只读 GitHub App 安装授权。
- MVP 中，一个被选中的 GitHub 仓库等于一个 EXECUTOR 项目。
- 同步：首次最近 90 天 + 验签 Webhook + 每日轻量对账 + 手动重同步。
- 后台任务：Inngest 通过项目自有 `JobDispatcher` 接口接入。
- AI：DeepSeek 通过供应商无关的 `AIProvider` 接入；项目简报是 MVP 唯一完整建立 Eval 的 AI 能力。
- 隐私：所有真实项目数据均为私有，不支持公开分享。
- 工程：短生命周期分支、PR、CI、核心规则 TDD、UI 验收驱动、Release Tag 与 Changelog。
- MVP 不做：GitHub 写权限、源码/Diff 扫描、团队、支付、BYOK、多模型、Python 服务、微服务、公开项目页、完整移动端 HUD。

---

## 建议文件结构

```text
src/app/
src/features/command-deck/
src/shared/features/
src/shared/configuration/
src/content/demo-data/
supabase/migrations/
tests/e2e/
.github/workflows/
docs/architecture/
docs/runbooks/
```

### Task 1：建立仓库治理规则

**Issue：** `chore: establish executor repository governance`

**创建：**

- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `.gitignore`
- `.env.example`
- `.github/pull_request_template.md`
- `docs/superpowers/specs/2026-07-16-executor-design.md`
- 全部计划文件写入 `docs/superpowers/plans/`

**验收条件：**

- 创建公开仓库 `executor-command-center`；
- 不添加 LICENSE；
- README 明确 All rights reserved 与“源码仅供查看”；
- MVP 阶段不接受外部 PR；
- 安全问题通过私密渠道报告；
- `.env`、私钥、本地 Supabase 状态、测试产物和构建产物被忽略；
- `main` 必须通过 PR 和 Required Checks 合并。

**Commit：**

```bash
git commit -m "docs: establish executor repository contracts"
```

### Task 2：搭建 Next.js + TypeScript 工具链

**Issue：** `chore: scaffold nextjs typescript toolchain`

**创建或配置：**

- Next.js App Router；
- TypeScript；
- pnpm；
- ESLint；
- 样式系统；
- Vitest + jsdom + Testing Library；
- Playwright；
- 脚本：`lint`、`typecheck`、`test`、`test:integration`、`test:e2e`、`build`。

**TDD 步骤：**

1. 写测试，要求首页显示 `EXECUTOR` 和 `Command Your Projects`；
2. 运行测试并确认失败；
3. 实现最小品牌首页；
4. 运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Commit：**

```bash
git commit -m "chore: scaffold nextjs typescript toolchain"
```

### Task 3：建立模块边界与 Feature Registry

**Issue：** `feat: add feature registry and module boundaries`

**创建：**

- `src/shared/features/feature-definition.ts`
- `src/shared/features/feature-registry.ts`
- 对应测试
- `docs/architecture/module-boundaries.md`

**必须提供的接口：**

```ts
export type FeatureId =
  | "project-galaxy"
  | "flight-log"
  | "mission-control"
  | "decision-archive"
  | "copilot";

export interface FeatureDefinition {
  id: FeatureId;
  title: string;
  subtitle: string;
  route: string;
  order: number;
  requiresGitHubData: boolean;
}
```

**验收条件：**

- 恰好五个唯一 Feature ID；
- Route 唯一；
- 排序稳定；
- `domain/**` 不能导入 React、Next、Supabase、GitHub、Inngest 或 AI SDK；
- Feature 之间不能读取彼此的内部文件。

**Commit：**

```bash
git commit -m "feat: add feature registry and module boundaries"
```

### Task 4：实现 Preview Command Deck

**Issue：** `feat: add preview command deck`

**创建：**

- 版本化虚构 Demo Fixture；
- `CommandDeckPage`；
- 五个可访问的面板入口；
- Component Test；
- E2E。

**验收：**

```text
Given 访客未登录
When 打开 Command Deck
Then 五个面板全部可见
And 每个面板明确标记为演示数据
And 不发生 GitHub / Supabase / Inngest / DeepSeek 请求
```

本阶段不进行最终 HUD 视觉打磨。

**Commit：**

```bash
git commit -m "feat: add preview command deck"
```

### Task 5：初始化本地 Supabase 与 Migration-first

**Issue：** `chore: initialize migration-first database`

**创建：**

- `supabase/config.toml`
- `supabase/migrations/0001_create_baseline.sql`
- 本地 Seed；
- 生成的数据库类型；
- Integration Test；
- 本地开发 Runbook。

**验收：**

```bash
supabase db reset
pnpm test:integration
```

必须能够从空数据库重建并验证基线。

**Commit：**

```bash
git commit -m "chore: initialize migration-first database"
```

### Task 6：环境变量校验、CI 与 Preview

**Issue：** `chore: add ci and environment validation`

**创建：**

- 服务端与公开环境变量的 Zod 校验；
- `.github/workflows/ci.yml`；
- Dependabot；
- Vercel Preview。

**CI：**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

**验收：**

- Preview 仅使用演示数据，不使用生产 Secret；
- 创建一个临时失败测试并证明 CI 阻止 PR；
- 撤销临时失败后，真实 PR 全部通过。

**Commit：**

```bash
git commit -m "chore: add ci and environment validation"
```

## 阶段 1 门槛

- 仓库、设计和计划可恢复；
- Preview Deck 可用；
- 空库 Migration 重建成功；
- CI 和 Preview 可用；
- `main` 已保护；
- CI 确实拒绝过一次失败。
