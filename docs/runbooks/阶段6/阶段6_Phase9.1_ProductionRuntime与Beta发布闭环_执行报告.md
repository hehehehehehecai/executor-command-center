# 阶段 6｜Phase 9.1｜Production Runtime 与 Beta 发布闭环执行报告

## 1. 编排标识与当前状态

- 批次 ID：`explorer-stage6-phase9.1-71b2e4c980ad3f56`
- 提示词实例 ID：`explorer-stage6-phase9.1-6e12f935d54b4a88`
- 来源审核票据：`review-ticket-8f2902b7430e6c18e4a1`
- 上游 Phase 9 批次：`explorer-stage6-phase9-18ffe2aec5ac6f29`
- 精确 RC：`b105e4f89611a865afde507d78377ded9aa0b16c`
- 当前状态：`PRODUCTION_RC_RUNTIME_SMOKE_PASS_AWAITING_REVIEW`
- Phase 9：未完成
- 是否进入 Phase 10：否

本报告是 Phase 9.1 的独立执行记录，不再把新增证据追加到上游 Phase 9 报告。当前已闭合 Production Supabase→Vercel 配置传递、Production GitHub App 创建/安装、Production 数据库 migration、Supabase Auth GitHub provider 配置、OAuth 入口 runtime 合同修复、GitHub OAuth 用户授权，以及精确 RC 的 Production runtime 验证。正式 alias 已由 CLI Production deployment `dpl_FWwWyDcuVtMRfFsCxXWfEJnbZod1` 接管；该 deployment 来自精确 RC `b105e4f89611a865afde507d78377ded9aa0b16c` 的隔离 Git archive，Production OAuth、内部身份持久化、Installation 幂等登记、仓库加载和五个核心面板 smoke 均已通过。Git-integrated `main` 发布、tag、GitHub Release 与实际 rollback switch/restore 尚未在 Phase 9.1 执行，留待 Phase 9.2 独立闭环。

## 2. 冻结的 Production 资源身份

| 资源 | 唯一身份 | 当前证据 |
| --- | --- | --- |
| Supabase Production | `txvhhokykangfosabgiq` / `executor-command-center-production` / `ACTIVE_HEALTHY` / `ap-northeast-2` | 独立 CLI profile 仅返回该项目；已完成远端 migration 对账 |
| Vercel Project | team `team_IDGruFjuEZmy1dJRsg0RYkKf` / project `prj_vRfWcuvLYn240SSuKyNH0g4ShpW8` | Production env 与 deployment 均限定在该项目 |
| GitHub App | App ID `4813745` / slug `executor-production-hehehehehecai` | GitHub Apps 页面可见；与 Local、Staging App 并列且未覆盖旧 App |
| GitHub Repository | `hehehehehehecai/executor-command-center` | Production App 仅安装到该仓库 |
| 当前 Production deployment | `dpl_FWwWyDcuVtMRfFsCxXWfEJnbZod1` / `executor-command-center-4y8hkapp6-hehehehehehecais-projects.vercel.app` | `READY` / `production` / `source=cli`；alias 为 `executor-command-center.vercel.app` |

当前 Production deployment 来自精确 RC `b105e4f89611a865afde507d78377ded9aa0b16c` 的隔离 `git archive` 目录；Git tree 为 `b0250031fc1c786b9232e7fcd9c0858773b457f9`。关键文件 `github-provider-identity-mapper.ts`、其测试文件与 `pnpm-lock.yaml` 的 filtered Git blob 均与该 commit 精确匹配。隔离目录不包含工作区脏文件或仓库 `.pnpm-store/`。旧 Production deployment `dpl_EatR4yndM8E5q5GuxBNVPSSrkpZH` 保留为明确回滚点。

Staging `gsnuorsqdcdszjxtymhs` 未修改；排除项目 `gswbmqmoiuofwgkwckmw` 未访问或修改；仓库 `.pnpm-store/` 未读取、修改、暂存或提交。

