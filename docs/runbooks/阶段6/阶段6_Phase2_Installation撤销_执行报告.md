# 探索者号｜阶段 6｜Phase 2 Installation 撤销｜执行报告

## 1. 编排、授权与结论

- 批次 ID：`explorer-stage6-phase2-549147eec50c9288`
- 提示词实例 ID：`explorer-stage6-phase2-b113a9781f6a6f80`
- 审核票据 ID：`review-ticket-b113a9781f6a6f80`
- 授权策略：`workflow-authorization.v1`
- 授权仓库：`D:\AI workplace\探索者号`
- baseline commit：`3f607a5f72f7d9aca79e471f4592573e0e18123f`
- 授权回读：只执行本批本地可逆代码、forward-only migration、合成测试、构建、报告和一个本地 commit；未授权 push、merge、PR、部署、发布、Production、真实数据、外部账号/密钥、不可逆删除或 Phase 3–10。
- 结论：**Phase 2 完成**。可信 `installation.deleted` 已形成单向、幂等、失败关闭的撤销生命周期；未进入 Phase 3。

## 2. 基线与 Pre-Run Freeze

- baseline HEAD：`3f607a5f72f7d9aca79e471f4592573e0e18123f`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:/AI workplace/探索者号/.git`
- linked worktree：`false`
- baseline `git status --porcelain=v1 -uall | Out-String` UTF-8 SHA-256：`4c87c8cdc9209bdb9eba0ce0fbe943f74aa6dc7b67374925e57ba39480e046b0`
- baseline status 字符数：`346467`；行数：`1935`
- baseline 非 `.pnpm-store/` 差异：`0`
- `.pnpm-store/` 为阶段开始前未跟踪缓存噪声；本批未读取后写回、删除、整理、暂存或提交。
- 版本化冻结：`docs/runbooks/阶段6/阶段6_Phase2_Installation撤销_Pre-Run_Freeze.md`
- migration 首次红灯前为空文件，SHA-256：`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`
- pgTAP 首次执行前 SHA-256：`57AF4294986F423BE28FA48CBB013217E46561A44B7C0CF8F1BDCF2C0DE06DEB`
- 最终 migration SHA-256：`F738A422903ABDDFC51C6877827C82B7A6EE334AD5838285CB083445ADBED680`
- 最终 pgTAP SHA-256：`5182736132D02D3BBE3D7B4AEE0461A4F052219C504DE4BB09204F125643181A`
- Freeze correction：首次红灯后只修正 `varchar/text` 测试类型对齐；另补齐提示词明确要求但初始冻结漏列的 late `active` 独立 delivery 和新 Brief reservation case。原始红灯哈希、稳定身份和失败证据均保留。

## 3. 开始前只读审计

### 3.1 可信事件控制流

1. `/api/github/webhook` 在 JSON 解析和数据库访问前完成 body 大小、必需 header、HMAC 与 delivery replay 校验。
2. 验签通过的 `installation.deleted` 映射为 `revoked`，先注册 `github_webhook_deliveries`，再由 service-role 调用 `complete_github_webhook_installation`。
3. 基线函数能写入 `github_installations.status='revoked'`，普通新 Webhook 注册也会因 installation 非 active 而被抑制。
4. 基线缺口：不同 delivery 的重复撤销会移动 `revoked_at`；同一事务不取消已有 queued Sync、pending dispatch、pending/processing Webhook、reserved Energy 或 pending AI invocation。
5. 基线的 late `suspend`/`unsuspend` 已有部分单向保护，但缺少与取消副作用绑定的完整幂等证明。

### 3.2 Sync 授权矩阵

| 入口/边界 | 基线 | 本批最终状态 |
|---|---|---|
| First Sync 创建 | 未检查 installation | `create_sync_run` 在插入前区分 revoked/suspended 并失败关闭 |
| Manual/Webhook/Reconciliation 请求 | 请求 RPC 已检查 | 保留检查，并在 dispatch claim 再次要求 active |
| queued project dispatch | 撤销后仍 pending | 撤销事务原子置为 `cancelled/authorization_revoked` |
| running/partial Sync | worker 起点检查一次 | 撤销事务终止；外部读取前及阶段性持久化前再次读取授权 |
| GitHub snapshot 持久化 | 无数据库末端门 | 六类 GitHub snapshot 表在 insert/update 时要求 installation active |
| 晚到结果 | 可能继续落库 | application 复核 + DB trigger 双层拒绝 |

### 3.3 AI / Energy 授权矩阵

| 入口/边界 | 基线 | 本批最终状态 |
|---|---|---|
| Evidence 构建 | 已检查授权 | 保留 |
| Brief reserve | 无 installation 门 | application 前置复核 + DB reservation trigger |
| Provider 调用前 | 无统一复核 | 统一 authorization gate |
| Provider 返回后持久化前 | 无统一复核 | 再次复核；最终事务的 completed invocation insert 受 DB trigger 保护 |
| reserved Energy | 撤销后保留 reserved | 撤销事务 release，并只写一条幂等 refund ledger |
| pending invocation/brief | 撤销后保留 pending | 置为 `failed/authorization/project_brief_authorization_failed` |
| Follow-up | 生产入口为明确 unavailable stub | 当前不会 reserve/provider；保持不扩张，指标为 N/A |
| Daily grant | 账户级 grant 与 installation 无关 | 保留；新项目级 reservation 仍受 active 门约束 |

### 3.4 UI 审计

- 展示组件基线已有 `Authorization revoked` 与“数据可能过期”文案。
- 基线 Connected reader 只从最近 SyncRun 的 error code 推断 revoked；没有新失败 run 时会误显 fresh。
- 最终 reader 直接读取所属 installation 状态；历史活动保留，同时显示 revoked/stale。
- Project Galaxy 的 Preview fixture 改为仅在 `mode=preview` 动态加载，真实 Connected 页面不再静态引用 demo fixture。
- 必需 E2E 暴露 `/copilot` 在 Connected 依赖创建失败时抛 500；已最小修复为既有 `Connected 数据暂时不可用。` 失败关闭合同，未引入 Preview fallback。

## 4. TDD 红灯证据

### 4.1 数据库红灯

- 新增 `0034_installation_revocation_lifecycle_test.sql` 后第一次运行失败：queued Sync 仍为 `queued`，且 `project_sync_dispatches.safe_error_code` 不存在。
- 证明缺口：基线只撤销 installation，没有原子终止关联未执行工作。
- 未通过删除断言、放宽安全场景或修改旧 migration 获得绿色。

### 4.2 Sync application 红灯

- 聚焦测试初次结果：4 个失败。
- 失败 case：revoked/suspended First Sync 仍可创建；First Sync 与通用 Project Sync 在 GitHub 读取后撤销仍会持久化晚到结果。
- 预期稳定错误：`first_sync_authorization_revoked` / `github_activity_authorization_revoked`；实际为继续执行。

### 4.3 Brief application 红灯

- 聚焦测试初次结果：2 个失败。
- 失败 case：reserve 后、provider 前撤销仍调用 provider；provider 返回后、finalize 前撤销仍持久化。
- 预期稳定错误：`project_brief_authorization_failed`；实际为继续执行。

## 5. 实现与修改文件

### 5.1 forward-only migration

- `supabase/migrations/20260825033542_installation_revocation_lifecycle.sql`
  - 保持既有 `github_installations.status` 模型，不建立第二套状态机。
  - `complete_github_webhook_installation` 只在首次非 revoked → revoked 时执行取消/释放副作用，并保留首次 `revoked_at`。
  - late active/suspended 不能恢复 revoked。
  - queued Sync、pending/dispatching project dispatch、普通 pending/processing Webhook、pending Brief/Invocation 和 reserved Energy 在同一撤销事务终止。
  - `project_sync_dispatches` 新增 `cancelled_at`、`safe_error_code` 与严格状态约束。
  - `create_sync_run`、`claim_project_sync_dispatch` 和 GitHub/AI/energy 持久化边界失败关闭。
  - 所有新函数固定空 `search_path`；内部 trigger function 撤销所有可执行权限；公开 RPC 仅授予 service-role。

### 5.2 application / infrastructure / UI

- `src/application/synchronization/first-sync-use-cases.ts`
- `src/application/synchronization/first-sync-use-cases.test.ts`
- `src/application/synchronization/project-sync-use-cases.ts`
- `src/application/synchronization/project-sync-use-cases.test.ts`
- `src/infrastructure/synchronization/supabase-sync-run-repository.ts`
- `src/application/project-brief/generate-project-brief.ts`
- `src/application/project-brief/generate-project-brief.test.ts`
- `src/infrastructure/project-brief/supabase-project-brief-authorization-gate.ts`
- `src/infrastructure/project-brief/supabase-project-brief-authorization-gate.test.ts`
- `src/app/api/projects/[projectId]/briefs/generate/project-brief-generation-route-dependencies.ts`
- `src/infrastructure/ai-usage/supabase-energy-reservation-client.ts`
- `src/infrastructure/ai-usage/supabase-energy-reservation-client.test.ts`
- `src/infrastructure/synchronization/supabase-project-freshness-reader.ts`
- `src/infrastructure/synchronization/supabase-project-freshness-reader.test.ts`
- `src/app/project-galaxy/page.tsx`
- `src/app/project-galaxy/project-galaxy-preview-source.ts`
- `src/app/copilot/page.tsx`
- `src/testing/connected-panels/connected-panel-fixture.ts`
- `tests/e2e-connected-panels/connected-panels.spec.ts`
- `src/infrastructure/database/database.types.ts`

### 5.3 测试与证据

- `supabase/tests/0034_installation_revocation_lifecycle_test.sql`
- `docs/runbooks/阶段6/阶段6_Phase2_Installation撤销_Pre-Run_Freeze.md`
- `docs/runbooks/阶段6/阶段6_Phase2_Installation撤销_执行报告.md`
- 未修改任何既有 migration。

## 6. 最终撤销合同

```text
active|suspended --trusted installation.deleted--> revoked
revoked --replay/out-of-order active|suspended--> revoked
revoked + new Sync --> sync_run_authorization_revoked / authorization_revoked
revoked + new Brief reservation/provider --> project_brief_authorization_failed
revoked + queued/pending work --> cancelled/ignored/failed terminal state
revoked + started work at next authorization gate --> no-op/fail-closed
revoked + late GitHub/AI result --> no new derived persistence
revoked + historical project data --> retained + authorization invalid + freshness stale
```

- 撤销权威入口仍是验签通过的 GitHub `installation.deleted`；客户端不能提交 installation 状态。
- 不自动恢复 revoked；重新安装/重新授权不在本批。
- 稳定原因复用：`authorization_revoked`、`github_activity_authorization_revoked`、`project_brief_authorization_failed`、`sync_run_authorization_revoked`。

## 7. Lineage、Case 身份与结果

| delivery / request | installation | project | task / operation | revoke timestamp | 结果 |
|---|---:|---|---|---|---|
| `f249...0001` | `f241...0001` / `824001` | `f243...0001` | run `f244...0001`; dispatch `f245...0001`; reservation `f246...0001`; invocation `f247...0001` | `2026-08-25T01:04:01Z` | 首次转换 1；任务取消/失败；reservation 释放 |
| `f248...0001` | `824001` | `f243...0001` | ordinary Webhook | 同上 | pending → ignored，dispatcher 0 |
| `f249...0002` | `824001` | `f243...0001` | 不同 delivery 重复 delete | `2026-08-25T01:06:01Z` | revoked_at 不变；重复副作用 0 |
| `f249...0003` | `824001` | `f243...0001` | late suspend | `2026-08-25T01:07:01Z` | 仍 revoked |
| `f249...0004` | `824001` | `f243...0001` | late active | `2026-08-25T01:08:01Z` | 仍 revoked |
| `phase2:new-first-sync` | `824001` | `f243...0001` | First Sync | 撤销后 | 插入前拒绝 |
| `phase2:new-manual` | `824001` | `f243...0001` | Manual Sync | 撤销后 | dispatch 前拒绝 |
| `phase2:new-brief` | `824001` | `f243...0001` | Energy reservation | 撤销后 | reservation 前拒绝 |
| control fixtures | `f251...0002` / `825002` | `f253...0002` | run/dispatch/reservation/invocation | N/A | 全部不变 |

所有测试身份为本地合成 UUID、GitHub 数字 ID 和 `.test` 邮箱；未使用真实数据、真实 GitHub 或真实 AI provider。

## 8. 分母与 Target-Specific Metrics

| 指标 | 分母 / eligible | 实际结果 |
|---|---:|---:|
| Installation 非 revoked → revoked | 1 | 转换 1 |
| replay / late suspended / late active | 3 | 状态恢复 0；重复副作用 0 |
| queued Sync | 1 | cancelled 1；残留 0 |
| pending project dispatch | 1 | cancelled 1；残留 0 |
| pending ordinary Webhook | 1 | ignored 1；残留 0 |
| pgTAP started Sync | 0 | N/A；application 独立 late-revoke case 2/2 fail-closed |
| reserved Energy | 1 | released 1；refund ledger 1 |
| pending/running AI invocation | 1 | failed 1 |
| 撤销后新 Sync 请求 | 2 | 阻止 2 |
| 撤销后新 Brief reservation | 1 | 阻止 1；持久 reservation 0 |
| provider 前撤销 | 1 | provider call 0 |
| provider 后、持久化前撤销 | 1 | 不合规持久化 0 |
| 撤销后 GitHub read | 新请求 2 + late-result cases 2 | 新外部读取 0；late result 持久化 0 |
| 控制 installation/project/run/dispatch/reservation/invocation | 6 | 变化 0 |
| target Energy ledger delta | 初始 grant 10、reserve -3 | release +3，最终 10；非授权消耗 0 |
| control Energy ledger delta | 7 | 最终 7；变化 0 |
| UI revoked/stale | reader 单测 + Connected E2E | 全部通过；历史活动仍可见 |
| Follow-up 生产 provider | 0 | N/A；入口仍为明确 unavailable stub |

目标结果全部达到：重复副作用 0、撤销后新外部调用 0、不合规持久化 0、目标 queued/pending 残留 0、控制组变化 0、Energy 非授权消耗 0。

## 9. 测试、质量门与失败记录

### 9.1 最终通过

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm typecheck` | 0 | 通过 |
| `pnpm lint` | 0 | 通过，0 warning |
| `pnpm test` | 0 | 171 files / 1668 tests；最终修复后完整复跑 171/1668 |
| `pnpm test:integration` | 0 | application 19 files / 65 tests；DB 34 files / 828 tests |
| `pnpm test:e2e:installation-fixture` | 0 | 1/1 |
| `pnpm test:e2e:connected-panels` | 0 | 8/8，含 revoked/stale 与 fail-closed |
| `pnpm db:reset` | 0 | 从零应用全部 migration，含 `20260825033542` |
| `pnpm db:test` | 0 | 34 files / 828 tests；含 `0015`、同步/Brief 聚焦和新增 `0034` |
| `pnpm db:lint` | 0 | `results=[]` |
| `pnpm db:types` | 0 | 类型已生成 |
| `pnpm db:types:check` | 0 | up to date |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm build` | 0 | Next.js production build 通过 |
| `git diff --check` | 0 | 无 whitespace error |

### 9.2 聚焦验证

- 新增 `0034`：27 项通过。
- DB 回归聚焦 `0014–0018`、`0023`、`0027`、`0034`：8 files / 246 tests 通过。
- Sync / Brief / freshness / UI TS 聚焦：12 files / 139 tests 通过；扩展聚焦曾为 8 files / 100 tests 通过。
- Phase 1 原有 repository removal DB 测试 `0030–0033` 也在完整 DB 门中通过。

### 9.3 失败与处置记录

1. 首次完整 `pnpm test:integration`：exit 1；application 65/65 通过，DB `0012_github_activity_snapshots_test.sql` 6 项失败。原因是新 snapshot trigger 在未知 project 时抢先返回授权错误，掩盖既有 FK `23503`；修复为“project 存在且 installation 非 active 时才返回撤权错误”，未知 project 继续由 FK 处理。重置后 828/828 通过，无部分写入。
2. 指定两个 pgTAP 文件的 Supabase CLI 命令首次被系统拒绝，因为缺少显式 `--local`；改为明确 `--local` 后，CLI 又因 Windows 含空格/中文工作路径解析为 `NOTESTS`（exit 1）。没有把它记录为测试失败或通过；改用仓库的 `pnpm db:test` 本地脚本，34/34、828/828 通过。
3. 首次组合 E2E：Installation 1/1 通过，Connected 7/8；既有无授权 fixture case 在 `/copilot` 因 `auth_configuration_missing` 抛 500。修复依赖创建阶段失败关闭后 Connected 8/8 通过，无 Preview fallback。
4. 单独聚焦页面测试的 `pnpm exec vitest` 因本机 fallback PATH 未解析 `vitest` 而 exit 1；改用仓库 `pnpm test` 脚本，实际完整执行 171/1668 通过。
5. 所有 Docker/Supabase/浏览器命令均按系统审批以本地精确范围执行；无审批规避。

## 10. 安全与范围复核

- 只有验签通过、注册并成功 claim/complete 的 installation Webhook 能触发撤销。
- revoked 单向、幂等、抗 replay 与乱序；未增加客户端可写状态入口。
- DB 函数固定 `search_path` 且最小授权；RLS、service-role、防枚举和跨租户隔离未放宽。
- 其他 user/installation/project/task 变化 0；账户级 Energy 守恒。
- 历史项目、GitHub snapshot、归档、Decision Record 未删除。
- 未修改既有 migration；仅新增一条 forward-only migration。
- 未安装或升级依赖。
- 未触碰、整理、删除、暂存或提交 `.pnpm-store/`。
- 未 push、merge、创建 PR、部署、发布、访问 Production 或使用真实数据/密钥。
- 未进入 Phase 3–10。

## 11. Git 提交与最终状态

- 本批仅创建一个本地 commit，建议/实际消息：`feat: revoke GitHub installations safely`。
- 精确 commit hash：本报告与全部实现由同一个提交原子承载；由于 Git commit hash 包含本报告自身内容，无法在提交前将其自引用写入同一提交。提交完成后的精确 hash 在最终任务回执中给出，并以只读 `git rev-parse HEAD` 绑定本报告。
- 预期提交后 tracked 工作区为空；唯一未纳入项为阶段前 `.pnpm-store/`。精确最终 status、字符数与 SHA-256 同样在提交后最终任务回执中给出。

## 12. 最终判定

Phase 2 的核心 Exit Criteria 全部满足：可信撤销原子且幂等；queued/pending 工作真实终止；started 工作在关键门失败关闭；新 Sync/AI 在 dispatch/reservation/provider 前拒绝；晚到结果不落库；Energy 无非授权消耗；UI 保留历史数据并显示 revoked/stale；跨租户控制组零变化；全部必需质量门通过；形成单一可审查本地提交。

**Phase 2 完成；未进入 Phase 3。**

<!-- EXECUTION_REPORT_COMPLETE -->
