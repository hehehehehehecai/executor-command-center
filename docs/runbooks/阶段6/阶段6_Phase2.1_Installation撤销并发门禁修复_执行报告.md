# 探索者号｜阶段 6｜Phase 2.1 Installation 撤销并发门禁最小修复｜执行报告

## 1. 编排、授权与结论

- 批次 ID：`explorer-stage6-phase2.1-d08f8a4eb81e34ef`
- 提示词实例 ID：`explorer-stage6-phase2.1-e13e8ce2662a90b7`
- 审核票据 ID：`review-ticket-e13e8ce2662a90b7`
- blocker fingerprint：`e13e8ce2662a90b72a872f25c33a78c6421b0e1e7036deedea94485846060073`
- 原始审核等级：`B`
- 授权策略：`workflow-authorization.v1`
- 授权仓库：`D:\AI workplace\探索者号`
- Phase 2 baseline commit：`ba921cf9fcac092441757b3e2beb66eb292a3fa9`
- 原 migration：`supabase/migrations/20260825033542_installation_revocation_lifecycle.sql`（只读，零修改）
- 修复 migration：`supabase/migrations/20260825044322_installation_revocation_concurrency_gate.sql`
- 授权回读：只执行本批本地可逆代码、新 forward-only migration、合成测试、构建、报告和一个本地 commit。未获授权且未执行 push、merge、PR、部署、发布、Production、真实数据、外部账号/密钥、不可逆删除、依赖安装/升级或 Phase 3–10。
- 结论：**Phase 2.1 完成**。四类 Installation 写门禁与可信撤销形成数据库级单一串行顺序，Brief cache-hit 二次授权失败恢复稳定 authorization 合同；未进入 Phase 3。

## 2. Baseline 与 Pre-Run Freeze

