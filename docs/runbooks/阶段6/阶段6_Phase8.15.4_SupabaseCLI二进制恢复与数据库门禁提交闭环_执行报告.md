# 阶段 6｜Phase 8.15.4｜Supabase CLI 二进制恢复与数据库门禁提交闭环｜执行报告

## 标识与边界

批次 ID：explorer-stage6-phase8.15.4-d21ec6e91d424e64
提示词实例 ID：explorer-stage6-phase8.15.4-5a3707cae711bce7
来源审核票据：review-ticket-0af24e19e464d3c8c773
授权策略：workflow-authorization.v1
适用仓库：D:\AI workplace\探索者号

本报告只覆盖本地 Supabase CLI 恢复与本地质量门闭环。未执行 Push、PR 写入、CI、Staging、Vercel alias、云端数据库或 Production 动作；未进入 Phase 9。仓库内 `.pnpm-store/` 未被读取、枚举、修改、暂存或提交。

## 冻结与谱系

- 恢复起点 HEAD：`5dcbee2af9b3489323949db31d145d04230f2c7a`。
- 当前分支：`feature/stage4-bridge-five-panels`。
- 仓库本地作者/提交者：`hehehehehehecai <250114232+hehehehehehecai@users.noreply.github.com>`。
- 允许的既有未提交内容：Phase 8.15.1 的 8 个源代码/测试文件、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 与 Phase 8.15.1–8.15.3 报告；`next-env.d.ts` 仅有生成器时间戳工作树标记，内容 diff 为空，未纳入暂存。
- 预先执行 `git diff --check`，退出码 `0`。

## 固定官方 CLI 恢复

| 项目 | 结果 |
| --- | --- |
| 锁定包 | `@supabase/cli-windows-x64@2.109.1` |
| registry | `https://registry.npmjs.org/` 官方 npm registry |
| 锁文件 integrity | `sha512-L9/pDLM+4IR8646aT69ZDVcnJeg1lZZsB26ZgI775S3f8jOHP41+1UH9Oq1g9CvKiAQviuaLgtwkuvi0I/cc/A==` |
| 外置运行时目录 | `D:\AI workplace\phase8154-runtime\supabase-cli` |
| 仓库依赖/lockfile改写 | `0` |
| 二进制 | `bin\supabase.exe`，SHA-256 `22C0F28F013411C7A7B880116CD33636EDB955A64278914692EEA010BCC98DC7` |
| 版本回读 | `supabase.exe --version` → `2.109.1`，退出码 `0` |

首次在沙箱内直接运行二进制时，CLI 尝试写默认遥测路径而被系统拒绝；随后只设置进程级 `SUPABASE_TELEMETRY_DISABLED=1` 并在批准的本地运行边界重试，版本回读成功。未下载 latest、未使用第三方二进制、未修改全局 CLI 配置，也未访问云端项目。

## 红灯、最小恢复与绿灯

原阻塞：项目 `node_modules` 中缺少 Windows Supabase CLI binary，使 `test:integration`、`db:types:check`、`db:drift:check` 不能完成。

最小恢复：只在仓库外的 Phase 8.15.4 专用目录安装锁定的官方平台包，并用进程级 `SUPABASE_CLI_BINARY_OVERRIDE` 指向该固定 binary。项目 `package.json`、`pnpm-lock.yaml` 与迁移均未因这一步改变。

## 本批门禁结果

| 分母 | 命令/证据 | 结果 |
| --- | --- | --- |
| 1/7 CLI 获取与版本 | 固定包、integrity、SHA-256、`--version` | PASS |
| 2/7 integration | `pnpm test:integration` | PASS：应用 `21/67`；本地 pgTAP `44/1001` |
| 3/7 DB types | `pnpm db:types:check` | PASS：generated types up to date |
| 4/7 DB drift | `pnpm db:drift:check` | PASS：schema drift empty |
| 5/7 必要回归 | 六个直接受影响的 Vitest 文件 | PASS：`6/64` |
| 6/7 暂存审查 | 精确路径暂存后 `git diff --cached --check` 与 staged 清单 | 本报告写入后执行；必须为 PASS 才允许提交 |
| 7/7 正确作者提交 | 单一新本地 commit | 本报告写入后执行；必须为 PASS 才允许提交 |

`pnpm test` 的两次非交互启动均只回传 Vitest 启动行、未返回可审计的终态，故不将其作为本批新增绿灯。Phase 8.15.3 在相同代码候选上已留存完整通过基线 `193 files / 1804 tests`；本批以有终态的直接影响回归 `6/64` 补证，且未改动任何应用代码。

继承的 Phase 8.15.3 已通过门禁（本批未改动其适用代码）：环境合同 `1/1`、typecheck、lint、安全合同 `12/59`、Secret scan `747 files / 0 finding / allowlist 3`、production build、CSP runtime `4 routes / 40/40 scripts / 0 errors`。本批在提交前重新运行 production audit：`244` dependencies、`80` optional、`324` total，`high=0`、`critical=0`，退出码 `0`。

## 暂存范围与提交

将只暂存以下文件：

