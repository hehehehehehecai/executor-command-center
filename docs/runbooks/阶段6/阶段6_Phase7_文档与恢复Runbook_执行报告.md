# 探索者号｜阶段 6｜Phase 7 文档与恢复 Runbook 执行报告

## 1. 编排标识与授权回读

- 启动 ID：`explorer-stage6-6f15e9ac1282cdd4`
- 批次 ID：`explorer-stage6-phase7-20628e72267a46ab`
- 提示词实例 ID：`explorer-stage6-phase7-b9b061c4fd49928c`
- 来源审核票据 ID：`review-ticket-b9b061c4fd49928c`
- 授权策略：`workflow-authorization.v1`
- 仓库：`D:\AI workplace\探索者号`
- 结论范围：仅 Phase 7 文档与恢复 Runbook；未进入 Phase 8。

授权回读结果：本批只修改公开 Beta 文档、Runbook、交叉链接与本报告，运行本地/隔离副本验证并创建一个本地提交。未授权且未执行 push、merge、PR、云端 migration、部署、发布、tag、真实外部资源创建或 Production 操作。

## 2. Pre-Run Freeze

| 项目 | 冻结值 |
| --- | --- |
| baseline HEAD / parent | `b088d344b1541b5c00fb12ef0f78e6e3c952f28c` |
| baseline subject | `fix: close modal focus and landmark gaps` |
| branch | `feature/stage4-bridge-five-panels` |
| origin | `ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git` |
| Git common directory | `D:/AI workplace/探索者号/.git` |
| baseline non-store status | 空字符串，0 字符 |
| baseline status SHA-256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| baseline staged files | 0 |
| migration / pgTAP inventory | 31 个 migration / 44 个 SQL 测试文件 |
| Phase 6.1 报告 SHA-256 | `418b49b498e66bcca779817c8c43ceb0be2c3bb2b8d45ef7992e5723e4e95320` |

`.pnpm-store/` 是阶段前既有非业务目录。本批所有状态检查均通过 pathspec 排除它；未读取其中任何文件正文，未修改、删除、移动、暂存或提交该目录。

## 3. 事实审计与文档边界

文档事实来自当前 `package.json`、`pnpm-lock.yaml`、`.env.example`、应用路由、GitHub adapter/Webhook 注册、Inngest composition、31 个 migration、44 个 pgTAP 文件、Phase 4 威胁模型、Phase 1–6.1 执行报告及本批实际命令。关键冻结事实包括：

- CI 的 Node 权威版本为 `22.22.3`，package manager 为 `pnpm@11.5.0`；本机隔离复现使用 Node `24.19.0` 与精确 pnpm `11.5.0`，形成额外兼容性证据，但不能替代后续 CI 对 Node `22.22.3` 的证据。
- 当前前端为 Next.js `16.3.0` App Router；数据库边界为 Supabase Auth/Postgres/RLS/RPC；外部边界为 GitHub App/Webhook、Inngest、AI Provider 与部署平台。
- GitHub 权限文档只记录代码使用面倒推的六项只读 repository permission 和七类事件，不声称外部 App 控制台已经配置。
- Staging/Production 的域名、回调、Secret、GitHub App、Supabase project、Inngest、AI Provider、Vercel、备份/PITR、告警和漏洞联系人均明确标为 Phase 8/9 的 `external confirmation required`，没有伪造联系人、SLA、发布日期、tag 或发布事实。
- Supabase CLI/local workflow/backup/PITR/restore 使用当前官方指南校准；官方 changelog Markdown 端点读取失败，报告为只读资料获取限制，不据此声称未知外部能力已经验证。

## 4. 八类文档与交叉链接

| 类别 | 路径 | 实际补齐内容 | 仍待确认 |
| --- | --- | --- | --- |
| README | `README.md` | 产品定位、Preview/Connected 边界、功能、技术栈、快速开始、脚本、部署入口、限制 | 外部平台配置与公开 Beta 发布状态 |
| SECURITY | `SECURITY.md` | 支持范围、私密报告待配置、安全边界、Secret/日志/依赖/轮换、响应承诺边界 | 私密报告渠道、责任人与 SLA |
| Architecture | `docs/architecture/overview.md` | 浏览器、Server Route、Service Role、RLS/RPC、GitHub、Inngest、AI、幂等/恢复与信任边界 | 外部 runtime/region 真实配置 |
| Local/Staging/Production | `docs/runbooks/environments.md` | 环境隔离、环境变量、migration、验证、回滚、监控、证据门 | Phase 8/9 外部资源与部署证据 |
| Database Restore | `docs/runbooks/database-restore.md` | 备份前置、停写、恢复顺序、migration/RLS/完整性/Smoke/失败回退 | 云端备份/PITR 可用性与实际演练 |
| Provider Outage | `docs/runbooks/provider-outage.md` | GitHub、Supabase、Inngest、AI、部署平台降级、重试/幂等/退款/恢复 | 外部告警、状态页与 SLA |
| Privacy/Data Lifecycle | `docs/privacy/data-lifecycle.md` | 采集、存储、派生、访问、保留、仓库移除、撤权、七天账户删除、审计墓碑 | 法律文本、地区/监管承诺 |
| CHANGELOG | `CHANGELOG.md` | 以 `Unreleased` 记录真实已完成功能、安全、测试、可访问性、运维文档与限制 | 版本号、日期、tag、Production 发布 |