- baseline HEAD：`ba921cf9fcac092441757b3e2beb66eb292a3fa9`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:/AI workplace/探索者号/.git`
- baseline `git status --porcelain=v1 -uall | Out-String` UTF-8 SHA-256：`27cb66215030698bc870b0c040cb4af59e89430dbf3d2f742e777e5efdd37322`
- baseline status 字符数：`350928`；行数：`1956`
- baseline 非 `.pnpm-store/` 差异：`0`
- `.pnpm-store/`：阶段前未跟踪缓存噪声；本批未直接读取后写回、删除、整理、暂存或提交。该目录内部存在递归/镜像路径，新增工作区文件会被 `git status -uall` 重复枚举，因此最终以完整 status 哈希、噪声行数和批次外差异三项共同核验。
- 版本化冻结：`docs/runbooks/阶段6/阶段6_Phase2.1_Installation撤销并发门禁_Pre-Run_Freeze.md`
- 修复 migration 红灯前为空文件，SHA-256：`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`
- 新 pgTAP 首次执行前 SHA-256：`F12CD6C97FAACCA75D5835B4A23B6AF07BFF1F6C9D86AB9421262713F58775CD`
- cache-hit 红灯测试文件 SHA-256：`72F43A01EA4BBD4456FE3198E0B945BA31730BD6E802CE3556748B483756A3A9`
- 最终 migration SHA-256：`F174DD5B5DECD6A5F2EAC2FDF91018DA1541DCA6BF499E60BF9CF860AC0CA0A1`
- 最终并发测试 SHA-256：`723BD3950F5B4B784670C37FD109B9FFE934647E2A147BB6FC6BB0517F9E8F86`

### 2.1 Freeze correction

1. 首次测试夹具的第 7/8 个 `payload_sha256` 字符来自 `g/h`，不满足十六进制约束，delivery 注册批次回滚；仅把字符集改为 `12345678`，未改变稳定 ID、锁断言或分母。该次运行不作为产品红灯证据。
2. 有效红灯后依据 `dblink_get_result` 的连接复用合同补充异步结果排空；仅修正测试连接状态，未改变业务断言。
3. 首次绿色候选把固定撤销时间设在动态工作创建时间之前，触发既有 timestamp order constraint；仅把同日合成撤销时间改为 `23:11Z`–`23:18Z`，稳定身份、事件顺序、状态期望和分母不变。

## 3. 开始前只读审计

### 3.1 撤销锁与扫描顺序

`complete_github_webhook_installation` 基线顺序为：

```text
delivery FOR UPDATE
→ github_installations FOR UPDATE
→ Installation 状态转换
→ SyncRun / project dispatch / Webhook / Brief / Invocation / reservation 扫描与终止
```

因此新工作门禁必须先锁同一个内部 `github_installations.id`，再碰 work 行。`SELECT ... FOR UPDATE` 的行锁保持到事务结束，能够让等待方在锁释放后重新观察最新 `revoked` 状态。

### 3.2 基线事务边界与缺口

| 路径 | 基线 active 检查 | Installation 锁前已持有内容 | 风险 |
|---|---|---|---|
| `create_sync_run` | 普通 SELECT | 无 | 读 active 后可在撤销扫描结束后插入 queued run |
| `request_project_sync` | 普通 SELECT | 无；随后 project advisory/work | 同上，且只在后续串行 project 请求 |
| `claim_project_sync_dispatch` | UPDATE 的 EXISTS 普通读 | dispatch UPDATE 会取得 work 锁 | 可能形成 work-first、Installation-later 的反向顺序 |
| `reserve_project_brief_energy` | ownership + trigger 普通读 | user/day advisory、daily grant、ledger | 撤销扫描后可提交 reservation 与 Energy 占用 |
| `finalize_project_brief_generation` | completed invocation trigger 普通读 | reservation `FOR UPDATE` | 若只改 trigger，会形成 `reservation → Installation` 与撤销反向环 |
| `record_project_brief_cache_hit` | completed invocation trigger 普通读 | Brief/source 仅普通读 | cache-hit completion 可在 revoke 后落库 |
| direct completed AI insert | trigger 普通读 | 无 | 可产生 revoke 后 completion |
| 六类 snapshot insert/update | trigger 普通读 | insert 无；update 定位目标 snapshot | 可产生 revoke 后 snapshot；撤销不扫描 snapshot |

### 3.3 死锁分析与最终顺序

- 最终统一顺序：`内部 Installation 行锁 → advisory/work/reservation/invocation/snapshot`。
- `request_project_sync` 在 project advisory lock 之前锁 Installation。
- Brief reserve 在 user/day advisory、daily grant 和 reservation 前锁 Installation。
- Brief finalize 先经 reservation→project→selection 只读定位并只锁 Installation，之后才 `FOR UPDATE` reservation，消除 `reservation → Installation` 反向环。
- completed AI/cache-hit/snapshot 的 BEFORE trigger 锁 Installation，锁持续到整个写事务提交。
- 不使用全表锁、全局 advisory lock、更高全局隔离级别或跨 Installation 全局串行化。
- 同一 Installation 的授权写会按业务边界串行；不同 Installation 的控制请求不等待目标锁。

### 3.4 为什么 0034 不能证明并发安全

`0034_installation_revocation_lifecycle_test.sql` 在单连接中先提交撤销、再发起工作，只证明“已经看见 revoked 时会拒绝”。它没有第二连接、没有未提交事务，也没有检查 `pg_stat_activity.wait_event_type='Lock'`，因此无法排除“先读 active → 撤销扫描完成 → 新工作最后提交”的第三种结果。

### 3.5 cache-hit catch 边界

`GenerateProjectBriefUseCase.readCache` 把二次 `assertActive` 和 `recordCacheHit` 放在同一通用 `catch` 中；`assertActive` 抛出的 `ProjectBriefGenerationError(authorization, project_brief_authorization_failed)` 被无条件改写为 `persistence / project_brief_persistence_failed`。最终只让已有 `ProjectBriefGenerationError` 原样穿透，其他未知写入异常仍映射为 persistence failure。

## 4. TDD 红灯证据

### 4.1 cache-hit 红灯

- 命令：`pnpm test src/application/project-brief/generate-project-brief.test.ts`
- 退出码：`1`
- 结果：`1` 文件、`36` 测试，`35` 通过、`1` 失败。
- case：`preserves the authorization contract when a cache hit is revoked before observation`
- 预期：`authorization / project_brief_authorization_failed`
- 实际：`persistence / project_brief_persistence_failed`
- provider、reservation 与 cache-hit 持久化副作用：`0`。

### 4.2 数据库有效红灯

- baseline 使用空修复 migration，从零 reset 后执行新增双连接文件。
- 计划断言：`30`；有效红灯共出现 `19` 个 `not ok`。其中作为产品缺口证据的是四个 work-first case：撤销连接未进入 Installation lock wait，S1 queued Sync 在撤销后存活，E1 reservation 保持 `reserved` 且 Energy 最终 delta 为 `7` 而非 `10`，A1/G1 也缺少锁等待证据。
- revoke-first 后续断言当时还受到未排空 `dblink` 结果的测试连接复用问题影响，因此不把这些失败当作产品红灯；夹具修正后仍由四个 work-first case 独立证明基线缺锁。
- 未修改旧 migration、删除断言、延长 sleep 或放宽稳定错误码来取得绿色。

## 5. 最小实现与修改文件

### 5.1 forward-only migration

`supabase/migrations/20260825044322_installation_revocation_concurrency_gate.sql`

- `create_sync_run`：active 读取改为 `FOR UPDATE OF installation_record`。
- `request_project_sync`：在 project advisory/work 之前锁内部 Installation；等待后按 revoked/suspended 合同返回。
- `claim_project_sync_dispatch`：先锁 Installation，再更新 dispatch，移除 work→Installation 反向顺序。
- `reserve_project_brief_energy`：所有权绑定后先锁 Installation，再进行 user/day grant 与 reservation。
- `finalize_project_brief_generation`：先锁 Installation，再锁 reservation 并写 Brief/Invocation/ledger。
- `reject_inactive_project_energy_reservation`：direct reservation insert 取得 Installation 锁。
- `reject_inactive_project_ai_completion`：completed Invocation insert 取得 Installation 锁。
- `reject_inactive_github_snapshot_write`：六类 snapshot insert/update 取得 Installation 锁。
- 所有替换函数继续固定空 `search_path`，沿用原 owner、权限、错误码和公开合同；未新增表、列、状态模型或通用锁框架。

### 5.2 application 最小修复

- `src/application/project-brief/generate-project-brief.ts`：`readCache` 对 `ProjectBriefGenerationError` 原样抛出，保留 authorization stage/code。
- `src/application/project-brief/generate-project-brief.test.ts`：新增 cache-hit 在观察前撤销的独立 case。

### 5.3 测试与证据

- `supabase/tests/0035_installation_revocation_concurrency_gate_test.sql`
- `docs/runbooks/阶段6/阶段6_Phase2.1_Installation撤销并发门禁_Pre-Run_Freeze.md`
- `docs/runbooks/阶段6/阶段6_Phase2.1_Installation撤销并发门禁修复_执行报告.md`
- `src/infrastructure/database/database.types.ts` 经生成复核无差异，因此未纳入修改。
- 原 migration `20260825033542_installation_revocation_lifecycle.sql` 以及全部其他既有 migration 零修改。

## 6. 最终并发与错误合同

```text
active write gate + revoke = one serial order, never an unobserved post-revoke commit
work commits before revoke = revoke waits, then sees and terminalizes eligible work
revoke commits before work = work waits, rechecks revoked, then fails authorization
cache-hit authorization revoke = authorization / project_brief_authorization_failed
```

- Sync 错误保持：`sync_run_authorization_revoked` / `authorization_revoked`。
- Brief reserve/completion/cache-hit 错误保持：`project_brief_authorization_failed`。
- snapshot 错误保持：`github_activity_authorization_revoked`。
- revoked 单向语义、可信 Webhook 边界、取消状态、Energy refund、UI 与跨租户合同未改变。

## 7. Connection Lineage 与最终结果

| Case | Connection A → B | Installation / project | work / delivery | lock 与 commit order | 最终结果 |
|---|---|---|---|---|---|
| S1 | Sync → revoke | `a110...001` / `a130...001` | key `phase2-1:sync:work-first`; `a140...001` | A lock；B Lock wait；A commit；B commit | queued → cancelled，survivor 0 |
| S2 | revoke → Sync | `a110...002` / `a130...002` | key `phase2-1:sync:revoke-first`; `a140...002` | A lock；B Lock wait；A commit；B auth fail | `sync_run_authorization_revoked`，row 0 |
| E1 | reserve → revoke | `a110...003` / `a130...003` | request `phase2-1:energy:work-first`; `a140...003` | A lock；B Lock wait；A commit；B commit | reserved → released；Energy 10 |
| E2 | revoke → reserve | `a110...004` / `a130...004` | request `phase2-1:energy:revoke-first`; `a140...004` | A lock；B Lock wait；A commit；B auth fail | reservation 0、grant 0、delta 0 |
| A1 | completed AI → revoke | `a110...005` / `a130...005` | invocation `a150...005`; `a140...005` | A lock；B Lock wait；A commit；B commit | completion 是 revoke 前历史事实 1 |
| A2 | revoke → completed AI | `a110...006` / `a130...006` | invocation `a150...006`; `a140...006` | A lock；B Lock wait；A commit；B auth fail | completed survivor 0 |
| G1 | snapshot → revoke | `a110...007` / `a130...007` | object `phase2-1:snapshot:work-first`; `a140...007` | A lock；B Lock wait；A commit；B commit | snapshot 是 revoke 前历史事实 1 |
| G2 | revoke → snapshot | `a110...008` / `a130...008` | object `phase2-1:snapshot:revoke-first`; `a140...008` | A lock；B Lock wait；A commit；B auth fail | snapshot survivor 0 |
| control | target revoke held → independent Sync | `a110...009` / `a130...009` | key `phase2-1:control:sync` | 不等待目标 Installation | queued 1，控制组正常 |

- A/B 后端 pid 由 `dblink(..., 'select pg_backend_pid()')` 精确对齐。
- 阻塞由 2 秒有界轮询确认 `wait_event_type='Lock'`，不是依赖固定 sleep 猜赢家。
- 每个 helper 设置 `lock_timeout=3s`、`statement_timeout=5s`；全部连接在测试清理阶段关闭。
- 全部 UUID、numeric installation ID、邮箱和内容为本地合成数据。

## 8. 分母与 Target-Specific Metrics

| 指标 | 冻结分母 | 实际结果 |
|---|---:|---:|
| Sync 竞争 | 2 | 两种 serial order 2；禁止 survivor 0 |
| Brief Energy reservation 竞争 | 2 | work-first release 1；revoke-first reservation/grant 0 |
| completed AI 竞争 | 2 | revoke 前历史事实 1；revoke 后 completed survivor 0 |
| GitHub snapshot 竞争 | 2 | revoke 前历史事实 1；revoke 后 snapshot survivor 0 |
| 允许 serial order | 8 | 8/8 均观测同一 Installation Lock wait |
| revoked 后 queued Sync survivor | 1 | 0 |
| revoked 后 reserved Energy survivor | 1 | 0 |
| 非授权 Energy ledger delta | 1 case | 0 |
| revoked 后 completed AI/Brief 新持久化 | 1 | 0 |
| revoked 后 snapshot 新持久化 | 1 | 0 |
| deadlock | 8 | 0 |
| lock timeout / statement timeout | 8 | 0 / 0 |
| serialization failure / 意外错误 | 8 | 0 / 0 |
| 控制 Installation/project/work | 各 1 | 变化 0；控制 Sync 成功 1 |
| cache-hit revoked case | 1 | 1/1 返回 authorization / `project_brief_authorization_failed` |

零样本：全表锁、全局 advisory lock、跨 Installation 串行、真实 provider/GitHub 调用均为 `N/A`；实现没有引入这些路径。

## 9. 测试、质量门与失败记录

### 9.1 最终通过

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm test src/application/project-brief/generate-project-brief.test.ts` | 0 | 1 file / 36 tests |
| 新增 `0035` 独立 Docker psql 执行 | 0 | 30/30 |
| `0021` 独立执行 | 0 | 7/7 |
| `0024` 独立执行 | 0 | 9/9 |
| `0028` 独立执行 | 0 | 5/5 |
| `0031` 独立执行 | 0 | 10/10 |
| `0033` 独立执行 | 0 | 5/5 |
| `0034` 独立执行 | 0 | 27/27 |
| `pnpm typecheck` | 0 | 通过 |
| `pnpm lint` | 0 | 通过，0 warning |
| `pnpm test` | 0 | 171 files / 1669 tests |
| `pnpm db:reset` | 0 | 多次从零应用 27 条 migration，含新 `20260825044322` |
| `pnpm db:test` | 0 | 35 files / 858 tests |
| `pnpm db:lint`（干净 reset 后） | 0 | `results=[]` |
| `pnpm db:types` | 0 | 生成成功；tracked 类型文件无差异 |
| `pnpm db:types:check` | 0 | up to date |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm build` | 0 | Next.js 16.2.10 production build 通过 |
| `git diff --check` | 0 | 无 whitespace error |

### 9.2 失败与处置

1. 新 migration 创建命令首次因 Supabase CLI 尝试写 `C:\Users\admin\.supabase\telemetry` 被沙箱以 `EPERM` 拒绝；仓库无变化。设置 `SUPABASE_TELEMETRY_DISABLED=true` 与 `DO_NOT_TRACK=1` 后创建成功。未安装/升级 CLI。
2. 首次 pgTAP 运行存在非法十六进制 SHA 夹具，delivery 批次回滚；不计入红灯。修正后空 migration 的有效红灯证明四类门禁缺少锁。
3. 有效红灯后发现复用 dblink 连接前没有排空全部结果；仅补 drain，未改业务断言。
4. 首次绿色候选 27/30，失败为合成撤销时间早于动态创建时间，触发既有 timestamp order constraint；无部分撤销。修正合成时间后 30/30。
5. 一次显式多文件 `supabase test db` 使用了提示词中的泛称而非仓库精确文件名，同时 CLI 在含空格工作区的显式路径解析为 `NOTESTS`，exit `1`。该次明确记为“未执行到测试”，不记通过；随后用准确文件名逐一运行，合计 63/63，并由完整 `pnpm db:test` 再证 858/858。
6. `db:test` 后直接 `db:lint` 首次 exit `1`，错误仅来自 pgTAP 临时 `extensions.*` 函数。重新 `db:reset` 清除测试扩展后 `db:lint` 为 `results=[]`；本批函数没有 lint issue。
7. `pnpm db:types` 沙箱内首次因 Docker named pipe 权限被拒，exit `1`；按系统审批以相同精确本地命令重跑，exit `0`。
8. 一次聚焦 TS 命令未把 bundled Node 加入 PATH，exit `1` 且未运行测试；修正环境后 36/36。完整 `pnpm test` 另行 1669/1669。

所有失败都保留原始分类；未通过删除测试、放宽断言、恢复 revoked、延长 sleep、静默吞错或修改旧 migration 取得绿色。

## 10. 系统审批与安全范围

- 系统审批仅用于访问本机 Docker/Supabase：`db reset`、本地 psql/pgTAP、`db:test`、`db:lint`、`db:types`、`db:types:check`、`db:drift:check`。
- 所有数据库数据均为本机合成 fixture；未访问 Production、真实 GitHub、真实 AI provider 或真实用户数据。
- 未改变可信 HMAC/Webhook 边界、revoked 单向状态、Energy refund、RLS、所有权、防枚举、service-role 或跨租户隔离。
- 未引入全表锁、全局工作流、第二套 Installation 状态或 UI 变化。
- 未安装或升级依赖；CLI 的可用更新提示被明确忽略。
- 未修改任何既有 migration。
- 未删除、整理、暂存或提交 `.pnpm-store/`。
- 未 amend、reset Git、clean 或改写历史。
- 未 push、merge、创建 PR、部署或发布。
- 未进入 Phase 3–10。

## 11. Git 提交与最终状态

- 提交前 HEAD：`ba921cf9fcac092441757b3e2beb66eb292a3fa9`
- 提交消息：`fix: serialize installation revocation gates`
- 本批仅创建一个本地 commit。
- 精确 commit hash：本报告与全部实现由同一个提交承载；Git commit hash 包含本报告自身内容，不能在提交前自引用。提交后的精确 hash 在最终任务回执中给出，并由只读 `git rev-parse HEAD` 绑定本报告。
- 报告生成前完整 status SHA-256：`71f70ee368bf973a74d17e07e79c993cda7767c75b0adff53640e5b2dcea2fcb`；字符数 `353465`；行数 `1970`；其中 `.pnpm-store/` 噪声 `1965` 行、本批 `5` 行。报告加入后按同一命令重新冻结，提交后再给出最终 status。
- 预期提交后 tracked 工作区为空；唯一未纳入项为阶段前 `.pnpm-store/`。任何 `.pnpm-store/` 递归镜像枚举均不进入 index。

## 12. Exit Criteria 判定

- 四类新工作与撤销竞争只收敛到两种允许串行结果：满足。
- revoked 后 queued Sync、reserved Energy、completed AI/Brief、snapshot survivor：均为 0。
- 锁顺序统一，无 deadlock、无限等待或跨 Installation 串行化：满足。
- cache-hit 二次授权失败映射为 authorization / `project_brief_authorization_failed`：满足。
- Phase 2 顺序撤销、重放、乱序、取消、Energy 守恒、UI 与跨租户隔离：完整回归通过。
- 仅新增 forward-only migration，既有 migration 零修改：满足。
- 全部必需质量门：通过。
- 单一最小本地 commit：提交后由最终回执绑定。
- `.pnpm-store/`、外部环境、Production 与 Phase 3–10：未触碰/未进入。

**Phase 2.1 完成；未进入 Phase 3。**

<!-- EXECUTION_REPORT_COMPLETE -->