## 3. Production Supabase → Vercel 配置传递

用户已明确批准 `human-action-e95fcc4aa594a86c`。执行使用内存直传，不把 Supabase key 写入磁盘或命令行参数，不在报告或终端输出 Secret 正文。

最终 Production scope 名称级回读为 5/5：

1. `APP_ORIGIN`
2. `NEXT_PUBLIC_SUPABASE_URL`
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. `SUPABASE_SERVICE_ROLE_KEY`
5. `GITHUB_REST_API_VERSION`

其中 `NEXT_PUBLIC_SUPABASE_URL` 精确绑定 `txvhhokykangfosabgiq`；`SUPABASE_SERVICE_ROLE_KEY` 在 Vercel 中为 `sensitive`，其余四项为 `encrypted`。首次 Production 内存校验确认 `APP_ORIGIN` 与 Supabase URL 精确匹配、GitHub App ID/slug 格式有效，但 `GITHUB_REST_API_VERSION` 不符合代码合同。执行仅把该 Production 变量修正为精确值 `2026-03-10`，未修改其他 scope、变量或项目；修正后内存回读 `github_api_version_valid=true`。

Production scope 后续还已具备 `GITHUB_APP_ID`、`GITHUB_APP_SLUG`、`GITHUB_APP_PRIVATE_KEY` 和 `GITHUB_WEBHOOK_SECRET`；本报告只记录名称与存在性，不记录值。

## 4. Production 数据库 migration 闭环

### 4.1 写前状态

- remote migration ledger：0 条；
- `public` 业务表：0；
- `app_private` 业务表：0；
- 本地 forward-only migration：31 个；
- 本地与仓库源文件 SHA-256 对账：31/31 一致。

### 4.2 CLI profile 兼容问题与安全恢复

Supabase CLI `2.109.1` 与 `2.116.0` 对自定义 legacy profile selector 均在数据库命令前失败，报错为 `failed to read profile: Unsupported Config Type ""`。官方 CLI 源码回读证明 legacy loader 会把非内置 profile 名当作配置文件路径处理；这是 CLI profile 解析兼容问题，不是数据库 migration 失败。

执行使用可逆 selector 方案：先校验 `C:\Users\admin\.supabase\profile` 原始字节 SHA-256 为 `C7F246A1FB67C2B6AF8BB754C8A25BB815DCB11D9D7323F00CC9D14D5122CBCE`，仅在数据库命令进程期间临时选择内置 `supabase` profile，并在 `finally` 中恢复原始字节。写前身份检查确认该内置 profile 只可见唯一目标 Production 项目。dry-run 与实际执行后均回读同一原始 SHA-256，selector 已恢复。

### 4.3 写后权威回读

| 检查 | 结果 |
| --- | --- |
| remote migration ledger | 31/31；版本集合与本地完全一致 |
| `public` tables | 23 |
| `app_private` tables | 2 |
| 关键表 | `users`、`github_installations`、`github_installation_states`、`selected_repositories`、`projects`，5/5 存在 |
| 关键 RPC | `create_github_installation_state`、`consume_github_installation_state`、`register_verified_github_installation`、`read_current_github_installation`，4/4 存在 |
| 未启用 RLS 的 `public` 表 | 0 |
| client dangerous table grants | 0 |
| users/installations/states/selected repositories/projects 行数 | 均为 0 |

Production migration 已闭环，且空业务数据状态符合新 Production 项目预期。没有执行 seed、reset、repair 或手工业务数据写入。

## 5. Production GitHub App 与 Installation 状态

Production GitHub App 已创建，App ID 为 `4813745`，slug 为 `executor-production-hehehehehecai`。权限保持最小只读合同：Actions、Checks、Contents、Issues、Pull requests 与 Metadata 均为 read-only；事件包含 Issues、Pull request、Push、Release、Repository 与 Workflow run。App 已仅安装到 `hehehehehehecai/executor-command-center`。

