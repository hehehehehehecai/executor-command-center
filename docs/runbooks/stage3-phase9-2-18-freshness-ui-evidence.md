# 探索者号｜阶段 3｜Phase 9.2.18 真实 Freshness UI 修复证据

## 结论

本批以本地 TDD 闭合 `/project-galaxy` 已注册但无生产页面而返回 404 的缺口。新页面只使用已验证会话对应的 Supabase session client、显式 `user_id` 过滤和既有 RLS，读取当前用户可见 Project 与最小 SyncRun 字段；页面复用 `SyncStatusBadge`、`createProjectFreshnessPresentation` 与 `deriveFreshnessStatus`，provenance 固定为 `real`。本批没有 migration、RPC、service role、demo fixture 或远端副作用。

本批 PASS 仅表示具备进入独立 staging Freshness 可见性 Smoke 的代码前提，不表示阶段 3 已完成。

## 基线与 Freeze

- 分支：`feature/stage3-phase8-data-freshness-ui`
- 基线 HEAD：`9d1abc46d9061819ffed2ffe281cd5458c5148e5`
- tree：`35ff3aa988a81031fdfff0ef16b25302ab7c8076`
- parent：`e231a372f7e7fa982e89f098a4972f8f540732fe`
- 基线工作区：clean
- Freeze：`tests/fixtures/synchronization/stage3-phase9-2-18-freshness-ui-freeze.json`
- Freeze SHA-256：`81316546282e94ce4003c3e608f2e1dcf0bb73d8998596fc738a424775693215`
- Freeze 创建后未回写。

## 确定性 RED

测试先于产品实现创建。首个启动命令因受限 Windows PATH 未发现 `vitest`，退出码 `1`，未进入测试；使用工作区固定 Node 与本地 `vitest.mjs` 做唯一等价复验后，两个直接测试文件均因 `/project-galaxy/page.tsx` 与 `supabase-project-freshness-reader.ts` 不存在而在 import 阶段确定性失败，退出码 `1`。这直接固定了修复前 route implementation=0、real reader=0 的产品缺口，未以源码字符串断言替代核心行为测试。

Freeze 中记录 reader 8、page 8、integration 3，共 19 个行为项；最终 page 的 `it.each` 展开为 9 项，因此实际新增分母为 20，未减少或跳过 Freeze 分母，required skip 仍为 0。

## 最小实现与授权路径

### 页面

`src/app/project-galaxy/page.tsx` 提供真实 `/project-galaxy` App Router 页面：

1. 通过 `parseServerEnvironment` 与 `createSupabaseServerClient` 使用 publishable/anon 配置和请求 Cookie 构造 session-scoped client；
2. 先调用 `auth.getUser`，未认证时不查询 Project，显示现有 GitHub 登录入口；
3. 可选 `project` query 必须为规范 UUID；未指定时确定性选择当前用户最近更新且未归档的 Project；
4. 只展示既有 Freshness presentation、最后成功同步、最新 SyncRun 的状态与截断 ID、allowlist 安全错误码；
5. 无可见 Project、环境失败或查询失败均使用不枚举资源的安全状态。

### 读取边界

`SupabaseProjectFreshnessReader` 使用 session client 与既有 RLS，并额外固定：

- `projects.user_id = verified user id`；
- `projects.status != archived`；
- 显式 Project 时同时过滤 Project ID 与 user ID；
- Project 仅选择 `id,updated_at`；
- SyncRun 仅选择 `id,status,finished_at,error_code`；
- 不选择 repository 私密字段、`error_summary`、provider payload 或任何凭据；
- latest run 与 latest successful completed/partial run 分开读取；
- 输入、返回 exact shape 或查询异常均 fail closed 为稳定安全错误。

数据库归属边界来自既有 `projects_select_own`、`sync_runs_select_own` 和 authenticated SELECT；没有新增或绕过 RLS 的 RPC，也没有在 UI/server page 引入 service role。

## GREEN 与回归

| 门禁 | 首轮/最终结果 | 分母与 skip |
|---|---|---|
| 新增 page + reader 直接测试 | PASS | 2 文件，17/17，skip 0 |
| 新增 integration ownership/production boundary | PASS | 1 文件，3/3，skip 0 |
| 新增总分母 | PASS | 20/20，required skip 0 |
| Phase 8 presentation、badge、scope conformance 与 synchronization domain 定向 | PASS | 7 文件，114/114，skip 0 |
| module boundaries 相邻批次首轮 | 环境性失败 | 61/62；固定 10 秒内单项超时，产品断言无失败 |
| module boundaries 唯一等价复验 | PASS | 4 文件，62/62，skip 0 |
| 最终 UI/domain/module 合并定向 | PASS | 7 文件，127/127，skip 0；integration 另计 3/3 |
| 全量 unit `pnpm test` | PASS | 101 文件，1043/1043，skip 0 |
| application integration 首轮 | 环境性失败 | 19 文件；12 passed/7 failed，44 passed/20 skipped/1 failed；Local Supabase 未运行且 CLI telemetry 目录受限 |
| application integration 唯一等价复验 | PASS | 19/19 文件，65/65，required skip 0 |
| Local Supabase pgTAP | PASS | 18/18 文件，570/570 |
| lint | PASS | exit 0，warnings 0 |
| typecheck 首轮 | 环境性失败 | 沙箱 PATH 未发现 Node/tsc，exit 1 |
| typecheck 等价复验与原脚本 | PASS | `tsc --noEmit --incremental false` exit 0；`pnpm run typecheck` exit 0 |
| database lint | PASS | 0 errors |
| database types | PASS | up to date |
| schema drift | PASS | empty |
| production E2E | PASS | Chromium 2/2 |
| `git diff --check` | PASS | 0 errors |

Docker daemon 首轮未运行；启动用户现有 Docker Desktop 后，`pnpm run db:start` 唯一等价复验成功。本地 Supabase 仅用于 application integration、pgTAP 与数据库静态门禁，完成后安全停止。没有连接 staging 或 Production。

production E2E 把 `next-env.d.ts` 临时指向 dev routes；在确认这是本次工具副作用后已精确恢复，最终 SHA-256 为基线值 `08c0e8ff190caa1e1f14688e6b5a0eac94bf956afe4417d8c7469dc8c6479b74`。

## 范围、安全与残余风险

- 实际文件严格属于 Freeze allowlist；历史 Phase 9.2.17 Freeze/evidence、migration、生成类型、`package.json`、`pnpm-lock.yaml`、`next-env.d.ts` 和 demo 根页面指纹不变。
- 强特征 secret/private key/JWT/Cookie/Authorization 值、raw payload 与 provider secret 扫描：0 命中。
- 页面不导入 `commandDeckPreviewFixture` 或任何 demo-data；真实视图 provenance=`real`。
- 远端 Push、部署、GitHub App、测试仓库、Manual Resync、远程数据库写入、Production、付费或 Trial：全部 0。
- 残余验证点仅为后续独立 staging Smoke：用真实已登录会话确认 `/project-galaxy` 非 404，且页面 Freshness、最后成功同步和最新 SyncRun 与已验证后端读模型一致。

## 提交策略

本 evidence 与 Freeze、页面、session-scoped reader 及其直接测试将形成一个独立本地 commit；不 Push。提交后由执行报告记录最终 commit/tree/parent/message 与干净工作区。