- `pnpm-workspace.yaml`、`pnpm-lock.yaml`；
- `src/app/page.tsx`、`src/app/page.test.tsx`；
- `src/features/command-deck/command-deck-page.tsx`、对应测试；
- `src/application/webhooks/ingest-github-webhook.test.ts`；
- 三个 Project API 路由测试；
- Phase 8.15.1、8.15.2、8.15.3 与本报告。

禁止项：`next-env.d.ts`、仓库内 `.pnpm-store/`、外置 `phase8154-runtime`、任何云端配置或数据均不暂存。本报告随唯一正确身份本地提交写入；提交 hash 以提交后 `HEAD` 的只读回读为准，并在本任务终态中提供。

## 外部边界与下一步票据

本批外部副作用：Push `0`、PR 写入 `0`、CI 触发 `0`、Staging `0`、Production `0`。数据库门禁只连接 Docker 中的本地 Supabase 实例。

若且仅当本地提交、暂存审查和作者核验均通过，下一动作需要独立 C 类票据：`PHASE8.15.4-STAGING-REVALIDATION-AFTER-LOCAL-COMMIT`。唯一动作应明确为：把该精确本地提交按既有 Phase 8 边界推送到 feature/staging，并在 Staging 重验；本批不执行该票据。

## 结论

CLI 缺失根因已通过官方固定平台包恢复，三项原阻塞数据库门禁及必要回归均已绿色。待完成精确暂存审查与唯一正确作者本地提交后，本地门禁闭环可交由独立审核；Phase 8 其他未完成生命周期/外部门禁仍不计为完成，Phase 9 为 NO-GO。

## 已确认 Staging 复验与 CI 修复链

用户已确认 `PHASE8.15.4-STAGING-REVALIDATION-AFTER-LOCAL-COMMIT`。执行前冻结提交 `6f0eddb4c0ec11f71e1d6b2b312898e28a961e6d`、作者/提交者 `hehehehehehecai <250114232+hehehehehehecai@users.noreply.github.com>`、远端 feature/staging `5dcbee2af9b3489323949db31d145d04230f2c7a`、PR #27 `OPEN` 且 base=`main`。两个远端 ref 都是该提交祖先，因此只对 feature 执行了一次普通 fast-forward Push；GitHub API 回读该 commit 的 author/committer login 均为 `hehehehehehecai`，PR head 同步为 `6f0eddb`。

CI run `33610046192` 在 `Run authenticated fixture end-to-end tests` 失败，退出码 `1`；后续 connected/a11y/build/CSP 步骤被 GitHub 正确跳过。失败没有推进 staging 或 Vercel。首次 `gh run watch` 读取该 run 返回 API 404，但官方 REST run/job 读取有效；失败日志的只读下载确认：`tests/e2e-auth-fixture/github-sign-in.spec.ts` 在第二次访问 `/` 时仍等待匿名链接 `使用 GitHub 登录`，超时 30 秒。

根因：首页新增的 server-side `getUser()` 在 auth fixture 的无 cookie 初始请求中被 synthetic `/auth/v1/user` 无条件响应误导；而在首次成功登录后，测试仍错误地期望匿名入口。RED：新增“无 Supabase session cookie 仍显示登录入口且不调用 getUser”的页面测试，旧实现失败。最小 GREEN：仅当 cookie 名称匹配 `sb-…-auth-token` 或其分片时才执行 `getUser()`；更新 E2E 以验证登录后首页显示 `GitHub 身份已登录` 与 `查看 GitHub App 状态`，不再要求第二次登录。验证：页面单测 `3/3`、认证 fixture E2E 退出码 `0`、typecheck `0`、lint `0`、完整单元测试 `193 files / 1805 tests`、production build 退出码 `0` 通过。build 自动生成的 `next-env.d.ts` 已恢复为提交基线内容，未纳入本批 diff。

该最小修复尚待创建第二个正确作者本地提交并重跑 PR CI；在该 CI 成功前，staging ref、原生 Preview deployment 与 stable alias 均保持不变。Production、main merge、Tag、Release 和 Phase 9 均为 `0`。

## CI 复跑中的可访问性夹具清理修复

第二个修复提交 `1c3f402b47d6cabad98e7116e86aca1f7cf8535a` 已以正确作者推送至既有 feature，GitHub API author/committer login 均为 `hehehehehehecai`。CI run `33613185915` 通过环境、Secret/audit、安全合同、lint、typecheck、全量 unit、数据库、integration、local/core/authenticated/connected E2E；其后仅在 Phase 6 accessibility 的 `A11Y-CONFIRM-02` 失败，`8/9`。

日志证明失败发生在夹具 cleanup：浏览器中仍挂载 `AccountDeletionPanel`，而 cleanup 已移除该合成身份，面板的账户状态读取收到 `401`，被全局 console-error 门禁正确捕获。该 401 不是正常用户界面可忽略项，也不应以放宽断言隐藏。最小修复为测试在 cleanup 前导航回首页，从而卸载账户状态 reader；没有改变账户删除 API、身份状态机或任何生产授权。typecheck 与 lint 均重新通过；本机 Docker Desktop 后端当时不可用，因此不把本地 accessibility 重跑记为通过，最终证据以新的 exact-head CI 为准。Staging、Vercel alias、Production 与 Phase 8.13 三组业务 harness 均仍未移动或重放。

<!-- EXECUTION_REPORT_COMPLETE -->
