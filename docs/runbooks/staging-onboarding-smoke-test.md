# Staging Connected Onboarding Smoke Test Runbook

状态：`NOT_RUN_REQUIRES_HUMAN`

本 Runbook 只供获得批准的人工执行者核验已部署的 Staging 版本。它不启动本地 Fixture，不是 CI 脚本，也不得由自动化任务代替真人操作真实 GitHub UI。

## 目的与准入

本次 Smoke Test 验证从 GitHub 登录、GitHub App installation、授权仓库列表、人工仓库选择到项目校准和项目创建的完整 Staging 用户旅程。

开始前必须同时满足：

- [ ] 目标 PR 的全部受保护 CI 已通过，未绕过保护规则。
- [ ] 已记录 `DEPLOYMENT_ID`、`STAGING_BASE_URL` 和完整 40 位 `DEPLOYMENT_COMMIT_SHA`。
- [ ] 已记录 `PR_HEAD_SHA`，适用时同时记录 `MERGE_COMMIT_SHA`。
- [ ] 使用平台或 Git 提供的权威只读字段，证明 deployment commit 等于 PR head、等于合成 Merge Commit，或与目标版本存在可重复验证的 Git 关系。
- [ ] `VERSION_BINDING_PROOF` 包含查询命令/API、关键原始字段、查询时间和结果，不以 URL 名称、页面内容或部署时间作推断。
- [ ] 执行者、资产负责人、安全或平台审批人已明确。

无法独立证明 deployment 与目标版本绑定时，停止并将 `FINAL_STATUS` 记为 `BLOCKED`。Preview/Staging URL 可访问、页面正常或 E2E 通过都不能替代版本绑定证据。

## 专用测试资产

只允许使用以下隔离资产：

- 专用 GitHub 测试账号 A：执行主旅程。
- 专用 GitHub 测试账号 B：验证跨用户 RLS/ACL 隔离。
- 专用测试组织，或经批准且与日常个人空间隔离的测试空间。
- 至少一个公开测试仓库和一个私有测试仓库；内容必须为虚构数据，不含公司代码、客户数据或个人真实资料。
- 专用 Staging GitHub App/OAuth 配置，不得复用生产 installation。

建议命名：`stg-onboarding-user-a`、`stg-onboarding-user-b`、`stg-onboarding-public-fixture`、`stg-onboarding-private-fixture`。资产登记需包含负责人、批准人、用途、创建日期、到期日期和轮换日期；账号凭据、installation 授权和仓库内容至少按组织安全策略定期轮换，任务结束后由负责人复核。

不得使用公司仓库、客户仓库、员工日常账号、公司组织、个人真实私有仓库、生产 GitHub App installation 或生产数据。禁止把测试仓库伪装成业务仓库。

## 前置条件与秘密管理

部署管理员只核对配置类别，不在本 Runbook 中填写真实值：

- 应用公开 Origin 与 Staging 回调 Origin。
- Supabase Staging URL、anon key 和受保护的 server-side service role 配置。
- GitHub OAuth Client ID/Client Secret 与精确 redirect URI。
- GitHub App ID、slug、Private Key、REST API version 和 installation 回调配置。
- 平台日志、request/correlation ID 查询权限。

所有凭据必须来自已批准的 secret manager 或部署平台受保护配置。不得把 token、cookie、密码、Private Key、client secret 或可复用会话复制到终端历史、截图、PR 评论、Issue、聊天、测试日志或本文件。证据只记录资产 ID、脱敏 request/correlation ID 和受控证据位置。

出现以下任一情况立即停止：权限范围高于只读元数据所需最小权限；redirect URI 不精确匹配；installation 对专用账号不可见；Webhook 出现未知来源或生产目标；需要访问禁止资产；页面或日志暴露凭据；无法定位版本；需要绕过 CI/分支保护；RLS/ACL 负向测试意外成功。

## 逐步 Smoke Test

每一步都填写 `PASS`、`FAIL` 或 `BLOCKED`，并记录不含敏感数据的证据位置与备注。任一步失败后不得继续包装为整体通过。