另对 `docs/runbooks/local-database.md` 做最小事实修正：fresh clone 明确使用 `git -c core.autocrlf=false clone`，避免 Windows CRLF 改写字节级 SHA fixture；未修改数据库逻辑或测试。

本批最终文档一致性检查覆盖 9 个文档文件、27 个相对链接，缺失链接 0。文档命令均对应当前 package scripts 或 Git/Supabase/Docker 标准命令；没有新增脚本或依赖。

## 5. 修改文件与 SHA-256

| 文件 | 处置 | SHA-256（提交前候选内容） |
| --- | --- | --- |
| `README.md` | 重写公开 Beta 入口 | `b518921049aff5086e7b90caf4fca33272074c7f3da9c894803ce0d3b720b059` |
| `SECURITY.md` | 重写安全披露与边界 | `01321fc6deaa56b4fe395d63da51584b2942884bfdb0e884b85b8858387c4b9e` |
| `CHANGELOG.md` | 新增 | `07245e41508af447a16b30b8f1863f015a6c95631dcd4c6032bd204d4006cb07` |
| `docs/architecture/overview.md` | 新增 | `520f64bbd18b400d2e6cd5b9fc0676ba8aa270531de7ef43e6ae8e81a5c0944d` |
| `docs/runbooks/environments.md` | 新增 | `a3d70126e94e596dc4604035347d0080646707e73a05d18998f1f6ef4767b964` |
| `docs/runbooks/database-restore.md` | 新增 | `33c9195214ab0cb58436dea0903244c71818e6b4afc848dbc9896c8a62cbb012` |
| `docs/runbooks/provider-outage.md` | 新增 | `48ccdc81d22c033a1b3dc9c8fc17195ce9cb0346d9506d7e752afd6f905b564c` |
| `docs/privacy/data-lifecycle.md` | 新增 | `b46477fbcb16357a8b4e2a4baa8c2a71676e4853d89faa984402b8bf43f3e45b` |
| `docs/runbooks/local-database.md` | 最小 clone/LF 修正 | `ce86d40f769d2418718360faf4e7f8292e9d30e615f8e584c2d4ac0d19f95c2a` |
| `docs/runbooks/阶段6/阶段6_Phase7_文档与恢复Runbook_执行报告.md` | 新增执行证据 | 本文件最终 SHA 在提交前终态审计记录 |

业务代码、UI、API、migration、seed、database types、RLS/RPC、安全策略、依赖版本和 lockfile 变化均为 0。候选差异（不含本报告）为 9 个文件、611 行新增、59 行删除。

## 6. 干净隔离副本复现

### 6.1 隔离与工具

- 来源：本地 Git baseline `b088d344...`，通过 `--no-local --no-hardlinks` 创建独立 clone，再以 Git index patch 应用本批候选文档；没有复制当前工作树。
- 最终有效 clone：`D:\AI workplace\explorer-phase7-repro-lf-20628e72267a46ab`，创建时使用 `git -c core.autocrlf=false clone`。
- 专用依赖存储：`D:\AI workplace\explorer-phase7-repro-store-20628e72267a46ab`；从未读取或复制仓库 `.pnpm-store/`。
- 初始隐式产物审计：`node_modules`、`.next`、`.env`、`.env.local`、`.pnpm-store` 均不存在。
- 工具：Git `2.54.0.windows.1`、Node `24.19.0`、精确 pnpm `11.5.0`、Supabase CLI `2.109.1`、Docker Engine `29.6.1`。
- 环境：只使用 `.env.example` 名称合同和本地合成 Supabase/Auth/E2E fixture；未读取/复制主工作树 `.env*` 正文。CLI 曾在本地启动输出中显示自动生成的本地开发凭据，本报告没有复制、保存或回显其值。

