# 阶段 6｜Phase 2.1 Installation 撤销并发门禁｜Pre-Run Freeze

- 批次 ID：`explorer-stage6-phase2.1-d08f8a4eb81e34ef`
- 提示词实例 ID：`explorer-stage6-phase2.1-e13e8ce2662a90b7`
- 审核票据 ID：`review-ticket-e13e8ce2662a90b7`
- blocker fingerprint：`e13e8ce2662a90b72a872f25c33a78c6421b0e1e7036deedea94485846060073`
- Phase 2 commit / baseline HEAD：`ba921cf9fcac092441757b3e2beb66eb292a3fa9`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:/AI workplace/探索者号/.git`
- baseline `git status --porcelain=v1 -uall | Out-String` UTF-8 SHA-256：`27cb66215030698bc870b0c040cb4af59e89430dbf3d2f742e777e5efdd37322`
- baseline status 字符数：`350928`；行数：`1956`
- baseline 非 `.pnpm-store/` 差异：`0`
- `.pnpm-store/`：阶段前未跟踪缓存噪声；本批禁止读取后写回、删除、整理、暂存或提交。

## 冻结文件

- 原 migration：`supabase/migrations/20260825033542_installation_revocation_lifecycle.sql`
  - 只读；不得修改。
- 修复 migration：`supabase/migrations/20260825044322_installation_revocation_concurrency_gate.sql`
  - 红灯前 SHA-256：`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`
- 新并发 pgTAP：`supabase/tests/0035_installation_revocation_concurrency_gate_test.sql`
  - 首次运行前 SHA-256：`F12CD6C97FAACCA75D5835B4A23B6AF07BFF1F6C9D86AB9421262713F58775CD`
- cache-hit TS 测试所在文件：`src/application/project-brief/generate-project-brief.test.ts`
  - 新红灯加入后 SHA-256：`72F43A01EA4BBD4456FE3198E0B945BA31730BD6E802CE3556748B483756A3A9`

## 开始前锁顺序审计

1. `complete_github_webhook_installation`：先锁 delivery，再按 numeric installation ID 找内部 Installation 并 `FOR UPDATE`；随后更新 Installation，扫描 SyncRun、project dispatch、Webhook、Brief、Invocation、reservation。撤销内部顺序为 `delivery → Installation → work`。
2. `create_sync_run`：普通查询 Installation active，未加锁，随后 insert SyncRun；已持有 work 行锁：无。
3. `request_project_sync`：普通查询 Installation active，随后取得 project advisory lock，再查询/更新/插入 SyncRun 和 dispatch；Installation 锁前已持有：无，但会在后续持有 project advisory/work。
4. `reserve_project_brief_energy`：先检查 project ownership，再取得 user/day advisory lock、写 daily grant，最后通过 `reserve_energy` 插入 reservation；Phase 2 trigger 只普通读取 active。Installation 锁前可能已持有 user/day advisory 与 ledger 行。
5. `finalize_project_brief_generation`：先 `FOR UPDATE` 锁 reservation，再插入 completed Brief/Invocation 并 consume；Phase 2 completed-invocation trigger 只普通读取 active。若仅在 trigger 补 Installation 锁，会形成 `reservation → Installation`，与撤销 `Installation → reservation` 构成死锁环。
6. `record_project_brief_cache_hit`：读取 completed Brief/source Invocation 后插入 completed Invocation；插入前没有行锁，trigger 是最早写门。
7. completed AI direct insert：BEFORE INSERT trigger 仅普通读 active；没有互斥行锁。
8. 六类 GitHub snapshot insert/update：BEFORE ROW trigger 仅普通读 active；insert 路径未持有 work 行，update 路径由 PostgreSQL 先定位目标行，但撤销不扫描 snapshot，因此与撤销没有反向 snapshot 等待边。
9. 0034 只在一个连接中顺序完成 revoke 后再请求工作，只证明“看见 revoked 会拒绝”，无法覆盖“先读 active、撤销扫描完、最后提交”的第三种结果，也没有观测 `wait_event_type='Lock'`。

## 死锁规避与最小方案

- 所有受控写路径统一为：`内部 github_installations.id 行锁 → advisory/work/reservation/invocation/snapshot`。
- Sync RPC 在任何 SyncRun/dispatch/advisory lock 前取得 `FOR UPDATE OF installation_record`。
- Brief reserve 在 user/day advisory 和 daily grant 前取得 Installation 行锁。
- Brief finalize 在 reservation `FOR UPDATE` 前通过 reservation→project→selection 只读定位并锁 Installation；随后才锁 reservation。
- direct AI/cache-hit/snapshot 写由 BEFORE trigger 锁 Installation，锁保持到写事务结束。
- 不使用全表锁、全局 advisory lock、提升全局隔离级别或跨 installation 串行化。

## 并发 Lineage 与稳定身份

| Case | Connection A | Connection B | Installation | Project | Work / delivery | 预期锁与提交顺序 |
|---|---|---|---|---|---|---|
| S1 Sync work-first | work | revoke | `a110...001` / `921001` | `a130...001` | key `phase2-1:sync:work-first`; delivery `a140...001` | A lock；B wait；A commit；B cancel |
| S2 Sync revoke-first | revoke | work | `a110...002` / `921002` | `a130...002` | key `phase2-1:sync:revoke-first`; delivery `a140...002` | A lock；B wait；A commit；B auth fail |
| E1 Energy work-first | reserve | revoke | `a110...003` / `921003` | `a130...003` | request `phase2-1:energy:work-first`; delivery `a140...003` | A lock；B wait；A commit；B release/refund |
| E2 Energy revoke-first | revoke | reserve | `a110...004` / `921004` | `a130...004` | request `phase2-1:energy:revoke-first`; delivery `a140...004` | A lock；B wait；A commit；B auth fail/rollback |
| A1 AI work-first | completed insert | revoke | `a110...005` / `921005` | `a130...005` | invocation `a150...005`; delivery `a140...005` | A lock；B wait；A commit before revoke |
| A2 AI revoke-first | revoke | completed insert | `a110...006` / `921006` | `a130...006` | invocation `a150...006`; delivery `a140...006` | A lock；B wait；A commit；B auth fail |
| G1 snapshot work-first | snapshot insert | revoke | `a110...007` / `921007` | `a130...007` | object `phase2-1:snapshot:work-first`; delivery `a140...007` | A lock；B wait；A commit before revoke |
| G2 snapshot revoke-first | revoke | snapshot insert | `a110...008` / `921008` | `a130...008` | object `phase2-1:snapshot:revoke-first`; delivery `a140...008` | A lock；B wait；A commit；B auth fail |
| control | independent Sync | target revoke held | `a110...009` / `921009` | `a130...009` | key `phase2-1:control:sync` | 不等待 target Installation |

连接 pid 由 `dblink(..., 'select pg_backend_pid()')` 对齐；阻塞由 `pg_stat_activity.wait_event_type='Lock'` 的 2 秒有界条件轮询确认，不按日志完成顺序或固定 sleep 猜测。

## 分母与禁止结果

- Sync 竞争：`2`（两种 commit order 各 1）
- reservation 竞争：`2`
- completed AI 竞争：`2`
- snapshot 竞争：`2`
- 允许 serial order：`8`
- 禁止 post-revoke survivor：`4` 个 revoke-first 工作，目标 `0`
- work-first 撤销收敛：queued Sync/reservation 各 `1`；completed AI/snapshot 为撤销前历史事实各 `1`
- deadlock / lock timeout / statement timeout / serialization failure / 未知错误：目标均 `0`
- 控制 installation/project/work：各 `1`；目标变化 `0`
- cache-hit revoked case：`1`；预期 stage/code 为 `authorization / project_brief_authorization_failed`
- E2 非授权 Energy ledger delta：`0`

禁止结果：B 不等待同一 Installation、revoke-first 工作提交、revoked 后 queued/reserved/completed/snapshot 新 survivor、Energy grant/reserve 残留、跨 installation 阻塞、deadlock 或通用 persistence 错误替代 authorization。

## 夹具修正记录（分母与业务断言未变）

- 首次运行前的测试 SHA 如上冻结；首次执行发现 `payload_sha256` 夹具第 7/8 个字符不是十六进制，导致 delivery 注册批次回滚。仅将生成字符集从 `abcdefgh` 修正为 `12345678`，未改变 case 身份、请求、锁断言或分母。
- 第二次（有效红灯）之后，依据 PostgreSQL `dblink_get_result` 的结果排空合同，为每次异步请求补充终止结果读取；仅修正连接复用，未改变业务断言。
- 首次绿色候选运行发现固定撤销时间 `04:11Z`–`04:18Z` 早于测试执行时动态生成的工作时间，触发既有时间顺序约束。仅将同日合成撤销时间修正为 `23:11Z`–`23:18Z`；稳定 ID、提交顺序、状态期望和分母均不变。
- 修正后并发测试 SHA-256：`723BD3950F5B4B784670C37FD109B9FFE934647E2A147BB6FC6BB0517F9E8F86`。
- 实现后 migration SHA-256：`F174DD5B5DECD6A5F2EAC2FDF91018DA1541DCA6BF499E60BF9CF860AC0CA0A1`；空 migration 初始 SHA 仍作为红灯基线保留。
