# Local Database Runbook

## 目标

本 Runbook 用于在 Windows PowerShell 中启动、重建、验证和停止本项目的 Local Supabase/PostgreSQL。数据库状态由 Git 中的 Migration 和 Seed 定义，不依赖 Studio 手工修改，也不连接 Staging 或 Production。

## 前置条件

- Windows PowerShell。
- Node.js 与项目声明的 pnpm `11.5.0`。
- Docker Desktop 或兼容 Docker Engine 已安装并启动。
- 当前用户可以访问 Docker daemon。
- 本机端口 `54320` 至 `54329` 未被其他服务占用。
- 所有命令从仓库根目录执行。

```powershell
Set-Location 'D:\AI workplace\探索者号'
```

## Docker 检查

```powershell
docker --version
docker info
docker ps --format '{{.Names}}|{{.Ports}}'
```

如果 `docker` 未被识别，但 Docker Desktop 已安装，请关闭并重新打开 PowerShell，使安装程序更新后的 `PATH` 生效。不要用远程 Supabase 绕过 Docker 前置条件。

## 安装依赖

```powershell
pnpm install --frozen-lockfile
pnpm exec supabase --version
```

项目将 Supabase CLI 精确固定为开发依赖；不要改用全局 CLI 或未经记录的其他版本。

## 启动 Local Supabase

```powershell
pnpm run db:start
```

首次启动会下载本地 Docker 镜像。该命令只启动 `supabase/config.toml` 定义的 Local 环境。

## 查看状态

```powershell
pnpm exec supabase status
docker ps --format '{{.Names}}|{{.Ports}}'
```

状态输出包含自动生成的本地开发凭据。不要复制这些值到 Git、Issue、PR、日志归档或远程环境。

## 从 Migration 与 Seed 重建本地数据库

```powershell
pnpm run db:reset
```

该命令执行 `supabase db reset --local`，删除并重建 Local 数据库，然后按顺序应用 Git 中的 Migration 和 `supabase/seed.sql`。

## 运行 pgTAP

```powershell
pnpm run db:test
```

pgTAP 验证 `app_private.database_baseline` 的 Schema、字段、主键、Seed 固定值、权限边界和幂等性。

## 运行完整 Integration

Local Supabase 必须保持运行：

```powershell
pnpm test:integration
```

该命令先运行 Node Integration，再运行真实本地 PostgreSQL 上的 pgTAP；不允许用零测试或 `passWithNoTests` 代替数据库验证。

## 生成数据库类型

```powershell
pnpm run db:types
```

类型只从 Local Supabase 的 `public,app_private` Schema 生成，并写入 `src/infrastructure/database/database.types.ts`。禁止手工编辑该文件。

## 检查类型漂移

```powershell
pnpm run db:types:check
```

检查模式在内存中重新生成类型，规范化换行后与已提交文件比较，不修改文件；存在差异时返回非零退出码。

## 检查 Schema Drift

```powershell
pnpm exec supabase db lint --local --level error --fail-on error --schema public,app_private
pnpm exec supabase db diff --local --schema public,app_private
```

项目 Schema 范围的 `db lint` 必须没有 error，`db diff` 必须不产生未提交 DDL。省略 `--schema` 会同时检查 Supabase 自带的 `extensions` Schema，可能输出 pgTAP 扩展内部兼容性诊断；这些诊断不得冒充项目 Schema 错误，也不得通过删除测试扩展来掩盖。若项目范围 diff 非空，应查明 Migration、Seed 或手工 Schema 漂移来源，不得直接复制 diff 掩盖原因。

## 停止服务

保留 Local 数据卷：

```powershell
pnpm run db:stop
```

## 删除 Local Volume

以下命令会删除本项目的本地持久化数据库状态，但不会访问远程数据库：

```powershell
pnpm exec supabase stop --no-backup
```

删除后使用以下命令从 Migration 与 Seed 恢复：

```powershell
pnpm run db:start
pnpm run db:reset
pnpm test:integration
```

## 从全新 Clone 恢复

```powershell
git clone https://github.com/hehehehehehecai/executor-command-center.git
Set-Location 'executor-command-center'
pnpm install --frozen-lockfile
docker info
pnpm run db:start
pnpm run db:reset
pnpm test:integration
pnpm run db:types:check
pnpm exec supabase db lint --local --level error --fail-on error --schema public,app_private
pnpm exec supabase db diff --local --schema public,app_private
```

恢复成功的判据是 Migration 和 Seed 应用成功、Seed 行数为 `1`、pgTAP 与 Node Integration 全部通过、类型和 Schema 均无漂移。

## 常见端口冲突

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 54320..54329 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

如有冲突，先识别并停止占用端口的本地进程，或在明确评估影响后调整本项目 `supabase/config.toml`。不得指向远程数据库规避冲突。

## Docker 不可用

```powershell
docker --version
docker info
Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue
```

如果 CLI 不存在，请安装 Docker Desktop；如果 daemon 不可用，请启动 Docker Desktop 并等待 `docker info` 成功。Docker 不可用时停止数据库操作，不运行远程 Supabase 命令。

## Local 与 Linked 的风险区别

- Local 命令只操作本机 Docker 中的 Supabase 资源。
- Linked 命令可能连接并修改远程 Supabase 项目。
- 本项目日常开发只允许 Local 流程，不应存在 `supabase/.temp/project-ref`。

> **危险：`supabase db reset --linked` 会删除远程数据库数据，本项目日常本地流程禁止使用。**

## 禁止命令

不得在本地开发流程中执行：

```text
supabase login
supabase link
supabase db pull
supabase db push
supabase db reset --linked
supabase db reset --db-url
supabase migration repair --linked
supabase gen types --linked
```

不得使用 Staging、Production、真实数据库 URL、真实 Service Role Key、真实 JWT Secret 或远程 Project Ref。
