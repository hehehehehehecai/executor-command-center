# 阶段 6｜Phase 8.15.3｜pnpm 运行时一致性与 Docker 后端恢复最小修复｜执行报告

批次 ID：explorer-stage6-phase8.15.3-0ab5123632270100

提示词实例 ID：explorer-stage6-phase8.15.3-4545ebc6599f46c8

来源审核票据：review-ticket-c44116205d4b168d5309e422

授权策略：workflow-authorization.v1

适用仓库：D:\AI workplace\探索者号

## 只读冻结

- HEAD：`5dcbee2af9b3489323949db31d145d04230f2c7a`；分支：`feature/stage4-bridge-five-panels`。
- 工作区保留 Phase 8.15.1 的 8 个登录态/撤权 fail-closed 代码与测试修改，以及 Phase 8.15.2 的 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`。
- `next-env.d.ts` 显示为修改，但 Git 内容 diff 为空；未纳入范围。
- repo-local author/committer：`hehehehehehecai <250114232+hehehehehehecai@users.noreply.github.com>`。
- 精确 pnpm 路径：`C:\Users\admin\AppData\Roaming\fnm\node-versions\v22.22.3\installation\node_modules\pnpm\bin\pnpm.cjs`；版本 `11.5.0`。
- 本批外置 store/telemetry：`D:\AI workplace\phase8153-runtime\pnpm-store`、`D:\AI workplace\phase8153-runtime\telemetry`。

所有 Git 状态检查使用 `--untracked-files=no`；未读取、枚举、修改、删除、暂存或提交仓库内 `.pnpm-store/`。

## pnpm / node_modules 恢复

初始 `node_modules/.modules.yaml` 标记为 pnpm `11.19.0`，而工作区声明 `pnpm@11.5.0`；标准脚本在测试前以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 终止。通过精确 pnpm `11.5.0`、`CI=true`、外置 store 运行标准命令后，`pnpm env:check` 已实际启动并通过。

首次构建暴露 Next SWC 与 Supabase Windows CLI 可选二进制未安装。已验证 `node_modules` 为仓库内纯生成依赖后删除该唯一目标并按 frozen lockfile 重建；这没有影响源码、`.pnpm-store`、Docker 数据或云端资源。第二次 production build 成功，说明 Next SWC 已恢复。

Supabase CLI Windows 二进制仍缺失。为了避免修改项目依赖，尝试只在 `D:\AI workplace\phase8153-runtime\supabase-cli` 安装锁定版本 `@supabase/cli-windows-x64@2.109.1`，并计划通过 `SUPABASE_CLI_BINARY_OVERRIDE` 供本地门禁使用；该 tarball 经一次自动安全重试后以 timeout 退出，未获得二进制，未改动项目 manifest/lockfile。

## Docker / WSL 证据

- Docker client/server：`29.7.2 / 29.7.2`，`docker version` 退出 0；Engine API 已 ready。
- Docker Desktop/backend 进程及 engine pipe 存在。
- `wsl -l -v` 的只读调用返回 `E_ACCESSDENIED`，因此未执行 `wsl --shutdown`、未重启 Docker 后端、未触碰任何 WSL 用户工作负载。
- 未执行 Docker factory reset，未删除 container/image/volume。

## 固定 14 项分母

| # | 门禁 | 结果 | 证据 |
|---:|---|---|---|
| 1 | production audit | PASS | `0 high / 0 critical`；244 dependencies、80 optional、324 total。 |
| 2 | integration | NOT_RUN_SUPABASE_CLI_BINARY_BLOCKED | 本地 Docker 已 ready，但项目 Supabase CLI 缺 Windows 二进制。 |
| 3 | db types check | NOT_RUN_SUPABASE_CLI_BINARY_BLOCKED | 同上。 |
| 4 | db drift | NOT_RUN_SUPABASE_CLI_BINARY_BLOCKED | 同上。 |
| 5 | Phase 8.15.1 focused | PASS | 标准 pnpm 环境内的相关全量结果覆盖；此前聚焦 6 files / 64 tests 通过。 |
| 6 | `pnpm env:check` | PASS | 1 file / 1 test。 |
| 7 | `pnpm typecheck` | PASS | exit 0。 |
| 8 | `pnpm lint` | PASS | exit 0。 |
| 9 | `pnpm security:test` | PASS | 12 files / 59 tests。 |
| 10 | `pnpm test` | PASS | 193 files / 1804 tests。 |
| 11 | `pnpm security:secret-scan` | PASS | 747 scanned / 0 finding / allowlist 3。 |
| 12 | `pnpm build` | PASS | Next 16.3.0 production build exit 0。首次 sandbox SWC cache EPERM 已以最小系统审批重跑并解决。 |
| 13 | `pnpm test:security:csp-runtime` | PASS | 4 routes；40/40 script nonce matching；0 error。 |
| 14 | `git diff --check` / commit | BLOCKED | diff check exit 0；因 2–4 未执行，未暂存、未提交。 |

## 依赖审计与最小修改

`pnpm-workspace.yaml` 的唯一新增解析规则为：

```yaml
overrides:
  browserslist: 4.28.7
```

`pnpm-lock.yaml` 已无 `browserslist@4.28.6`。该修复保持 Phase 8.15.2 已取得的 production audit `0 high / 0 critical`，未升级 Next、React、Supabase 或业务依赖。

## 系统审批、禁止动作与结论

系统审批：已批准。

审批命令或前缀：本地 Docker API 只读、生成 `node_modules` 安全重建、Next SWC 缓存构建、外置 Supabase CLI 临时安装。

可选检查未执行：无。

C 类动作：无；未生成 Staging 票据，因为数据库三项门禁未通过。

未执行 Push、PR 写入、部署、alias、云端环境变量、Staging/Production 数据写入、main merge、Phase 9。`.pnpm-store/` staged/committed：0。

结论：**BLOCKED，不能创建本地候选提交。** 唯一剩余技术前提是可从 registry 获得 `@supabase/cli-windows-x64@2.109.1` 并通过外置 override 运行 integration、db types、db drift；之后需要重跑三项并完成 staged review/正确作者 commit。是否进入下一阶段：**否**。

<!-- EXECUTION_REPORT_COMPLETE -->
