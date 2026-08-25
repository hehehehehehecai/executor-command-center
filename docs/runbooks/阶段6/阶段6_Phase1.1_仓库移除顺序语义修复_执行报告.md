# 探索者号｜阶段 6｜Phase 1.1 仓库移除顺序语义修复执行报告

## 1. 批次、授权与来源绑定

- 批次 ID：`explorer-stage6-phase1.1-aa1863d24d2e6560`
- 提示词实例 ID：`explorer-stage6-phase1.1-996e81659e0dff0b`
- 审核票据 ID：`review-ticket-996e81659e0dff0b`
- 原始审核等级：`B`
- blocker fingerprint：`aa1863d24d2e65600413af2164b8e34186fce51a8ce8f4746fc6f03f8981609b`
- 授权策略：`workflow-authorization.v1`
- 授权项目 / 大阶段：探索者号 / 阶段 6｜加固与发布
- 授权仓库：`D:\AI workplace\探索者号`
- 原始 Phase 1 commit：`666e11fd1b6b9384472c2fdba5bddfe4c813d4c2`
- 原始 migration：`supabase/migrations/20260824180000_add_repository_removal_lifecycle.sql`
- 修复 migration：`supabase/migrations/20260825024925_fix_repository_removal_sequence.sql`

授权回读结论：本次只实施 Phase 1.1 的顺序语义最小修复、独立合成数据库测试、冻结证据、完整质量门、执行报告和一个本地 commit。未获得且未执行 push、merge、PR、部署、发布、Production、真实数据、外部账号/密钥、依赖安装/升级或 Phase 2–10 工作。

保持不变的合同：

- `repository-removal.v1`
- `repository-removal-storage.v1`
- `repository-removal-http.v1`
- `repository-removal-failure.v1`
- `workflow-authorization.v1`

## 2. Baseline 与 Pre-Run Freeze

开始写入前只读审计结果：

| 项目 | 结果 |
| --- | --- |
| repository root | `D:/AI workplace/探索者号` |
| baseline HEAD | `666e11fd1b6b9384472c2fdba5bddfe4c813d4c2` |
| branch | `feature/stage4-bridge-five-panels` |
| origin | `ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git` |
| Git common directory | `D:/AI workplace/探索者号/.git` |
| worktree | 仅主工作树，非 linked worktree |
| status 精确命令 | `git status --porcelain=v1 -uall | Out-String` |
| status UTF-8 SHA-256 | `846114527e0ba7621b08257be1770b8eb91520646069790763d971d01f3764ab` |
| status 字符数 / 行数 | `343092` / `1920` |
| 非 `.pnpm-store/` 状态行 | `0` |

全部 1920 行均为阶段开始前的 `.pnpm-store/` 未跟踪缓存噪声。该目录在本批被明确排除；未读取业务内容、未删除、未整理、未修改、未暂存、未提交。Git 扫描其异常深路径时报告 filename-too-long / missing-directory warning，该 warning 不代表本批变更。

冻结夹具：

- `tests/fixtures/repository-removal/stage6-phase1.1-pre-run-freeze.json`
- baseline freeze SHA-256：`7943b893e32a59451eba7bbb5bf763542dcd627d062d812e1d50fa6fbb3fa8a2`
- 原始 migration SHA-256：`b836f7b980a353ce9f7dc6fd48d0f95cfc025fec7df62761cc48544deaadb6b3`
- 新 migration 空脚手架的 pre-implementation SHA-256：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- 首次红灯使用的 0032 SHA-256：`5123a5df2e742f3385dc8ba9f374cfa40b6d331f2681f986f09ae1fb48c0c1ca`
- 0033 初始及最终 SHA-256：`68a31f4ea280956a58efca95d08b562156388aceceedf3b9cedff568a9b984f0`

冻结文件包含两名顺序 case 用户、独立 installation / selection / project / operation UUID、两个幂等键、预期状态序列、并发 case UUID、处置分母和目标指标。所有内容均为本地合成数据。

## 3. 开始前只读审计

### 3.1 实际控制流与问题

Phase 1 函数的原控制流为：

1. 精确校验模式、项目 ID、确认文本和幂等键；
2. 用 `user_id + idempotency_key` 加事务 advisory lock；
3. 同键已有记录先核验 request fingerprint；异参稳定返回 `repository_removal_conflict`；
4. 新建 executing operation，并对项目加互斥约束与项目 advisory lock；
5. 核验项目所有权且采用防枚举 not-found；
6. 第 467–485 行只要发现同项目存在任意已完成的不同模式 operation，就把新 operation 永久标记为 `mode_conflict`；
7. 因此 `removed + DELETE_PROJECT_SUBTREE(new key)` 永久无法进入项目删除分支。

