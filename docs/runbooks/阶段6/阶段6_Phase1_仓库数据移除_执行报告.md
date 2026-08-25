# 探索者号｜阶段 6｜Phase 1 仓库数据移除执行报告

## 1. 编排与授权回读

- 启动 ID：`explorer-stage6-6f15e9ac1282cdd4`
- 批次 ID：`explorer-stage6-phase1-bootstrap-e4abc85942c526ac`
- 提示词实例 ID：`explorer-stage6-phase1-bootstrap-0530a43a621ba672`
- 执行单元：`Phase 1｜仓库移除`
- 授权信封：`workflow-authorization.v1`
- 仓库：`D:\AI workplace\探索者号`
- 回读结论：只执行当前 Phase 1 的本地工程修改、migration、合成数据测试、构建与单一 Git commit；未授权也未执行 push、merge、部署、发布、Production 操作、真实删除或 Phase 2–10。

## 2. 基线与 pre-run freeze

- 基线 HEAD：`e0639b5847ec61f4816425374abcf9df956310be`
- 基线状态 SHA-256：`472f554325ed3ede223b15fa6f03ca9e2093b761fd83b259feeb880b93e0e757`
- 基线状态字符数：`332061`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:\AI workplace\探索者号\.git`
- linked worktree：`false`
- freeze：`tests/fixtures/repository-removal/stage6-phase1-pre-run-freeze.json`
- `.pnpm-store/`：阶段前已有未跟踪缓存噪声，freeze 记录 1863 条 porcelain 项；整个批次未显式读取、删除、整理、暂存或提交该目录。Git 在枚举其递归异常路径时持续给出缺失目录/路径过长警告，因此最终枚举数不作为业务差异依据。

## 3. 现实扫描与处置矩阵

扫描覆盖既有 migrations 中的外键、RLS、触发器、RPC、同步/AI 状态、application ports、Supabase adapters、HTTP routes 与 Project Galaxy UI。未发现持久化的“用户确认归档”“项目状态历史”或 Decision Record 表，因此这三类在本仓库当前 schema 中记为 `NOT_APPLICABLE`，未臆造新表或改变产品语义。

| 数据类别 | `REMOVE_REPOSITORY_DATA` | `DELETE_PROJECT_SUBTREE` | 处置依据 |
| --- | --- | --- | --- |
| `users`、`github_identities` | PRESERVE | PRESERVE | 账户级身份 |
| `github_installations`、installation states | PRESERVE | PRESERVE | Phase 2 边界 |
| `selected_repositories` | PRESERVE | PRESERVE | 最小接入身份；重连是独立动作 |
| `projects` | PRESERVE（置 `removed`） | DELETE | 项目生命周期根 |
| GitHub snapshot/commit/issue/PR/release/workflow/document | DELETE | DELETE | 仓库与文档派生数据 |
| `sync_runs`、`project_sync_dispatches` | DELETE | DELETE | 同步执行数据 |
| project-bound webhook deliveries | INVALIDATE/DETACH | INVALIDATE/DETACH | 晚到回调不得恢复写入 |
| `project_briefs`、`ai_invocations` | DELETE | DELETE | AI 内容、缓存和执行事实 |
| `energy_reservations` | DELETE（先释放） | DELETE（先释放） | 项目专属预约 |
| `energy_ledger_entries` | PRESERVE + DETACH | PRESERVE + DETACH | 不可变账户账本，解除项目/预约/调用引用 |
| Evidence Link | `SOURCE_REMOVED` | NOT_APPLICABLE（项目整体删除） | 保留来源标识、指纹、原因、时间与 operation |
| `repository_removal_operations` | PRESERVE | PRESERVE | 最小幂等墓碑与审计计数 |

完整逐表矩阵、保留矩阵、失效矩阵与禁止触碰项见 pre-run freeze。迁移未修改任何既有 migration，采用 `20260824180000_add_repository_removal_lifecycle.sql` forward-only 迁移。

## 4. 最终领域、API 与 UI 合同

### 4.1 唯一用例入口

`RepositoryRemovalUseCase` 只从已验证 session 取得 `actorUserId`，接收 `projectId`、枚举 `mode`、`idempotencyKey` 和绑定项目的确认载荷。HTTP/UI 不拼装多表删除。

- `REMOVE_REPOSITORY_DATA` 确认文本：`REMOVE <projectId>`
- `DELETE_PROJECT_SUBTREE` 确认文本：`DELETE <projectId>`
- 请求必须为严格 JSON，最大 8192 UTF-8 字节；route 参数、body 项目标识和确认项目必须一致。
- 成功结果包含 `operationId`、`projectId`、`mode`、`status`、`outcome`、删除/保留/失效计数、`safelyRetryable`、`completedAt`。
- 稳定错误码：确认不匹配、无权/不存在、操作冲突、前置条件失败、可重试任务冲突、存储失败。
- 无权与不存在统一为 `404` 防枚举语义；客户端不能提交 actor、表名、过滤器或 SQL。

### 4.2 数据库事务和并发

- RPC：`public.execute_repository_removal(uuid, uuid, text, text, uuid, text)`，仅授予 `service_role`，`SECURITY DEFINER` 固定空 `search_path` 并在事务内复核 actor 所有权。
- 先取得幂等键和项目 advisory transaction locks，再锁项目行；同项目只允许一个 `executing` operation。
- 请求指纹绑定 actor、项目、模式和确认载荷；同键同参重放原结果，同键异参失败关闭。
- 项目状态/version 写栅栏阻止移除开始后的同步与 AI 派生写入；旧项目不存在仍由原 FK 返回 `23503`，已进入移除状态的项目返回稳定拒绝。
- 可重试失败恢复、同键并发双击、不同模式竞争、失败事务回滚和晚到写入均有数据库行为测试。
- 审计只存 operation 元数据、稳定错误和计数，不复制源码、文档正文、AI prompt/response、token 或凭据。

### 4.3 UI

Project Galaxy connected 模式提供两个语义独立的危险操作。两者都要求二次确认；整项目删除使用更强的 `DELETE <projectId>` 文本。取消关闭零请求，进行中不提前显示成功，失败时可用同一幂等键安全重试。仓库数据移除完成后明确显示 Evidence Link 已因 `SOURCE_REMOVED` 失效；界面未承诺撤销 GitHub App 或删除账户。

## 5. 修改文件与 migration 清单

### 5.1 领域、应用和基础设施

- `src/domain/repository-removal/repository-removal.ts`
- `src/domain/repository-removal/repository-removal.test.ts`
- `src/application/repository-removal/repository-removal-use-case.ts`
- `src/application/repository-removal/repository-removal-use-case.test.ts`
- `src/infrastructure/repository-removal/supabase-repository-removal-repository.ts`
- `src/infrastructure/repository-removal/supabase-repository-removal-repository.test.ts`
- `src/infrastructure/repository-removal/repository-removal-http.ts`
- `src/infrastructure/repository-removal/repository-removal-http.test.ts`
- `src/infrastructure/database/database.types.ts`
- `src/infrastructure/project-calibration/supabase-project-calibration-storage.ts`
- `src/infrastructure/project-calibration/supabase-project-calibration-storage.test.ts`

### 5.2 HTTP 与 UI

- `src/app/api/projects/[projectId]/repository-removal/repository-removal-route-dependencies.ts`
- `src/app/api/projects/[projectId]/repository-removal/route.ts`
- `src/app/api/projects/[projectId]/repository-removal/route.test.ts`
- `src/features/project-galaxy/RepositoryRemovalPanel.tsx`
- `src/features/project-galaxy/RepositoryRemovalPanel.test.tsx`
- `src/features/project-galaxy/repository-removal.module.css`
- `src/features/project-galaxy/index.ts`
- `src/app/project-galaxy/page.tsx`
- `tests/e2e-connected-panels/connected-panels.spec.ts`

### 5.3 数据库、夹具与报告

- `supabase/migrations/20260824180000_add_repository_removal_lifecycle.sql`
- `supabase/tests/0030_repository_removal_lifecycle_test.sql`
- `supabase/tests/0031_repository_removal_concurrency_test.sql`
- `supabase/tests/0008_project_calibration_test.sql`
- `supabase/tests/0019_ai_usage_brief_schema_test.sql`
- `tests/fixtures/repository-removal/stage6-phase1-pre-run-freeze.json`
- `docs/runbooks/阶段6/阶段6_Phase1_仓库数据移除_执行报告.md`

## 6. 合成夹具处置指标

分母只统计 0030/0031 合成夹具中实际存在且符合处置条件的行；零样本类别明确为 `N/A`。

| 指标 | `REMOVE_REPOSITORY_DATA` | `DELETE_PROJECT_SUBTREE` |
| --- | ---: | ---: |
| 应删项目专属行 | 5（commit、document、sync、brief、reservation 各 1） | 6（前述 5 类 + project 1） |
| 实际删除 / 残留 | 5 / 0 | 6 / 0 |
| 应保留核心行 | project 1、selection 1、installation 1、operation 1、ledger 2 | selection 1、installation 1、operation 1、ledger 2 |
| 实际保留 / 误删 | 6 / 0 | 5 / 0 |
| 应失效 Evidence Link | 1 | N/A（项目子树整体删除） |
| 实际失效 / 错误有效 | 1 / 0 | N/A |
| 账户账本 delta 变化 | 0 | 0 |
| 其他 GitHub/AI 子表 | N/A（分母 0） | N/A（分母 0） |

- 跨用户控制：另一用户 2 个项目及其控制 commit 行变化 `0`；目标用户非目标/回滚项目变化 `0`。
- 幂等并发：同键请求 2 次，实际执行 1 次、重放 1 次、operation ID 1 个、重复副作用 0。
- 模式竞争：2 次并发尝试，完成 1、稳定冲突 1、重复处置 0。
- 失败回滚：注入 1 次删除失败，项目栅栏与业务行部分变化 0；同 operation 重试 1 次后完成。
- 晚到派生写入：尝试 1 次，成功写入 0。
- 可重试操作被另一 executing operation 占用：稳定冲突 1，原失败墓碑保留 1，重复副作用 0。

目标集合处置覆盖率为 100%；误删、错误有效 Evidence Link、跨边界变化、重复副作用和移除开始后的晚到派生写入均为 0。

## 7. 测试与质量门

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | PASS |
| `pnpm lint` | 0 | PASS，0 warning |
| `pnpm test` | 0 | PASS，170 files / 1656 tests |
| `pnpm db:reset` | 0 | PASS，全部 migration 与 seed 在本地重建 |
| `pnpm db:test` | 0 | PASS，31 files / 779 tests |
| `pnpm db:lint` | 0 | PASS，`results: []` |
| `pnpm db:types` | 0 | PASS，重新生成已提交类型 |
| `pnpm db:types:check` | 0 | PASS，types up to date |
| `pnpm db:drift:check` | 0 | PASS，schema drift empty |
| `pnpm build` | 0 | PASS，Next.js production build，新增 route 已收录 |
| 新增 domain/application/adapter/HTTP/route/UI + 校准兼容聚焦测试 | 0 | PASS，7 files / 44 tests |
| `0030_repository_removal_lifecycle_test.sql` | 0 | PASS，35 tests |
| `0031_repository_removal_concurrency_test.sql` | 0 | PASS，10 tests |
| project-calibration 本地 Supabase 聚焦集成 | 0 | PASS，2 tests |
| `pnpm test:e2e:connected-panels` | 1 | 7/8 PASS；本批新增 removal E2E PASS。失败为既有 Copilot 无授权夹具场景在本机缺少 Auth 配置时返回 500，与 removal API/UI 路径无共享实现 |
| 串行 `vitest --config vitest.integration.config.ts --maxWorkers=1` | 1 | 18/19 files、64/65 tests PASS；唯一失败是基线已存在的 `project-freshness-boundary` 断言，它扫描整个同时包含 Preview/Connected 的 page 并禁止基线本就存在的 `demo-data` import |

异常与处置记录：

1. 首次不带扩展权限运行 Supabase 命令时，CLI 因沙箱不能写 `C:\Users\admin\.supabase\telemetry.json.tmp...` 返回 EPERM；允许本地 CLI 状态写入后，所有必需数据库质量门均以退出码 0 复跑。
2. Docker Desktop 曾处于停止状态；仅在本机隐藏启动 Docker Desktop，随后本地数据库重置、测试、lint、types 和 drift 全部通过。未访问外部数据库。
3. migration 新增 `projects` 列后，既有校准 RPC 复合返回值使严格 Zod schema 失败；已先由集成测试复现，再为写响应加入三列的严格校验，聚焦集成 2/2 与完整单元测试均通过。
4. `pnpm test` 默认报告器长时间静默；先用 verbose 同等全套确认基线测试可完成，再让精确命令在最终源码上完整运行，最终为 170/1656、退出码 0。
5. 两个非必需全套中的剩余失败均可在基线源码上复现其触发条件，且本批新增 HTTP/UI/E2E、数据库隔离、构建与全部必需质量门均为绿色；未通过删除测试、放宽本批安全断言或跳过安全场景获得绿色结果。

## 8. 幂等、并发、回滚与隔离证据

- 0030 使用两用户、五项目合成拓扑验证所有权、防枚举、跨用户/跨项目不变、两模式矩阵、RLS、RESTRICT 账本处置、Evidence Link 失效和事务回滚。
- 0031 使用本地 `dblink` 发起真实并发事务，覆盖同键双击、不同模式竞争和失败重试与 executing operation 的竞争。
- 写栅栏触发器覆盖 GitHub snapshot、document、sync、brief、invocation、reservation 等项目派生表，事务锁保证晚到写入等待后拒绝而非穿透。
- 能量预约先生成补偿 release 事实，再由仅 postgres 拥有的受控路径执行单向 detach；账户余额 delta 不变，其他项目账本不变。
- operation tombstone 不外键回项目，因此项目删除后同幂等请求仍能重放完成结果；墓碑不含已承诺删除的内容。
- HTTP 测试覆盖 same-origin、严格 content type/body、8192 字节上限、route/body 项目绑定、伪造 actor 字段、错误码/状态码和安全日志。
- UI 测试覆盖取消零副作用、两种确认文本、请求中状态、成功后 Evidence Link 失效提示、失败保留同一幂等键重试。

## 9. 提交与最终仓库状态

- 提交策略：显式列出本报告第 5 节文件进行暂存；不使用 `git add .`，确保 `.pnpm-store/` 不进入 index。
- 本地 commit：`SELF`（本报告所在单一提交；Git commit hash 无法在不改变该 commit 自身的情况下嵌入自身内容，实际 SHA 由提交后执行回执绑定）。
- 最终 HEAD：`SELF`（提交后执行回执给出）。
- 提交后预期未纳入项：仅阶段前 `.pnpm-store/` 未跟踪噪声；提交后使用 `git diff --cached --name-only` 和 `git status --porcelain=v1 -uall` 复核。

## 10. 审批、未运行项与禁止动作声明

- 系统审批仅用于：Supabase CLI 本机状态文件、本地 Docker/Supabase 测试数据库、隐藏的本地 Next.js 服务器与 Playwright 浏览器。
- 未安装或更新依赖；Supabase CLI 的新版提示未执行升级。
- 未运行外部删除，未使用真实用户/仓库内容，未访问或修改 Production。
- 未修改既有 migration，未 reset/clean/改写历史，未删除用户文件。
- 未暂存、提交、删除或整理 `.pnpm-store/`。
- 未 push、merge、创建 PR、部署或发布。
- 未执行 GitHub App 撤销、账户删除或 Phase 2–10 工作。

## 11. 结论

Phase 1 的两个模式均已通过真实 application → Supabase infrastructure → HTTP → Project Galaxy UI 路径实现。必需质量门全部通过；两种模式的删除/保留/失效、所有权/RLS、防枚举、幂等、并发、回滚、晚到写入拒绝、Evidence Link 失效和跨边界不变均有合成数据证据。两个非必需全套中的基线/本机配置失败已逐项隔离，不影响本批验收结论。

结论：**Phase 1 完成；未进入 Phase 2。**

<!-- EXECUTION_REPORT_COMPLETE -->
