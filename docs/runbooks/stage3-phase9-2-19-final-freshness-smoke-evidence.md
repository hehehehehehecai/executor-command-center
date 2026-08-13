# 探索者号｜阶段 3｜Phase 9.2.19 最终 staging Freshness 可见性 Smoke 证据

## 结论

本批 PASS。审核通过的产品 commit 已普通 fast-forward 到既有 `staging`，Vercel Hobby Preview 精确绑定该完整 SHA，真实 `/project-galaxy` 页面在既有 staging OAuth 会话下可见并与 Supabase 只读权威事实一致。匿名和不存在 Project 边界均安全；没有 GitHub 测试对象、GitHub App、数据库、Inngest、Manual Resync、Production 或付费副作用。

该 PASS 表示阶段 3 的全部技术门槛具备收口条件，仍等待独立审核任务最终裁决，不在本批自行宣布阶段 3 完成。

## 基线、Freeze 与累计门禁

- 产品 HEAD：`dd23af38757cc2671162d05971a6878c4a82790d`
- tree：`c44bb240ffe193bad1c7ef03db41a5c252f67cf1`
- parent：`9d1abc46d9061819ffed2ffe281cd5458c5148e5`
- message：`feat(sync): render real project freshness`
- 初始工作区：clean
- `origin/staging` 初始：`a3fae4d623a278dcd12fdbf4a24491f4d3f961ad`
- Phase 9.2.18 Freeze SHA-256：`81316546282e94ce4003c3e608f2e1dcf0bb73d8998596fc738a424775693215`
- Phase 9.2.18 evidence SHA-256：`31c5bae77bfd0fa2cddb07de4365add8a86a99e3f50962cb01d9eade7907e603`
- 本批 Freeze：`tests/fixtures/synchronization/stage3-phase9-2-19-final-freshness-smoke-freeze.json`
- 本批 Freeze SHA-256：`6242bf582383a3711d7dbde3371b60a2239c905e3d3cd3471a1eac2c407a111b`
- Freeze 创建后未回写。

产品 commit 未变，本批按合同累计复用 Phase 9.2.18 的 1043/1043 unit、65/65 application integration（required skip 0）、570/570 pgTAP、lint/typecheck/db lint/types/drift/module boundaries、2/2 production E2E；未重复运行本地全量门禁。

## 隔离资源预检

- GitHub CLI 账号：`hehehehehehecai`，固定私有测试仓库 `hehehehehehecai/explorer-staging-private-test-20260804`，repository node ID `R_kgDOTtTOAw`、database ID `1322569219`。
- staging GitHub App：`executor-staging-hehehehehecai`，App ID `4480141`；设置页只读证明 Webhook Active、SSL verification 开启；本批没有保存 URL、secret、private key 或 callback 值。
- installation ID：`151329457`，沿用前序已冻结的 selected-only 唯一仓库范围；本批没有修改或重新安装。
- Supabase：`executor-command-center-staging`，ref `gsnuorsqdcdszjxtymhs`，状态 `ACTIVE_HEALTHY`，migration ledger 16/16。
- Vercel：team `team_IDGruFjuEZmy1dJRsg0RYkKf`、project `prj_vRfWcuvLYn240SSuKyNH0g4ShpW8`，Hobby Preview/staging。
- Inngest：固定 environment `staging-7050a935`；本批未修改函数、配置或事件。

Vercel 和 Inngest Dashboard 的隔离 Chrome 会话在预检时已过期；Vercel connector 和既有部署元数据足以闭合部署门禁，Inngest 不属于本批业务写入或状态变化范围。Supabase、GitHub 与应用 OAuth 的既有登录态可用。

## 部署绑定