原控制流还会在 REMOVE 时创建 `evidence_reference_invalidations`。这些记录只外键到 operation，不外键到 project；若后续项目可删除而不显式清理，它们会继续保留 `source_id` / `source_version` 等仓库来源标识。

### 3.2 当前约束

- `projects.repository_data_state` 仅允许 `connected | removing | removed`；`removed` 必须有 `repository_removed_at`。
- `repository_removal_operations`：
  - `unique(user_id, idempotency_key)`；
  - `target_project_id where status='executing'` 只有一个 executing operation；
  - request fingerprint 绑定 actor、project、mode 与 confirmation；
  - operation 不外键回 project，因此项目删除后可用原 DELETE key 重放最小墓碑。
- `evidence_reference_invalidations`：
  - 以 `target_project_id + repository_removal_operation_id + reference_fingerprint` 对齐；
  - 只允许 `SOURCE_REMOVED`；
  - 对 operation 为 `ON DELETE RESTRICT`，对 project 无外键。
- RLS / 权限：两个审计表均强制 RLS；authenticated 仅可按 `auth.uid()` 读取自己的行；写入只经 postgres 所有、固定空 `search_path`、仅授予 service_role execute 的 `SECURITY DEFINER` RPC。

### 3.3 三种语义的区别

- 同键异参：在项目锁之前按 request fingerprint 失败关闭，保持永久稳定冲突。
- 真正并发不同模式：两个请求都在首个请求完成前发出；项目只允许一个执行者，另一请求保持稳定冲突。
- 顺序不同模式：REMOVE 已完成并提交，项目已是 `removed`；其后新发出的 DELETE 使用新键与 DELETE 强确认，应允许升级为整项目删除。

### 3.4 UI / API 可达性

当前 Project Galaxy 读取层只排除 `archived`，不会因 `repository_data_state='removed'` 隐藏项目；`RepositoryRemovalPanel` 在该项目页面仍提供 `DELETE_PROJECT_SUBTREE` 的独立强确认入口。HTTP route 与 application port 也未阻断该状态。因此无需改 UI/API，且本批未改 UI 结构、样式或公开合同。

本批最小文件清单最终为：

1. 新 forward-only migration；
2. 顺序升级独立 pgTAP；
3. 并发不同模式独立 pgTAP；
4. pre-run freeze JSON；
5. 本执行报告。

## 4. 红灯证据与 Failure Recording

首次新增顺序测试在旧 Phase 1 函数上执行：

`supabase test db --local supabase/tests/0032_repository_removal_sequence_upgrade_test.sql`

- 退出码：`1`
- 失败 operation：`b3500000-0000-4000-8000-000000000002`
- project：`b3300000-0000-4000-8000-000000000001`
- mode：`DELETE_PROJECT_SUBTREE`
- idempotency key：`phase6-1-sequence-delete`
- 预期：`status=completed`
- 实际：`status=failed`，稳定错误码 `repository_removal_conflict`
- 实际失败断言：DELETE 未完成、project 残留 1、Evidence invalidation / source identifier 各残留 1、完成墓碑仅 1、DELETE 重放未成立。
- 部分删除：`0`。旧函数在 `mode_conflict` 分支即返回；目标 project 保持 `removed`，既有 Evidence invalidation 保持原样。测试事务最终回滚。
- 可重试性：旧函数把该 mode conflict 标记为不可安全重试，正是本票据要求修复的永久阻塞。
- Exit Criteria 影响：核心 blocker，修复前不能完成 Phase 1.1。

该次测试末尾另发现夹具把账本关联列误写为不存在的 `detached_project_id`，导致 TAP 在已输出上述 6 个真实失败后出现查询错误。随后只把账本对齐条件改为实际合同字段 `repository_removal_operation_id=b350...001`，没有改变任何产品断言，也没有再次在基线上追逐红灯。

环境失败记录：

- 首次 `pnpm db:reset` 在 CLI 启动前退出码 `1`，原文：`'node' is not recognized as an internal or external command`。未连接或修改数据库。
- 安全替代：只把工作区已配置的 Node 运行时加入当前命令 PATH；未安装/升级依赖。相同 `pnpm db:reset` 随后退出码 `0`。

## 5. 实现

新 migration 使用 `create or replace function public.execute_repository_removal(...)`，保持原函数签名、输入输出、错误码、所有权检查、确认文本、RLS 和 service-only 权限不变。