### 6.2 首次失败、根因与最小修正

| 失败 | 原始结果 | 根因 | 最小修正 / 终态 |
| --- | --- | --- | --- |
| 首次 exact pnpm 调用 | exit 1 | `--store-dir` 放置位置不被 `dlx` 接受 | 使用 `--config.store-dir=<专用目录>` |
| 首次 install | 下载 653/656 后 registry timeout | 公共 registry tarball 超时 | 同一方案只重试一次并延长 fetch timeout；最终 656/656、frozen install exit 0 |
| sandbox 测试 | `EPERM realpath C:\Users\admin` | 受限环境不能解析运行时 home | 通过精确系统审批只运行隔离副本命令；未扩大目录/网络范围 |
| 默认 Windows clone 全量单测 | 182/184 files、1716/1719 tests；2 个 freeze SHA 失败，1 个冷启动 boundary timeout | Git CRLF 转换使两个版本化 JSON 字节变化；冷副本扫描首次超过 10 秒 | 不改测试；文档规定 LF clone，新的 LF 副本聚焦 2 files/71 tests 及全量 184/1719 均通过 |
| 首次 `db:start` | exit 1 | Docker Desktop Linux engine 未启动 | 启动本机 Docker Desktop，engine 就绪后 `db:start` exit 0 |
| CSP 隔离运行首次 sandbox 尝试 | exit 1，`EPERM`；首次审批环境缺少 Node PATH | 同上且审批 shell 未继承 Node 路径 | 显式使用 Codex bundled Node PATH 后 exit 0 |
| 提交前主工作树新鲜全量单测 | 首次 183/184 files、1718/1719 tests；`rejects Domain import react` 在 10 秒上限超时 | staged diff 仅 10 个 Markdown；同一文件独立运行 64/64、该用例所在文件约 2.01 秒完成，证明没有断言或源码回归，属于一次性资源/冷启动耗时 | 不改测试或阈值；只复跑一次完整原命令，终态 184/184 files、1719/1719 tests、exit 0 |

没有通过删除测试、放宽断言、复制现有产物、修改业务代码或使用真实外部账号来消除失败。

### 6.3 隔离副本终态矩阵

| 命令 / 门禁 | 退出码 | 分母 / 结果 |
| --- | ---: | --- |
| exact `pnpm@11.5.0 install --frozen-lockfile --offline` | 0 | 656 packages，reused 656，downloaded 0 |
| `pnpm env:check` | 0 | 1 file / 1 test |
| `pnpm typecheck` | 0 | TypeScript 无错误 |
| `pnpm lint` | 0 | ESLint 无错误 |
| `pnpm security:test` | 0 | 12 files / 55 tests |
| `pnpm test` | 0 | 提交前新鲜终态复跑 184 files / 1719 tests；首次复跑的 1 个超时及诊断链见第 6.2 节 |
| `pnpm db:start` | 0 | 本地 Supabase 开发栈启动 |
| `pnpm db:reset` | 0 | 31 migrations + synthetic seed；无 linked/remote project |
| `SUPABASE_TELEMETRY_DISABLED=1 pnpm test:integration` | 0 | application 21 files / 67 tests；pgTAP 44 files / 1001 tests |
| `pnpm security:secret-scan` | 0 | tracked 724 / scanned 723 / findings 0 / allowlisted 3 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | Next.js 16.3.0 production build；所有 App routes 为动态路由 |
| `pnpm test:e2e:core-journeys` | 0 | 16/16 passed，skip 0 |
| `pnpm test:security:csp-runtime` | 0 | 4/4 routes，40/40 scripts nonce 匹配，errors 0 |

数据库检查同时确认 public inventory 为 23 tables、23 RLS enabled、19 policies、52 `SECURITY DEFINER` functions，Service Role direct table grants 为 0。所有浏览器/provider 边界为本地合成实现，真实 GitHub、AI Provider、Inngest Cloud、Supabase Cloud、Vercel、Production 调用为 0。

### 6.4 清理

隔离复现结束后执行 `pnpm db:stop`，本地容器停止且数据卷保留，属于可恢复状态。随后对三个已解析并确认位于 `D:\AI workplace`、且不等于/不包含目标仓库的精确路径执行清理：两个 clone 与一个专用依赖存储均 `exists=False`。未删除任何用户文件、真实项目数据或仓库 `.pnpm-store/`。

## 7. 主工作树质量门