Vercel Production 已存在 App ID、slug、private key 与 webhook secret 的名称级配置。未输出 private key 或 webhook secret；未修改现有 Local/Staging App。

Installation setup callback 曾返回 `/onboarding?installation=configuration_failed`。当前 deployment 的安全结构化日志为：

- `failure_code="unauthenticated"`；
- `session_valid=false`；
- `github_api_called=false`；
- `installation_persisted=false`；
- `installation_id_present=true`。

因此该次 callback 在 GitHub API 与数据库持久化之前退出，直接原因是应用没有 Supabase 用户会话，而不是 migration、GitHub installation 权限或数据库 RPC 失败。

2026-09-04 的真实 OAuth 复验已越过该边界：`/onboarding` 权威页面显示 `authenticated=true`、`github_app_installation=not_registered`、`repository_access=not_loaded`。从该页面发起 Installation 后，当前 deployment 的结构化日志返回 `installation_state_persistence_failed`，同时明确 `session_valid=true`、`github_api_called=false`、`installation_persisted=false`。这证明 Supabase 会话已经建立，而 Installation state 在 GitHub API 调用前因旧 deployment 的内部身份映射/持久化链路失败。

精确 RC 部署后，Production OAuth callback 返回 303 info，`/onboarding` 返回 200 并显示 `authenticated=true`，不再出现 `invalid_github_provider_identity`。现有 GitHub Installation `158702055` 的官方配置页回读仍为 Only select repositories，且仅 `hehehehehehecai/executor-command-center` 一个仓库；Save 为 disabled，说明没有修改安装配置。执行只使用由 Production `/api/github/installations/start` 新生成并写入 HttpOnly callback cookie 的 state，通过受校验的 `/api/github/installations/setup` 路径登记现有 Installation，没有构造或猜测 state。

首轮 setup 后页面显示 `github_app_installation=active`；重复生成新 state 并以同一 Installation 再次完成 setup 后，状态仍为 `active`，证明幂等重复登记通过。两次 setup 在新 deployment runtime log 均为 303 info。加载仓库访问后，页面显示 `repository_access=loaded`、`authorized_repository_count=1`，唯一仓库为 `hehehehehehecai/executor-command-center`；对应 `/api/github/repositories` 为 200。

## 6. Supabase GitHub Provider 闭环与 OAuth 入口复验

GitHub App `executor-production-hehehehehecai` 的 OAuth Callback URL 已在官方设置页保存并回读为 `https://txvhhokykangfosabgiq.supabase.co/auth/v1/callback`。该 App 新生成的 Client Secret 已通过内存链路写入 Supabase Production `txvhhokykangfosabgiq`，GitHub provider 页面状态由 Disabled 变为 Enabled；Client ID 为 `Iv23liynKPsMpAeAsrje`。

随后使用现有 Supabase CLI OAuth token 在内存调用官方 Management API `GET /v1/projects/txvhhokykangfosabgiq/config/auth`，HTTP 200 权威回读为：`external_github_enabled=true`、Client ID 存在且长度 20、Client Secret 存在、`site_url=https://executor-command-center.vercel.app`、`uri_allow_list=https://executor-command-center.vercel.app/auth/callback`。Client ID 的 SHA-256 为 `89f3baffebedc5c4ed447f9b078e610d2e805bc596af9842e7577ea0633025be`。全过程未输出 Secret 正文、未把 Secret 写入磁盘；浏览器剪贴板已清除，承载 Secret 的 Node 内存已重置。

项目代码只使用 Supabase OAuth：`/api/auth/github` 调用 `signInWithOAuth({ provider: "github" })`，其 `redirectTo` 为 `https://executor-command-center.vercel.app/auth/callback?returnTo=...`；GitHub provider 自身回调 Supabase `https://txvhhokykangfosabgiq.supabase.co/auth/v1/callback`。上述两层回调配置均已完成。