最小状态修复：

1. 函数入口用 `clock_timestamp()` 捕获 `request_started_time`；
2. 成功 operation 用真实完成时刻写入 `completed_at`；
3. 只有以下条件全部成立时放行已完成的不同模式：
   - 当前 mode 为 `DELETE_PROJECT_SUBTREE`；
   - 项目当前为 `removed`；
   - 已完成 REMOVE 的真实完成时刻不晚于当前请求开始时刻；
4. 若 DELETE 请求在 REMOVE 完成前已经发出，即使它等待唯一索引后才取得执行权，`prior.completed_at > request_started_time` 仍把它识别为并发竞争并返回稳定冲突；
5. DELETE 分支在删除 project 前显式删除该 actor / project 的 `evidence_reference_invalidations`，并把清理数写入 `counts.deleted.evidence_reference_invalidations`；
6. operation tombstone 继续保留，且不复制 source ID、文档、提示词、响应或令牌。

最终文件与 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `supabase/migrations/20260825024925_fix_repository_removal_sequence.sql` | `56379c99f31e8bf9b1781bb133755facb07ff51cd15c54700324fc7361dc0fe2` |
| `supabase/tests/0032_repository_removal_sequence_upgrade_test.sql` | `5a0bdd62df523303ffb7210b6b1e4cf7a035356023f513d0294c34252555c36e` |
| `supabase/tests/0033_repository_removal_sequence_concurrency_test.sql` | `68a31f4ea280956a58efca95d08b562156388aceceedf3b9cedff568a9b984f0` |
| `tests/fixtures/repository-removal/stage6-phase1.1-pre-run-freeze.json` | `7943b893e32a59451eba7bbb5bf763542dcd627d062d812e1d50fa6fbb3fa8a2` |

原 migration 最终 SHA-256 仍为 `b836f7b980a353ce9f7dc6fd48d0f95cfc025fec7df62761cc48544deaadb6b3`，与 pre-run 一致，证明未修改既有 migration。

## 6. Case Lineage 与最终语义

| case | operation ID | project ID | mode / request | idempotency key | 结果 |
| --- | --- | --- | --- | --- | --- |
| 顺序 1 | `b350...0001` | `b330...0001` | REMOVE | `phase6-1-sequence-remove` | completed / executed |
| 同键异参 | 无新 operation；仍绑定 `b350...0001` | `b330...0001` | 复用 REMOVE key 发 DELETE | `phase6-1-sequence-remove` | `repository_removal_conflict` |
| 顺序 2 | `b350...0002` | `b330...0001` | DELETE | `phase6-1-sequence-delete` | completed / executed |
| DELETE 重放 | `b350...0002` | `b330...0001` | DELETE | `phase6-1-sequence-delete` | completed / replayed |
| 并发赢家 | `b350...0010` | `b330...0010` | REMOVE | `phase6-1-race-remove` | completed |
| 并发冲突 | `b350...0011` | `b330...0010` | DELETE，在 REMOVE 完成前发出 | `phase6-1-race-delete` | `repository_removal_conflict` |

完整 UUID 及用户、installation、selection、控制项目映射见冻结夹具。断言均按稳定 ID、request fingerprint 与 reference fingerprint 对齐，没有依赖自然语言消息或不稳定执行顺序。

最终顺序合同：

`connected --REMOVE_REPOSITORY_DATA--> removed --DELETE_PROJECT_SUBTREE(new key + DELETE confirmation)--> project deleted`

未扩大为重新接入、恢复数据、GitHub App 撤销、账户删除或 Phase 2 语义。

## 7. Target-Specific Metrics 与分母

| 指标 | 冻结分母 / 请求数 | 实际结果 |
| --- | ---: | ---: |
| 顺序升级请求 | 2 | REMOVE 执行 1；DELETE 执行 1 |
| 应删除 project 行 | 1 | 删除 1；残留 0 |
| 应清理 Evidence invalidation / 来源标识 | 1 | 清理 1；来源标识残留 0 |
| 应保留 operation tombstone | 2 | 保留 2；误删 0 |
| DELETE 重放请求 | 1 | replay 1；重复 tombstone / 副作用 0 |
| 同键异参请求 | 1 | 稳定冲突 1 |
| 并发不同模式请求 | 2 | 完成赢家 1；稳定冲突 1 |
| 不应变化的 owner-control project / source | 1 / 1 | 变化 0 / 0 |
| 不应变化的 other-user project / source | 1 / 1 | 变化 0 / 0 |
| 应保留账户 ledger 行 | 2 | 保留并 detach 2；总 delta 0 |

