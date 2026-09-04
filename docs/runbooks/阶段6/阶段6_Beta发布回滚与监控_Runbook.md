# 阶段 6｜Beta 发布回滚与监控 Runbook

## 1. 适用范围

本 Runbook 适用于 `v0.1.0-beta.1` 的 Vercel Production 发布、实际 deployment 回滚/恢复和最低观察窗口。它不授权数据库 reset、旧 migration 修改、seed、破坏性 repair、Staging 操作、付费升级或 Phase 10 工作。

正式域名：`https://executor-command-center.vercel.app`

冻结 RC：`b105e4f89611a865afde507d78377ded9aa0b16c`

冻结上一健康 deployment：`dpl_EatR4yndM8E5q5GuxBNVPSSrkpZH`

## 2. 发布前门禁

1. 确认 PR #27 的 base 为 `main`、head 为冻结 RC 所在分支，且 required checks 全绿。
2. 确认 release-preparation commit 只包含发布文档，不包含用户未提交修改、Secret、`.pnpm-store/` 或运行产物。
3. 运行 lint、typecheck、unit、integration、E2E、build、安全测试、Secret scan、production dependency audit 和 `git diff --check`；记录退出码与测试分母。
4. 只读回读 Production migration 集合、RLS 与危险授权库存；不得访问 Staging 或排除项目。
5. 确认上一健康 deployment 仍为 `READY`，并记录新的 Git-integrated deployment 唯一 ID、commit SHA、tree 和创建时间。

任何 required check、身份、commit/tree、deployment target 或正式 alias 不一致都必须停止发布。

## 3. Production 推广与最低 Smoke

1. 以普通 merge 合并 PR #27，不 rebase、不 amend、不 force push，也不删除分支。
2. 等待 Vercel 为合并后的唯一 `main` head 创建 Git-integrated Production deployment，直到状态为 `READY`。
3. 权威回读 deployment metadata，确认 `target=production`、source 为 Git、commit SHA 等于远端 `main` head，正式 alias 已指向该 deployment。
4. 执行最低 smoke：公开首页 200；OAuth 入口 303；认证态 onboarding 200；五个核心面板 5/5 为 200；未认证敏感 API 预期 401；运行时 error 为 0。
5. smoke 通过后才能创建不可变 tag 和 GitHub prerelease；tag 与 Release target 必须等于同一个 `main` head。

Smoke 只读验证现有授权状态，不创建真实 Issue、Pull Request，不触发真实 AI 生成或业务数据写入。

## 4. 实际回滚与恢复演练

1. 在 Vercel 权威回读确认上一健康 deployment `dpl_EatR4yndM8E5q5GuxBNVPSSrkpZH` 仍为 `READY`。
2. 使用 Vercel 受支持的 rollback/promote 操作把正式 alias 切换到该 deployment；记录平台返回的 operation/deployment identity。
3. 回读正式 alias 的当前 deployment，并执行公开首页、OAuth 入口和一个未认证敏感 API 的最低 smoke。
4. 使用同一平台机制把正式 alias 恢复到本版本的 Git-integrated `main` deployment。
5. 再次回读 alias、commit SHA 与 `READY` 状态，并重复最低 smoke。只有恢复验证通过，演练才算结束。

若平台明确不支持该动作，记录原始错误、账户/计划边界与 `NOT_RUN`；不得用重部署、删除 deployment 或修改数据库伪装成回滚。若回滚成功但恢复失败，立即保持最后一个已验证健康 deployment，并停止 tag/Release 后续动作。

## 5. 观察窗口与证据

发布、回滚和恢复后分别检查：

- Vercel deployment/alias 状态、HTTP 5xx、runtime error 与关键路由状态码；
- Supabase Production 健康、migration 数量、RLS 与危险授权库存；
- OAuth、GitHub Installation、repository loading 与 webhook 的结构化失败码；
- Inngest queue/retry/failure，以及 Energy 预留/退款异常；
- AI Provider、Vercel、Supabase、GitHub 与 Inngest 的调用是否超出本次只读 smoke 边界。

当前 Beta 不新增付费计划。若平台不提供账户级成本或配额明细，只记录“平台未提供可回读数据”，不得把缺失数据写成零成本。发布证据只保存 ID、时间、状态、计数、不可逆 fingerprint 和退出码，不保存 token、private key、cookie、Authorization、PKCE、Provider body、私有仓库正文或个人数据。

## 6. 停止条件

出现以下任一情况立即停止：required check 失败；`main`/tag/Release/deployment SHA 不一致；正式 alias 不唯一；Production smoke 失败；运行时出现未解释 error；回滚点不可用；恢复失败；需要新登录、OTP、Secret、付费升级、不同 RC、Staging/排除项目或破坏性数据库动作。