- 唯一 Push：`git push origin dd23af38757cc2671162d05971a6878c4a82790d:refs/heads/staging`
- 结果：普通 fast-forward `a3fae4d...dd23af3`，无 force。
- 远端回读：`refs/heads/staging=dd23af38757cc2671162d05971a6878c4a82790d`。
- Vercel deployment ID：`dpl_4hdm9r5F58PTQKcvkTmtwXyNhvsW`
- deployment URL：`https://executor-command-center-ik7pwb2d0-hehehehehehecais-projects.vercel.app`
- stable alias：`https://executor-command-center-git-staging-hehehehehehecais-projects.vercel.app`
- 状态：`READY`
- target：Preview（API `target=null`），非 Production。
- branch：`staging`
- commit：`dd23af38757cc2671162d05971a6878c4a82790d`
- message：`feat(sync): render real project freshness`
- 费用：Hobby/现有套餐内，未出现付费或 Trial。

## 数据库权威事实

所有数据库查询均为 `BEGIN TRANSACTION READ ONLY` 并以 `ROLLBACK` 结束；写入 0。首个查询使用了不存在的 `projects.github_installation_id`，被 PostgreSQL 在执行前以 `42703` 拒绝，无副作用；读取实际列定义后使用最小正确查询完成取证。

固定 Project `81630aa3-a101-421c-b31e-dc16d1592c31` 在证据时点的安全事实：

- Project status：`in_planning`
- latest SyncRun：`6af8854d-a309-4d40-b065-d37eae655e37`
- latest status：`completed`
- latest error code：`null`
- latest finished UTC：`2026-08-12 12:49:22`
- last successful UTC：`2026-08-12 12:49:22`
- active run count：`0`
- 按 `freshness-status.v1` 与 evidence time 推导：`fresh`

## 真实 UI 对照

### 已认证固定 Project

稳定 alias 的既有 staging OAuth 流程利用已登录 GitHub 会话自动完成，无人工身份动作。页面安全读数：

- HTTP/route：200，`x-matched-path=/project-galaxy`，非 404；
- 页面 title：`EXECUTOR — Command Your Projects`；主体：`Project Galaxy`；
- `data-freshness-status=fresh`，与数据库推导 `fresh` 一致；
- provenance：`真实项目数据`；
- 未出现“演示数据”“完全虚构”或“固定时钟演示”；
- 最后成功同步：`2026-08-12 12:49:22 UTC`，与数据库一致；
- 最新 SyncRun：`completed · 6af8854d…`，状态一致，仅显示 8 位安全前缀；
- 完整 SyncRun ID 未出现在页面；
- 当前错误为 null，页面未显示错误码、原始错误或 provider detail；
- 页面不含 token、Cookie、Authorization、service role、provider payload、repository 私密字段或其他用户 Project 数据。

### 未认证边界

通过不携带应用会话的 Vercel 只读 fetch 访问同一路径：HTTP 200，仅显示“需要登录”“登录后可查看你的真实项目 Freshness”和 GitHub 登录入口；未显示 Freshness、时间、run ID 或 Project 状态。主 OAuth 会话未注销。

### 不存在/无权 Project

在已认证主会话中访问固定不存在 UUID `00000000-0000-4000-8000-000000000019`，页面仅显示“没有可显示的项目”；未泄漏 Project 是否存在、owner、repository、SyncRun 或数据库错误。该状态与跨用户不可见时共用非枚举边界。

## 范围、安全与副作用

- 本批本地允许文件仅 Freeze 与本 evidence；产品代码变化 0。
- `git diff --check`：通过。
- 强特征 token/private key/JWT/Cookie/Authorization/service-role/provider secret/raw payload：0 命中。
- GitHub 测试仓库 Issue/PR/Release/Workflow/commit 写入：0。
- GitHub App 配置写入：0。
- Manual Resync、redelivery、webhook 漏投：0。
- Supabase 写入、migration、DDL、RPC mutation：0。
- Inngest event/function/config 写入：0。
- Production/Promotion/Merge/main/master/force push：0。
- 远端副作用仅有：应用现有 `staging` 分支 fast-forward 1；由此自动产生 Hobby Preview 1。
- 临时 CDP 读取脚本位于系统 Temp，不进入仓库，结束前删除。

## Git 策略

本批最终只将 Freeze 与 evidence 形成一个本地证据 commit，不 Push；`origin/staging` 保持产品 commit `dd23af38757cc2671162d05971a6878c4a82790d`。最终 commit/tree/parent/message 与工作区状态由执行报告记录。