新增顺序夹具中其余 GitHub issue、PR、release、workflow、document、webhook、AI invocation 样本分母均为 0，因此这些类别报告为 `N/A`，不以 100% 掩盖零样本；其回归行为由原 0030/0031 覆盖。

目标达成：顺序 DELETE 成功 1、project 残留 0、来源标识残留 0、重复副作用 0、跨边界变化 0、ledger delta 变化 0。

## 8. 测试与质量门

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| 基线红灯 0032 | 1 | 预期 FAIL；旧函数稳定复现永久 mode conflict；详见第 4 节 |
| `pnpm db:reset`（首次，Node 未进 PATH） | 1 | 环境启动失败；数据库未连接、未修改 |
| `pnpm db:reset`（工作区 Node PATH） | 0 | PASS；全部 migration、seed、本地容器重启成功 |
| 0030/0031/0032/0033 聚焦 pgTAP | 0 | PASS；4 files / 67 tests |
| `pnpm typecheck` | 0 | PASS |
| `pnpm lint` | 0 | PASS，0 warning |
| `pnpm test` | 0 | PASS；170 files / 1656 tests |
| `pnpm db:test` | 0 | PASS；33 files / 801 tests |
| `pnpm db:lint` | 0 | PASS；`results: []` |
| `pnpm db:types` | 0 | PASS；重新生成后无类型文件差异 |
| `pnpm db:types:check` | 0 | PASS；types up to date |
| `pnpm db:drift:check` | 0 | PASS；database schema drift empty |
| `pnpm build` | 0 | PASS；Next.js production build |
| `git diff --check` | 0 | PASS |

本批未修改 UI/API，因此无需新增 route/UI/E2E 测试；Phase 1 application/HTTP/UI 套件包含在完整 Vitest 1656 项回归中。所有必需命令均已运行，没有未运行项。

## 9. 安全与审核对照

1. 总纲两种选择现在可在同一项目生命周期内按顺序执行。
2. 顺序升级用“请求在前次完成后开始”明确区分；并发测试以两个真实 dblink 事务证明仍单赢家 / 单冲突。
3. 项目删除后，两个 operation tombstone 保留，Evidence invalidation 与 source ID 清零；墓碑 result 仅含模式、项目 ID、状态、计数和时间。
4. 同键异参继续在 request fingerprint 校验处失败关闭。
5. 所有权、防枚举、RLS、固定 `search_path`、service-only execute、账本不可变性、项目写栅栏和原错误合同均未放宽。
6. 0030/0031 原测试未修改、未删除、未放宽；完整数据库回归 801/801 通过。

## 10. 系统审批、禁止动作与未纳入项

- 系统审批仅用于本地 Supabase CLI 状态、Docker / Supabase 测试数据库和本地 schema 生成/检查；审批均获准。
- Supabase CLI 提示存在新版本，但未升级。
- 未安装或更新依赖；未修改 lockfile。
- 未访问、修改或删除外部环境、Production 或真实用户/仓库数据。
- 未修改任何既有 migration。
- 未执行 reset、clean、amend 或历史改写。
- 未触碰、暂存或提交 `.pnpm-store/`；它仍是唯一预期未纳入项。
- 未 push、merge、创建 PR、部署或发布。
- 未进入 Phase 2–10。

## 11. 提交与最终仓库状态

- 提交策略：仅用五个精确路径暂存，不使用 `git add .`。
- 本地 commit：`SELF`（本报告所在单一提交；实际 SHA 在提交完成后的任务回执中绑定）。
- 最终 HEAD：`SELF`（实际 SHA 在提交完成后的任务回执中绑定）。
- 提交后复核项：
  - `git diff --cached --name-only` 应为空；
  - tracked 工作树应无差异；
  - `git status --porcelain=v1 -uall` 仅保留阶段前 `.pnpm-store/`；
  - 不应出现本批文件未提交或 `.pnpm-store/` 进入 index。

## 12. 结论

Phase 1.1 的唯一 blocker 已修复：已完成 REMOVE 后，所有者可用新的幂等键和正确 DELETE 强确认删除整个项目；真正并发不同模式仍单赢家 / 稳定冲突，同键异参仍失败关闭，项目删除后的 Evidence 来源标识清零，DELETE 同键重放无重复副作用，跨用户/跨项目和账本边界未回退。

全部必需质量门通过，使用了新的 forward-only migration，既有 migration 与公开合同均未修改。

结论：**Phase 1.1 完成；未进入 Phase 2。**

<!-- EXECUTION_REPORT_COMPLETE -->