1. [ ] 记录执行人、开始时间、`STAGING_BASE_URL`、`DEPLOYMENT_ID`、deployment provider ID、完整 commit SHA、PR 编号和版本绑定证据。预期：权威字段完整且关系可重复核验。
2. [ ] 用专用 GitHub 测试账号 A 打开 Staging 并完成 GitHub 登录。预期：应用身份建立，回到同源 Onboarding，日志无 token/cookie。
3. [ ] 在尚未安装 App 时核对状态。预期：登录身份存在，但 installation 明确为未登记，仓库访问未加载，没有 selected repository 或 project。
4. [ ] 从应用入口安装或连接专用 Staging GitHub App installation，只授权专用测试资产。预期：installation 与账号 A 绑定，身份和 installation 是两条独立记录。
5. [ ] 加载已授权仓库。预期：仅显示该 installation 授权的公开/私有专用仓库；未授权仓库、公司仓库和其他账号仓库均不出现。
6. [ ] 在不点击仓库前核对没有默认选择，再人工选择指定测试仓库。预期：只有显式点击后产生一个有效 selection，刷新后仍一致。
7. [ ] 按 Phase 6 合约填写核心目标、当前阶段目标、六值状态和可选阻碍。预期：必填、首尾空格、空白、枚举和 2000 UTF-16 code units 边界保持不变。
8. [ ] 保存项目校准并创建项目。预期：页面显示稳定 Project ID；记录绑定账号 A、当前 installation、显式选择的仓库和校准字段；刷新后不增殖。
9. [ ] 退出账号 A，使用专用测试账号 B 登录并尝试读取、修改或复用账号 A 的 installation、selection、calibration 和 project。预期：RLS/ACL 与服务端所有权校验全部阻断，且响应不泄露资产存在性或敏感字段。
10. [ ] 回到账号 A，在 GitHub 专用测试 installation 中撤销一个测试仓库授权，再尝试选择该仓库。预期：实时授权校验失败，撤权仓库不能持久化，既有其他数据不被覆盖。
11. [ ] 重新授权同一专用测试仓库并刷新应用。预期：恢复后可再次人工选择；不存在重复有效 selection、重复 active project 或错误复用 archived 数据。
12. [ ] 复核最终状态与审计记录。预期：一个用户/installation/selection/project 的 lineage 可核验；没有同步、Issue、GitHub 写操作或禁止资产访问。
13. [ ] 为每一步填写结果、时间、脱敏 request/correlation ID、截图或日志受控路径和备注；核对证据不含凭据。

建议步骤记录表：

| 步骤 | 结果 | 时间 | 证据位置 | 脱敏备注 |
|---|---|---|---|---|
| 1–13 | `PASS/FAIL/BLOCKED` | ISO-8601 | 受控存储引用 | 不含正文和凭据 |

## 失败处理

任一步为 `FAIL` 或 `BLOCKED` 时立即停止后续验收，保留现状并记录：失败步骤、发生时间、deployment ID/commit、脱敏 request/correlation ID、截图或日志路径、实际结果与预期结果。不得重试来覆盖首轮证据，不得修改生产或 Staging 数据来伪造通过。

环境错误与产品错误分开标注，但两者都不能记为通过。权限不足、未知 installation、redirect URI 错误、版本绑定缺失、远程服务不可用或安全边界异常均应升级给对应的平台管理员或安全负责人。

## 清理与回滚

普通执行者只可清理明确标记的专用测试数据；以下操作需资产负责人确认，涉及部署、环境变量、GitHub App/OAuth、组织权限或凭据时必须由平台管理员/安全负责人批准：

1. 从专用测试 installation 移除测试仓库授权，确认目标均为测试资产。
2. 归档或删除本次专用测试 Project/selection，保留必要的脱敏审计证据。
3. 经资产负责人确认后移除测试 installation。
4. 在 secret manager 或部署平台撤销并轮换本次使用的测试凭据，不复制旧值。
5. 清理专用测试账号的临时会话和虚构数据，更新资产登记与 `CLEANUP_STATUS`。

禁止自动删除非测试资产，禁止用通配符、未知 owner 或未核验 ID 执行清理。

仅当已部署版本自身导致阻塞性或安全性回归，且发布负责人确认有已验证的上一版本时，才按平台批准流程回滚部署。若问题仅是测试资产、临时权限或已定位的应用缺陷，则保持版本不动，修复并重新部署后使用一套新的时间戳、deployment ID 和证据集重测；不得复用旧 PASS。

## 证据清单与结论模板

将以下模板复制到受控证据系统；不得填入 secret、token、cookie、目标/阻碍正文或私有仓库内容：

```text
STAGING_BASE_URL=<approved staging URL>
DEPLOYMENT_ID=<provider deployment ID>
DEPLOYMENT_COMMIT_SHA=<40-character SHA>
PR_NUMBER=<number>
PR_HEAD_SHA=<40-character SHA>
MERGE_COMMIT_SHA=<40-character SHA or NOT_APPLICABLE>
VERSION_BINDING_PROOF=<authoritative query, timestamp, key fields and relation>
EXECUTOR=<approved human executor ID>
STARTED_AT=<ISO-8601>
FINISHED_AT=<ISO-8601>
ACCOUNT_ASSET_IDS=<dedicated test asset IDs only>
STEP_COUNTS=<total/pass/fail/blocked>
FAILED_STEPS=<step numbers or NONE>
EVIDENCE_LOCATIONS=<approved controlled-storage references>
CLEANUP_STATUS=<COMPLETE/PARTIAL/BLOCKED with owner>
FINAL_STATUS=<PASS/FAIL/BLOCKED>
```

`FINAL_STATUS=PASS` 仅在 13 个必测步骤全部通过、版本绑定可独立核验、未使用任何禁止资产、没有 RLS/ACL 越权、证据完整且清理状态明确时成立。其他情况只能为 `FAIL` 或 `BLOCKED`。

本仓库内 Phase 7 只交付 Fixture E2E 和本 Runbook；真实 Staging Smoke Test 保持 `NOT_RUN_REQUIRES_HUMAN`，不得据此宣称阶段2最终远程验收通过。