| 命令 | 退出码 | 分母 / 结果 |
| --- | ---: | --- |
| 文档相对链接检查 | 0 | 9 files / 27 links / missing 0 |
| `pnpm env:check` | 0 | 1 file / 1 test |
| `pnpm typecheck` | 0 | 无错误 |
| `pnpm lint` | 0 | 无错误 |
| `pnpm security:test` | 0 | 12 files / 55 tests |
| `pnpm test` | 0 | 184 files / 1719 tests |
| `SUPABASE_TELEMETRY_DISABLED=1 pnpm test:integration` | 0 | application 21/67；pgTAP 44/1001 |
| `pnpm security:secret-scan`（实现后、报告前） | 0 | tracked 718 / scanned 717 / findings 0 / allowlisted 3 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | Next.js 16.3.0 production build |
| `pnpm test:security:csp-runtime` | 0 | 4 routes / 40 scripts / errors 0 |
| `git diff --check` | 0 | 空白错误 0 |

Build/CSP runner 仅刷新 `next-env.d.ts` 的工作树元数据；其 blob 与 `HEAD` 完全一致，提交前通过 index refresh 消除非业务状态，本批没有提交该文件。

本报告落盘后的最终 Secret scan、`git diff --cached --check`、staged scope 与报告哨兵检查将在第 10 节记录；不存在静默 skip/xfail。主工作树与隔离副本的必需门禁均有实际执行证据。

## 8. 恢复 Runbook 证据与残余风险

- Local：隔离副本实际完成 install、环境合同、Supabase start/reset、单元、集成、build、核心 E2E 与 CSP runtime。
- Staging/Production：只给出后续 Phase 8/9 的资源隔离、migration、验证、回滚、监控和证据门；未执行或伪装外部设置。
- Database Restore：本批验证的是 local migration/reset 重建链路，不是云端 backup/PITR restore 演练。备份可用性、RTO/RPO、维护窗口和云端恢复仍为 `external confirmation required`。
- Provider Outage：恢复/重试/幂等语义按现有实现记录；真实 provider outage、告警路由、状态页和 SLA 未验证。
- Node 版本：隔离副本使用 Node `24.19.0`；CI 声明的 `22.22.3` 留给 Phase 8 实际 CI 复核。这是明确证据边界，不影响本机文档复现结果。
- 官方资料：Supabase changelog Markdown 端点读取失败；已使用官方 CLI/local/backup/PITR/restore 指南，未把无法读取的资料写成已确认事实。

## 9. Git、阶段与禁止动作

- 目标提交消息：`docs: prepare public beta documentation`。
- 本批最终只允许一个本地提交；不 amend/rebase/reset/checkout/clean，不改写历史。
- 提交内容只包括第 5 节的文档与本报告；`.pnpm-store/` staged/committed 为 0。
- 由于 Git commit hash 由包含本报告的完整字节共同决定，提交内文件无法无穷自引用其自身最终 hash。本报告绑定 baseline、branch、树内容与目标消息；实际 final commit / final HEAD 在提交后终态回执中记录并与本报告路径共同交付。
- 未执行 push、merge、PR、云端 migration、Staging/Production 部署、Smoke、tag、Release Notes 发布、Rollback 或监控配置。
- 明确未进入 Phase 8；等待外层独立审核。

## 10. 最终终态审计

本节在报告写入后完成并回读：

- 最终 Secret scan：首次报告落盘后执行 exit 0，tracked 725 / scanned 724 / findings 0 / allowlisted 3；本节回填后按相同命令复跑确认。
- `git diff --cached --check`：提交前执行，目标 exit 0 / whitespace errors 0，并以终态命令输出为准。
- staged scope / `.pnpm-store/`：提交前核验仅 10 个文档文件，业务/配置/schema/依赖文件 0，`.pnpm-store/` staged 0。
- 三个编排标识与唯一末尾哨兵：提交前逐项计数，批次 ID、提示词实例 ID、来源审核票据 ID 均至少准确出现 1 次；哨兵只出现 1 次且为最后一个非空行。
- 报告 SHA-256：报告不能在自身字节内稳定保存自己的 SHA；提交前终态 SHA 与 final commit 由任务终态回执绑定，不伪造自引用值。

## 11. 结论

Phase 7 的八类公开 Beta 文档、交叉链接、恢复 Runbook 和干净隔离副本复现证据已经形成。主工作树和隔离副本必需门禁均已通过；结论在单一本地提交成功后由终态回执绑定。未进入 Phase 8。

<!-- EXECUTION_REPORT_COMPLETE -->