配置完成后的首次 OAuth 入口复验未通过：外部 `curl` 探针因当前执行网络无法连接而得到 HTTP `000`，该结果仅记为验证环境限制；Vercel 受控抓取则成功访问同一路径，并在 2026-09-03 17:46（Asia/Shanghai）权威返回 HTTP 503、正文 `Authentication is not configured.`，Vercel runtime log 也记录 `/api/auth/github` 为 503，因此不能把该 503 归因于探针网络。

按代码 `parseServerEnvironment()` 的固定合同对 Vercel Production 做只读内存校验：`APP_ORIGIN`、`NEXT_PUBLIC_SUPABASE_URL`、GitHub App ID/slug 与 Inngest 组均通过；仅 `GITHUB_REST_API_VERSION` 不等于要求值 `2026-03-10`。Vercel 的 3 个 Secret 因平台安全限制不可回拉，本次只记录其 Production 名称级存在性，不读取或输出正文。由于路由捕获环境解析异常后统一返回同一 503，执行仅将该变量修正为 `2026-03-10`，随后基于当前 Production 使用最新 Project Settings 重新部署。

新 deployment `dpl_EatR4yndM8E5q5GuxBNVPSSrkpZH` 已 `READY` 并接管 `executor-command-center.vercel.app` alias。2026-09-03 17:56（Asia/Shanghai），Vercel 受控抓取 `GET /api/auth/github?returnTo=%2Fonboarding` 返回 HTTP `303 See Other`；Location 的主机/路径为 `txvhhokykangfosabgiq.supabase.co/auth/v1/authorize`，provider 为 GitHub，`redirect_to` 精确指向 `https://executor-command-center.vercel.app/auth/callback?returnTo=%2Fonboarding`。Vercel runtime log 同时记录新 deployment 的 `/api/auth/github` 为 303。Location 中的一次性 PKCE 参数与响应 cookie 不写入本报告。

首次真实 OAuth 回调在 GitHub provider 用户资料阶段失败，安全日志为 `callback_provider_error`。执行对照 Supabase Auth provider 实现与 GitHub REST 权限合同，确认 Supabase GitHub provider 会读取 `/user/emails`，而 Production GitHub App 当时没有任何 Account permission。经审核任务取得用户明确批准后，执行只把 Production App `executor-production-hehehehehecai` 的 Account permissions → `Email addresses` 从 `No access` 改为 `Read-only` 并保存；权威回读显示 `Email addresses / Selected / Access: Read-only`。Repository permissions 仍为 `5 selected / 1 mandatory`，Organization permissions 仍无已选项；未修改其他权限，未新建或轮换 Secret。

全新 OAuth 复验中，GitHub 更新授权页只显示新增 `Email addresses / Read-only`，授权后 Supabase 会话建立，`/onboarding` 显示 `authenticated=true`。当前 deployment 的回调日志由 `callback_provider_error` 进展为 `invalid_github_provider_identity`。仓库差异证明当前 Production 所用旧 main 缺少 Supabase `UserIdentity` SDK shape 适配，而精确 RC `b105e4f89611a865afde507d78377ded9aa0b16c` 已包含 `identities[].id` 兼容逻辑及对应测试。因此 OAuth provider 权限门禁已经关闭；剩余技术门禁是把已批准精确 RC 部署到 Production，使内部身份与 Installation state 持久化使用新实现。

用户在本执行任务明确批准将精确 RC 部署到 Vercel Production 并知悉可能短暂影响线上服务。首次 CLI 上传完成后读取部署结果发生 `fetch failed`，Vercel 权威部署列表确认没有创建新 deployment，因此只重试一次。第二次部署成功：依赖供应链策略校验通过，Next.js build、TypeScript 与静态页生成全部通过；新 deployment `dpl_FWwWyDcuVtMRfFsCxXWfEJnbZod1` 为 `READY` 并接管正式 alias。部署后 OAuth、身份持久化、Installation 幂等登记、仓库访问及认证态基础 API smoke 均通过；15 分钟范围内 Vercel Runtime Errors 为 `No runtime errors found`。

