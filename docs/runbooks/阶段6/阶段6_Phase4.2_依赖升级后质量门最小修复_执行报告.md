# 探索者号｜阶段 6｜Phase 4.2 依赖升级后质量门最小修复｜执行报告

## 1. 编排标识与授权回读

- 批次 ID：`explorer-stage6-phase4.2-0909ec3b12eabe7f`
- 提示词实例 ID：`explorer-stage6-phase4.2-85ed8cea480144f1`
- 审核票据 ID：`review-ticket-85ed8cea480144f1`
- 授权策略：`workflow-authorization.v1`
- 合同：`phase4.2-quality-gate-repair.v1`、`installation-revocation-concurrency-time-fixture.v1`、`database-types-current-schema.v1`、`phase4.1-dependency-security-preservation.v1`
- 仓库：`D:\AI workplace\探索者号`
- 用户授权回读：仅修复 0035 数据库测试时间与 `database.types.ts` 漂移，并运行必要回归；不得改业务代码、配置、migration、其他测试、依赖或 CI；不得 stage/commit/push/deploy；不得进入 Phase 5。

## 2. Pre-Run Freeze

### 2.1 仓库身份

- baseline HEAD：`43e56095e54bbecc640ebd189a68d55794287faa`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:\AI workplace\探索者号\.git`
- 基线完整 `git status --porcelain=v1 -uall | Out-String`：UTF-8 SHA-256 `6034dc578ed3c318a9eb4ba3c9697239edc3b73496e49a1649c9dbc8b403b822`，374306 字符，2065 个非空状态行。
- 基线非 `.pnpm-store/` 状态：`package.json`、`pnpm-lock.yaml` 已修改；Phase 4 与 Phase 4.1 报告未跟踪；staged 文件 0。
- `.pnpm-store/`：阶段前未跟踪噪声。仅为满足提示词的完整 Git status 取证由 Git 枚举路径；未读取文件内容、未删除、未修改、未暂存、未提交，并从本批差异/分母排除。Git 对其中既有递归路径报告了路径过长/缺失警告，不影响授权文件取证。

### 2.2 Phase 4.1 依赖冻结

- `package.json` SHA-256：`9acba67c23264d1f9b27c428c8fa51aaa569342157473ed8810c8df5b1a7d4f2`
- `pnpm-lock.yaml` SHA-256：`486860816c0dd48be09d62711cb35350703601c7c4c4a64b72fa89fe6ed5ea05`
- Next：`16.3.0`
- production audit：244 dependencies；info/low/moderate/high/critical 均为 0；audit JSON SHA-256 `2bf238edb752b1e622d837624705d0beec939274a45ab8ff05dbbb8683ae09d5`。

### 2.3 0035 与类型冻结

- 0035 修改前 SHA-256：`723bd3950f5b4b784670c37fd109b9ffe934647e2a147bb6fc6bb0517f9e8f86`
- `database.types.ts` 修改前 SHA-256：`69178a2d7ebf745873cc63e3f68ad54a5006e72f0f0ce673a725a8e62e341fb2`
- 0035 有 8 个传给 `complete_github_webhook_installation` 的固定撤销完成时间：`2026-08-25T23:11:00Z` 至 `23:18:00Z`。
- `sync_runs_timestamp_order_check` 的实际相关约束是 `finished_at is null or finished_at >= queued_at`；S1 的 `create_sync_run` 以数据库时间生成 `queued_at`，而固定的 `p_completed_at` 会随执行日期变成更早的 `finished_at`。
- 锁序保持：Webhook delivery row → Installation row → Sync/dispatch/Brief/AI/reservation rows；0035 的 A/B dblink 只改变完成时间参数，不改变连接、行锁、提交顺序或生产函数。

## 3. 红灯证据与根因

### 3.1 0035 固定时间红灯

在干净 `pnpm db:reset` 后运行 `pnpm db:test`：退出 1；41 files / 935 tests。0035 在 S1 第 214 行退出 3：

```text
new row for relation "sync_runs" violates check constraint "sync_runs_timestamp_order_check"
queued_at = 2026-08-26 03:26:57.885571+00
finished_at = 2026-08-25 23:11:00+00
```

0035 在异常前仅输出 2 个通过的 subtest，随后 TAP 报 `No plan found`。因此根因不是生产 constraint，而是日期会失效的绝对完成时间夹具。

### 3.2 类型检查红灯与污染链

- 0035 红灯后运行 `pnpm db:types:check`：退出 1，`Generated database types differ...`。
- 失败数据库中临时生成类型比提交文件多 25 行，且仅为 7 个 `app_private.test_phase2_1_*` 测试 helper；它们本应在 0035 末尾删除，但 SQL exception 阻断了 cleanup。
- 再次执行干净 `db:reset`、且不运行 pgTAP 时，migration-only 临时生成类型 SHA-256 为 `69178a2d7ebf745873cc63e3f68ad54a5006e72f0f0ce673a725a8e62e341fb2`，与当前 `database.types.ts` 字节完全一致，diff 为 0。
- 判定：所谓“已提交数据库类型漂移”是 0035 异常退出造成的本地测试 schema 污染，不是 migration schema 漏生成。把测试 helper 写入生产类型会制造错误产物，因此本批不伪造 `database.types.ts` 内容变化；修复 0035 的正常 cleanup 后，标准生成/check 自然恢复。

### 3.3 其他冻结红灯

- 修改前默认 `pnpm test:integration` 的 application 部分：19/21 files、65/67 tests 通过；两个 ESLint 边界 case 超过 10 秒，命令退出 1，未进入数据库子命令。修复后同一默认命令复跑全绿，见第 6 节。
- 该首次 application 超时没有修改授权外文件；最终默认 integration 是验收依据，首次失败保留为运行时负载证据。

## 4. 最小修改

### 4.1 0035 时间夹具

文件：`supabase/tests/0035_installation_revocation_concurrency_gate_test.sql`

- 仅将 8 个撤销完成时间实参从固定 `2026-08-25T23:11Z..23:18Z` 改为对应 dblink 数据库会话内的 `pg_catalog.clock_timestamp()`。
- 修改后 SHA-256：`4376225eddc898b974ced449c3f0b52ea48a36ea1fc50df094f0647036226edb`
- diff：8 insertions / 8 deletions；未改任何断言、case、timeout、锁序、production constraint、migration 或数据库函数。

### 4.2 数据库类型

文件：`src/infrastructure/database/database.types.ts`

- 按要求实际运行仓库标准 `pnpm db:types` 两次（聚焦 0035 后一次、最终全量 db:test 后一次）。
- 两次生成前后 SHA-256 均为 `69178a2d7ebf745873cc63e3f68ad54a5006e72f0f0ce673a725a8e62e341fb2`，新增/删除/修改行均为 0。
- `pnpm db:types:check` 两次均退出 0。
- 最终 tracked diff 中该文件为 0；这是对当前 30 条已提交 migration schema 的精确生成结果，而不是漏改。

### 4.3 其他文件

- 保留 Phase 4.1 已有 `package.json` 与 `pnpm-lock.yaml` 差异，SHA 未变化。
- E2E/build 自动改写的 `next-env.d.ts` 已恢复至 HEAD blob `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38`；仅执行 index stat refresh 以清除假阳性状态，cached diff 始终为 0。
- 新增本报告。未修改其他 `src/`、测试、migration、配置、CI 或依赖。

## 5. 0035 时间 Lineage 与行为证据

| Case | 稳定工作键 | 权威时间与顺序 | 最终行为 |
|---|---|---|---|
| S1 work-first | `phase2-1:sync:work-first` | A 创建 queued Sync 并持有 Installation lock；B 在实际执行 revoke 时取 `clock_timestamp()`，等待 A commit 后更新，故 `finished_at >= queued_at` | queued Sync 被 cancelled |
| S2 revoke-first | `phase2-1:sync:revoke-first` | A 的 revoke 会话取数据库时钟并持锁；B 等待后重新观察 revoked | 稳定 `sync_run_authorization_revoked`，survivor 0 |
| E1/E2 | `phase2-1:energy:*` | 各 revoke 会话以数据库时钟完成，原 dblink 锁/提交顺序不变 | work-first reservation released；revoke-first 无 reservation/ledger 副作用 |
| A1/A2 | invocation `a1500000-...0005/0006` | revoke 完成时间改为数据库时钟；AI row 固定合成内部时间未作为撤销 `p_completed_at` | work-first completion 保留；revoke-first 稳定授权失败，survivor 0 |
| G1/G2 | `phase2-1:snapshot:*` | revoke 完成时间改为数据库时钟；snapshot source timestamp 不承担撤销完成约束 | work-first snapshot 保留；revoke-first稳定授权失败，survivor 0 |

- 聚焦命令：`supabase test db --local supabase/tests/0035_installation_revocation_concurrency_gate_test.sql`
- 结果：退出 0；1 file / 30 tests；SQL exception 0；TAP plan 完整；四类预期授权拒绝 reason code 保持不变。
- 说明：S1 的 `sync_run_id` 由 `create_sync_run` 在测试中生成并在 cleanup 中删除；稳定对齐键为项目 UUID `a1300000-...0001` 与 idempotency key。未为记录 ID 扩大测试修改范围。

## 6. 测试、审计与质量门

| 命令 | 退出码 | 结果 / 分母 |
|---|---:|---|
| `pnpm env:check` | 0 | 1 file / 1 test，通过 |
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `pnpm lint` | 0 | `eslint . --max-warnings=0`，0 warning/error |
| `pnpm test`（首次全量） | 1 | 176/177 files、1692/1693 tests；Auth fixture iteration 1 的子进程冷启动超过 3000ms，`ETIMEDOUT` |
| Auth fixture 聚焦 | 0 | 1 file / 14 tests，2.35s，通过；确认首次失败为瞬时负载而非行为回归 |
| `pnpm test`（最终全量） | 0 | 177 files / 1693 tests，通过；skip/xfail 0 |
| `pnpm test:integration`（修改前） | 1 | application 19/21 files、65/67 tests；2 个 ESLint 边界 case 10s timeout |
| `pnpm test:integration`（最终默认命令） | 0 | application 21 files / 67 tests；随后 database 41 files / 963 tests；未用串行替代；skip/xfail 0 |
| `pnpm test:e2e:auth-fixture` | 0 | Chromium 1/1，通过 |
| `pnpm test:e2e:connected-panels` | 0 | Chromium 8/8，通过 |
| `pnpm db:reset`（最终） | 0 | 30 条 migration + seed 应用成功，本地合成数据库 |
| `pnpm db:test`（红灯） | 1 | 41 files / 935 tests；0035 exit 3 / no plan；其他文件通过 |
| 0035 聚焦 pgTAP | 0 | 1 file / 30 tests，通过 |
| `pnpm db:test`（最终 reset 后） | 0 | 41 files / 963 tests，通过；parse error 0 |
| `pnpm db:lint` | 0 | `app_private`、`extensions`、`public`；results 0 |
| `pnpm db:types` | 0 | 标准生成；与提交文件字节一致，diff 0 |
| `pnpm db:types:check`（红灯） | 1 | 0035 异常后 7 个 test helper / 25 行污染 |
| `pnpm db:types:check`（修复后及最终） | 0 | `Generated database types are up to date.` |
| `pnpm db:drift:check` | 0 | `Database schema drift is empty.` |
| `pnpm audit --prod --audit-level high --json` | 0 | 244 dependencies；0 advisory；high 0 / critical 0；所有 severity 0 |
| `pnpm build` | 0 | Next.js 16.3.0，Turbopack compile、TypeScript、9/9 static pages 与 route 构建通过 |

没有未解释的 skip/xfail；没有必需命令未运行。首次 unit/integration 超时均如实保留；最终同一默认命令已通过，且未修改超时、harness 或测试分母。

## 7. 指标与 Exit Criteria

- 0035：30/30 subtests；SQL exception 0；固定撤销完成时间残留 0/8；数据库权威完成时间 8/8。
- 全量数据库：41/41 files，963/963 tests，parse error 0。
- database types：migration-only generated ↔ tracked 差异 0 行；标准生成后 SHA 不变；test helper 残留 0。
- 默认 integration：21/21 application files、67/67 application tests；41/41 database files、963/963 database tests；非预期 skip/xfail 0。
- Phase 4.1 依赖保持：Next `16.3.0`；audit high 0、critical 0；`package.json`/lockfile SHA 与冻结值一致。
- 本批授权修复：0035 tracked diff 1 个；`database.types.ts` 经标准生成确认无需内容差异；其他新增 tracked diff 0。
- Git：HEAD 未变化；staged 0；commit 0。

## 8. 系统审批、失败与边界

- 本地 Docker/Supabase、浏览器 E2E、registry audit 与任务专用临时缓存命令均按 B 类通过平台审批执行。
- 首次在沙箱内读取 pnpm/Supabase help 因 `EPERM realpath C:\Users\admin` 失败；按策略升级权限。第一次升级命令缺少 Node PATH，原样失败为 `'node' is not recognized...`；修正 PATH 后成功，Supabase CLI 为 `2.109.1`，其 `test db` 明确支持单文件路径。
- 未使用真实账户、真实 GitHub、真实 Auth/AI/业务数据或 Production；E2E、数据库均为本地合成 fixture。
- 未安装/升级依赖，未修改 package/lockfile，未新建 migration，未修改业务、安全功能、配置、CI 或测试 harness。
- 未 stage、commit、amend、reset、checkout、clean、push、merge、PR、部署或发布。
- `.pnpm-store/` 内容未读取、未修改、未删除、未暂存、未提交；pnpm 命令均显式使用任务专用临时缓存/store。

## 9. 最终 Git 状态

- 最终 HEAD：`43e56095e54bbecc640ebd189a68d55794287faa`
- 最终完整 status SHA-256：`dd6a96a12c64c5595fd9bf43795d5aa86fbd54712df000fe5642065dc91a93be`
- 最终 status 字符数：`375840`
- 最终 status 非空行数：`2070`
- staged：0；本批 commit：0。
- tracked diff：
  - `M package.json`（Phase 4.1 既有）
  - `M pnpm-lock.yaml`（Phase 4.1 既有）
  - `M supabase/tests/0035_installation_revocation_concurrency_gate_test.sql`（Phase 4.2）
- `database.types.ts`、`next-env.d.ts`、migration、其他 `src/`/tests/config 无 diff。
- 非 `.pnpm-store/` untracked：Phase 4、Phase 4.1、Phase 4.2 三份执行报告。
- `.pnpm-store/` 路径状态共 `2064` 行，均作为阶段前噪声排除；其中递归/junction 样式路径会镜像当前仓库路径，因此状态行数变化不代表本批写入 store。

## 10. 结论

**Phase 4.2 完成。** 0035 的撤销完成时间已改为数据库权威相对时间，聚焦与全量 pgTAP 全绿；类型门的真实根因是失败测试遗留 helper，0035 正常清理后标准生成与提交类型精确一致，无需错误地纳入测试函数。默认 integration、unit、E2E、数据库、lint、drift、audit 与 build 的最终门禁均通过，Phase 4.1 的 `0 high / 0 critical` 未回退。

Phase 4 安全功能仍未完成；本批未进入 Phase 5。

<!-- EXECUTION_REPORT_COMPLETE -->
