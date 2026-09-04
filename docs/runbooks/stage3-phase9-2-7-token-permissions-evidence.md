# Phase 9.2.7 GitHub installation token 活动读取权限最小修复证据

## 身份与基线

- 批次：explorer-stage3-phase9-2-7-token-permissions-c507acbe
- prompt：explorer-stage3-phase9-2-7-installation-token-permissions-c507acbe
- 来源票据：sha256:c507acbeefd8dd5e0c3a666307d799caff88f42749296a47e4e87e815e5f2783
- blocker：sha256:b1c5c01511e4e68883cf107df1dd9845a04d39a209ff23c5b37b3772dff91d46，轮次 1/5
- 基线 commit/tree/parent：8e56ae8acea20ee5f556925a82064b32149aa4ab / fb7a96c9256b1d87aa54f99e1825d00f77a383ee / 9e07c7bf288f6d0aaa3818a0cc2a9e81a557b220
- origin/staging：9e07c7bf288f6d0aaa3818a0cc2a9e81a557b220
- 初始工作区：干净

## 不可回写 Freeze

- 路径：tests/fixtures/synchronization/stage3-phase9-2-7-token-permissions-freeze.json
- SHA-256：a1cb97633ed952a5ab8095ad5d1495eb2785c5254c72e54185e19f380f0eba7d
- 创建时间：2026-08-11T07:07:09.768Z；创建后未回写。

## 根因与最小设计

既有 GitHubInstallationTokenClient.create 对全部调用都发送 metadata-only。授权仓库列表需要该档位；First Sync、Project Sync、Reconciliation 还需要 contents、issues、pull_requests、actions。修复保留 create 为 metadata-only，新增 infrastructure 专用 createActivity，Application 不持有 GitHub 权限字符串。

| 路径 | 精确权限 | 响应校验 |
| --- | --- | --- |
| 授权仓库列表 | metadata: read | 保持既有合同 |
| 同步活动读取 | metadata/contents/issues/pull_requests/actions: read | 五项全部精确为 read |

两种请求均不含 repositories、repository_ids 或 write；仓库范围继续由 installation selected repositories 控制。

## TDD 与门禁

RED：焦点用例 1 个失败、27 个未筛选、退出码 1；唯一失败为 createActivity is not a function。RED 前产品源码未修改。

GREEN 与回归：

- 焦点 1/1；直接 35/35；相邻定向 155/155；
- 五项权限逐一缺失 5/5 拒绝；write 降级被拒绝；
- metadata-only 精确请求、无 repositories/repository_ids/write 均有行为断言；
- pnpm test：99 文件、1000/1000、skip 0；
- 应用集成：18 文件、62/62、skip 0；
- pgTAP：17 文件、529/529、skip 0；
- lint、typecheck、db lint、db types、db drift 全通过；
- production E2E：2/2、skip 0；git diff --check 通过。

## 失败与安全复验

1. 首次静态门禁使用不存在的 bundled pnpm 路径；无副作用，改用只读发现的 fallback。
2. typecheck 首次因沙箱禁止写 tsconfig.tsbuildinfo 退出 2；精确审批后同一检查退出 0。
3. 应用集成首轮因 Local Supabase 未运行及 telemetry 写权限退出 1；启动本地服务后同一门禁 62/62。
4. E2E 自动改写 next-env.d.ts；确认来源后精确恢复，指纹不变。
5. 内置补丁工具未能写该仓库；确认无半写后使用同一精确 patch，范围未扩大。
6. 首次范围审计误把列表包装成嵌套数组，退出 21；修正后范围 6/6、秘密 0、diff 与 Freeze 通过。
7. evidence 首次经 Windows 管道生成时中文编码损坏；产品、测试、Freeze 未受影响。删除未提交损坏副本后以 UTF-8 重建并复验。

Local Supabase 仅在本机启动、验证并停止。CLI 工具显示的本地演示值未复制到 evidence、fixture、源码或报告。

## 受保护边界与结论

- package.json：f9a6ab717fa98c452d290a69374e30b00b09b23f5253699d9900c935dd349468
- pnpm-lock.yaml：a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef
- next-env.d.ts：4e4da12aa061aac172fb1bcb48e9b6e4b293080d2f494327925fdba8f39632ac
- migration tree：f28fb75265d04f66347b4eca72061dceb327be3d
- Phase 9.2.6 证据、migration、数据库类型、状态机、Reader、UI、Provider 配置未修改。
- 强特征 secret、private key、GitHub token、JWT、Cookie、Authorization 值为 0 命中。
- GitHub/Vercel/Inngest/远程 Supabase 调用、Push、PR、Release、Workflow、部署、远程数据库写入均为 0。

metadata-only 与 activity-read 已在 infrastructure 分离；同步三条路径共享 activity provider。required skip 为 0，具备独立 staging 重试代码前提；本批未执行 staging。