封口 smoke 还确认：公开首页返回 200，并携带 CSP、HSTS、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、严格 Permissions Policy 与 Referrer Policy；无会话访问 `/api/projects` 和 `/api/github/repositories` 均返回预期 401，日志明确 `session_valid=false` 且未调用 GitHub、未启动同步。现有认证浏览器会话依次访问 `/project-galaxy`、`/flight-log`、`/mission-control`、`/decision-archive`、`/copilot`，五个核心只读面板均返回 200。最终 20 分钟 Runtime Errors 聚合仍为无错误；预期 401 仅作为安全拒绝 warning，不构成运行时故障。

官方依据：

- GitHub App 修改指南：`https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration`
- GitHub App user access token/Client Secret 指南：`https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app`
- GitHub Apps REST 端点清单：`https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28`
- Supabase GitHub 登录配置：`https://supabase.com/docs/guides/auth/social-login/auth-github`
- Supabase Auth redirect URL：`https://supabase.com/docs/guides/auth/redirect-urls`
- Supabase Auth Management API：`https://supabase.com/docs/reference/api/v1-get-auth-service-config`、`https://supabase.com/docs/reference/api/v1-update-auth-service-config`

## 7. 发布门禁与禁止动作

| 门禁/动作 | 状态 |
| --- | --- |
| Production Supabase→Vercel 5 项配置 | PASS |
| Production GitHub App 创建与最小权限 | PASS |
| Production GitHub App 单仓库安装 | PASS |
| Production database migration | PASS，31/31 |
| Supabase Auth Site URL / redirect allow list | PASS，Production 精确 URL 已回读 |
| Supabase Auth GitHub provider | PASS；页面 Enabled，Management API 回读 enabled、Client ID/Secret 均存在 |
| Vercel Production runtime 合同 | PASS；`GITHUB_REST_API_VERSION=2026-03-10` 已精确修正并回读 |
| Production OAuth 入口 | PASS；新 deployment 返回 303 并重定向至 Production Supabase GitHub authorize |
| Production GitHub Account permission | PASS；仅 `Email addresses=Read-only`，已保存并权威回读 |
| 真实 GitHub OAuth 用户授权 | PASS；Supabase session 已建立，`/onboarding` 显示 `authenticated=true` |
| 精确 RC Production deployment | PASS；`dpl_FWwWyDcuVtMRfFsCxXWfEJnbZod1` READY 并接管正式 alias |
| 认证态 Installation 持久化 | PASS；现有 Installation 为 active，重复登记后仍 active |
| PR #27 merge | NOT_RUN |
| RC Git-integrated Production deployment | NOT_RUN |
| Production smoke | PASS；公开首页 200；五个核心只读面板 5/5 为 200；认证态 onboarding/基础 API 正常；未认证敏感 API 预期 401；近 20 分钟无 runtime error |
| tag `v0.1.0-beta.1` / GitHub Release | NOT_RUN |
| rollback switch/restore | NOT_RUN |
| Phase 10 | PROHIBITED / NOT_ENTERED |

本轮已把精确 RC 的 CLI Production deployment、OAuth、内部身份持久化、Installation 幂等登记与必要 smoke 闭合；没有合并 PR #27、没有把 CLI 发布伪装为 Git-integrated main 发布、没有创建 tag/release、没有执行回滚切换，也没有进入 Phase 10。旧 deployment `dpl_EatR4yndM8E5q5GuxBNVPSSrkpZH` 仍是可用回滚点。下一步仅等待审核任务复核并决定既定 Phase 9.1 剩余发布门禁。

<!-- EXECUTION_REPORT_COMPLETE -->
