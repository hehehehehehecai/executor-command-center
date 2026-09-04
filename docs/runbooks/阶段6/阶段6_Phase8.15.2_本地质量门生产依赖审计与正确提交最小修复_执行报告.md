# 阶段 6｜Phase 8.15.2｜本地质量门、生产依赖审计与正确提交最小修复｜执行报告

## 编排与边界

批次 ID：explorer-stage6-phase8.15.2-b9f1755dad73ff79

提示词实例 ID：explorer-stage6-phase8.15.2-d87803ca2074a78a

来源审核票据：review-ticket-43bad1db60d32230c92e9ddd

授权策略：workflow-authorization.v1

适用仓库：D:\AI workplace\探索者号

本批仅处理本地质量门、生产依赖审计与正确作者本地提交前置条件。未执行推送、PR 写入、部署、alias、云端数据库、Staging 业务写入、Production 或 Phase 9 动作。未读取、枚举、修改、暂存或提交 `.pnpm-store/`。

## 冻结与既有修改

- baseline HEAD：`5dcbee2af9b3489323949db31d145d04230f2c7a`
- baseline tree：`eba337f966a002d118cf8283dcb33284baa6c90f`
- 分支：`feature/stage4-bridge-five-panels`
- repo-local 作者：`hehehehehehecai <250114232+hehehehehehecai@users.noreply.github.com>`
- Phase 8.15.1 既有执行报告 SHA-256：`EF18B6AF78D9506590AF0C3EB650B4AEFF37766C92B6C01B4A091B9860BB2708`

保留的 Phase 8.15.1 代码/测试修改为：根首页登录态读取与展示、Command Deck 登录态展示、First Sync / Manual Resync / Brief / webhook 撤权失败关闭测试，以及相应页面测试；本批没有改动这些业务实现。

`next-env.d.ts` 在 Git 状态中显示修改，但逐文件 diff 为空，判定为生成文件的元数据差异；未纳入本批修改或未来暂存范围。

## 红灯与最小依赖修复

初始 `pnpm audit --prod --audit-level high --json` 为 `2 high / 0 critical`：

- `GHSA-c83g-rgw3-j3cx`，`browserslist@4.28.6`；
- `GHSA-73wf-gq98-2v4g`，`browserslist@4.28.6`。

两项均由 `next > styled-jsx > @babel/core > @babel/helper-compilation-targets > browserslist` 的生产解析链触发。直接新增根开发依赖无法改变该嵌套解析，已撤回该无效尝试。

pnpm 11 已不再从 `package.json` 的 `pnpm.overrides` 读取覆盖规则，因此按其当前工作区合同，在 `pnpm-workspace.yaml` 增加唯一解析覆盖：

```yaml
overrides:
  browserslist: 4.28.7
```

随后用本批外置 store 更新 `pnpm-lock.yaml`。锁文件已不含 `browserslist@4.28.6`，生产审计终态如下：

```text
high=0
critical=0
dependencies=244
optionalDependencies=80
totalDependencies=324
```

这是最小的 package-manager 解析配置；未升级 Next、React、Supabase 或其他直接业务依赖。

## 本地环境与失败链

本批在工作区外建立 `D:\AI workplace\phase8152-runtime\pnpm-store` 与 telemetry 临时目录。锁文件解析和物理依赖安装均指向该外置 store。

首次依赖更新因受限网络无法访问 registry 元数据而失败；经受控网络重跑后成功。随后 pnpm 默认回退程序为 `11.19.0`，但工作区声明 `pnpm@11.5.0`；两者把彼此创建的 `node_modules` 视作不兼容，标准脚本在启动测试前触发内部 `pnpm install`，并以：

```text
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

退出。已定位本机精确 `pnpm@11.5.0` 并用其验证安装；但其 `run` 前依赖状态检查仍在非交互模式尝试重建，未进入实际脚本。为避免第三次不透明重建或触及非本批范围，没有通过 `CI=true` 强行让门禁包装层再次替换依赖目录。

Docker Desktop 在此前一次本地启动后显示 `Error: backend exited before becoming ready`。本轮仅只读核验到残留后端进程和命名管道，未获得可确认的 Docker API 响应；未重启、重置、删除容器、镜像或卷。因此 Supabase integration/database 门禁不能执行。

## 质量门分母与结果

| # | 门禁 | 终态 | 证据 |
|---:|---|---|---|
| 1 | focused tests | PARTIAL_PASS | 直接 Vitest：6 files / 64 tests 通过；标准 pnpm 包装层未进入测试。 |
| 2 | `pnpm env:check` | BLOCKED_PNPM_RUNTIME | 测试前 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。 |
| 3 | `pnpm typecheck` | PARTIAL_PASS | 直接 `tsc --noEmit` 退出 0；标准 pnpm 包装层阻塞。 |
| 4 | `pnpm lint` | PARTIAL_PASS | 直接 ESLint 退出 0；标准 pnpm 包装层阻塞。 |
| 5 | `pnpm security:test` | BLOCKED_PNPM_RUNTIME | 测试前 pnpm 包装层阻塞。 |
| 6 | `pnpm test` | NOT_RUN_BLOCKED_PNPM_RUNTIME | 未启动，避免无意义重建。 |
| 7 | Secret scan | PASS | 747 scanned files / 0 finding / allowlist 3。 |
| 8 | production build | NOT_RUN_BLOCKED_PNPM_RUNTIME | 标准脚本未安全启动。 |
| 9 | CSP runtime | NOT_RUN_BLOCKED_PNPM_RUNTIME | 标准脚本未安全启动。 |
| 10 | integration | BLOCKED_DOCKER_AND_PNPM_RUNTIME | Docker 后端未就绪，pnpm 包装层亦阻塞。 |
| 11 | db types check | BLOCKED_DOCKER_AND_PNPM_RUNTIME | 同上。 |
| 12 | drift check | BLOCKED_DOCKER_AND_PNPM_RUNTIME | 同上。 |
| 13 | production audit | PASS | 0 high / 0 critical，退出 0。 |
| 14 | `git diff --check` | PASS | 退出 0。 |

Preview E2E 没有已授权的 base URL，保持 `NOT_RUN_C_BOUNDARY`；未以本地替代或伪造其结果。

## 范围、Git 与提交裁决

当前允许范围内的拟提交文件为 Phase 8.15.1 的 8 个代码/测试文件、Phase 8.15.1 报告、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 和本报告。`package.json` 的无效直接依赖尝试已撤回。

`git diff --check` 为 0；尚未暂存任何文件、未创建 commit。由于标准 pnpm 全量质量门和本地 Supabase 门禁尚未完成，按本批 Exit Criteria 不得创建“质量门已闭合”的正确作者提交，也不得生成 C 类远端推送/PR/Staging 票据。

`.pnpm-store/` staged/committed：0。云端、Production、Phase 9 动作：0。

## 结论与恢复条件

结论：**BLOCKED，不能提交，不能进入 C 类或 Phase 9。**

恢复必须同时满足：

1. Docker Desktop 后端可稳定启动并返回 Docker API；
2. 使用与工作区 `packageManager` 一致的 pnpm 运行门禁，且不再要求非预期重建 `node_modules`；
3. 重新运行所有 14 个分母并记录标准命令退出码；
4. 全绿后逐文件审计、仅暂存允许文件、以正确身份创建唯一本地 commit；仅在此后生成而不执行精确 C 类票据。

<!-- EXECUTION_REPORT_COMPLETE -->
