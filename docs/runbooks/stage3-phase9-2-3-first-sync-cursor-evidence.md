# 探索者号｜阶段 3 / Phase 9.2.3 First Sync Cursor 阻塞证据

## 批次与基线

- 批次：`explorer-stage3-phase9-2-3-first-sync-cursor-3f91a34e`
- prompt：`explorer-stage3-phase9-2-3-cursor-compatibility-3f91a34e`
- 来源票据：`sha256:3f91a34e0858c30e6fc4c660edf8800f2ac76dfe1ebf113a613d24c8076c7961`
- blocker：`sha256:1a42a9fdf352fa8aa451c28383e347315b4c7af4881f1d57d05ec1719074947a`（`1/5`）
- 基线 commit：`984419866d809d8a9ef89451653847488b7d3f56`
- 基线 tree：`44e656c88c470155095eaf4c0930f9d9242c45da`
- 基线 parent：`4c94d970007820b9768cd41c46f0a93845500ef5`
- Pre-Run Freeze：`tests/fixtures/synchronization/stage3-phase9-2-3-pre-run-freeze.json`

## 只读审计与逐层二分

当前 TypeScript cursor validator 与 PostgreSQL `first_sync_cursor_is_valid` 对 `providerJobId` 使用等价字符集合和 256 字符上限。`StartFirstRepositorySync` 的实际顺序是：创建或复用 queued SyncRun、读取可信项目上下文、调用 `JobDispatcher`、创建 cursor、checkpoint、解析数据库回读 cursor。历史 cursor migration 由 `b740a1c86c3f9226d832b8f5bb15bec5f5b398f7` 引入，之后未被修改。

本地二分使用来源 staging 的非秘密字段：固定 project、SyncRun、request、repository、installation、UTC 90 天窗口，以及合同允许的 Inngest ULID 形态 provider ID。没有使用真实 token、Cookie、事件密钥、provider payload 或远程日志。

| 层 | 结果 | 证据 |
|---|---|---|
| TypeScript 创建与序列化 | ACCEPTED | 序列化长度 802；parse round-trip 成功 |
| Local PostgreSQL validator | ACCEPTED | 相同 project/run/request/repository/installation 结构返回 `true` |
| `checkpoint_first_sync_run` | ACCEPTED | version `1 → 2`；返回 cursor；SQL `jsonb::text` 长度 836 |
| checkpoint 回读与 TypeScript parse | ACCEPTED | 回读结构可解析 |
| 本地数据库副作用 | 0 | 整条 checkpoint 验证在显式事务中执行并回滚 |

因此，提示词要求的三种确定性 RED 均未出现：TypeScript 没有拒绝合法结构，SQL validator/checkpoint 没有拒绝同一结构，回读 parse 也没有失败。

## 结论与范围决定

当前授权证据不足以把 staging 的 `first_sync_cursor_invalid` 精确归因于 TypeScript 创建/序列化、SQL validator/checkpoint 或回读 parse 中的任一层。可以确定的是，冻结的安全字段形态与当前本地代码、当前 migration 在整链路上一致通过。

本批次因此没有修改 validator、正则、cursor 序列化、checkpoint RPC、dispatcher、store、测试或 migration，也没有生成数据库类型。宽泛放宽 identifier/cursor 校验既缺少 RED，也会削弱敏感字段、长度、project/run 与 provider ID 边界，违反本批授权。

尚无法确定的外部差异仅能作为后续调查方向，不能视为本批根因：staging 实际部署的函数定义、实际 cursor 的安全字段元数据或实际 provider ID 形态可能与本地冻结输入不同。当前批次禁止连接 staging 或读取远程 provider 事实，因而不能进一步裁决。

## 验证结果

| 门禁 | 结果 |
|---|---|
| First Sync / dispatcher / store / authenticated Route 定向 | 8/9 文件通过，108 tests PASS；module-boundaries 首轮单例超时 |
| module-boundaries 隔离复验 | 1 文件，36 tests PASS，Exit 0 |
| 数据库集成 | 17 files，529 pgTAP PASS，Exit 0；包含 0014 |
| 应用集成首轮 | 17 files，55 PASS，7 SKIP；本地 Supabase 凭据探测不可用 |
| 应用集成唯一隔离复验 | 17 files，60 PASS，2 SKIP，Exit 1；仍为本地凭据探测环境问题 |
| lint | PASS，Exit 0 |
| typecheck | PASS，Exit 0 |
| db lint | PASS，Exit 0，0 findings |
| db types check | PASS，Exit 0 |
| db drift check | PASS，Exit 0 |
| production E2E | 2/2 PASS，Exit 0 |
| `pnpm test` | 固定 180 秒资源上限终止，Exit 124；未伪装为通过 |

E2E 自动改写 `next-env.d.ts` 后，已验证工具来源并精确恢复到基线 blob。所有非预期失败均未通过删测、skip、延长超时、访问远程服务或弱化断言绕过。

## 阻塞状态与最小后续证据

总体状态：`BLOCKED`。没有确定性 RED，未实施修复，因此不具备再次进入 staging Smoke 的代码前提。

最小后续任务应单独授权只读 staging 证据采集，并在不输出秘密或 raw payload 的前提下核对：

1. staging `app_private.first_sync_cursor_is_valid` 与 `checkpoint_first_sync_run` 的函数定义指纹；
2. 失败 cursor 的 exact key 集合、各字符串长度/字符类别、group 顺序、窗口关系等安全元数据（不读取或保存原值）；
3. 实际 Inngest provider event ID 的长度与字符类别或不可逆摘要；
4. 部署 commit、migration ledger 与本地基线的一致性。

这些动作超出本批“本地修复、零远端连接”的授权边界，须由后续审核任务决定。远端副作用为 0，未 Push、部署、OAuth、修改 staging 或创建 GitHub 测试对象。
