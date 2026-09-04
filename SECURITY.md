# 安全政策

## 支持范围

当前安全支持范围是 `v0.1.0-beta.1` 及其 Production 对应提交。未发布、已归档、非维护者分支或第三方修改副本不在承诺范围内。该版本是公开 Beta，不承诺固定安全维护周期、首次响应时间或修复时间。

## 私密报告渠道

目标渠道是 GitHub Private Vulnerability Reporting / Repository Security Advisory：进入仓库 **Security** 页面并选择 **Report a vulnerability**。

如果该入口不可见，请不要改用公开 Issue、Discussion、Pull Request 或 Commit 披露；备用私密联系人目前为**待确认**，不得猜测邮箱或 SLA。

普通 Bug 和不含敏感信息的产品反馈可以提交公开 Issue。

## 报告边界

请在私密报告中提供受影响的功能、Commit/候选版本、最小复现、潜在影响和已采取的缓解措施。日志、截图与请求样本应先移除无关敏感字段。

不要公开或在报告中复制：

- token、API key、private key、cookie、Authorization、Webhook secret 或 Supabase Service Role key；
- 私有仓库正文、Prompt/provider 原始 payload、用户身份或生产数据；
- 可直接扩大影响的完整利用材料、数据库连接串、环境变量值或内部堆栈。

## 响应承诺边界

维护者会在私密渠道完成接收、分级、复现、缓解和修复评估，但当前**不承诺固定首次响应时间、修复时间、奖励或公开披露日期**。报告被接收不代表严重级别、影响范围或方案已确认。联系人、轮值和目标时限需在发布前由维护者确认。

## 当前安全边界

- GitHub 调用由代码合同固定为 `metadata/contents/issues/pull_requests/actions/checks: read`，不申请 write/admin；Production GitHub App 已按最小只读权限和单仓库安装回读。
- Webhook 在解析、数据库与 dispatch 前执行原始字节大小/header/HMAC 校验；delivery ID 只用于幂等。
- public 表启用 RLS，敏感写入经受限 RPC；Service Role 只允许 server-side composition 使用。
- server-only secret 禁止进入 `NEXT_PUBLIC_*`、客户端 bundle、日志或 HTTP 错误。
- 生产依赖审计门槛为 high，Secret scan 只报告路径、规则和不可逆 fingerprint，不回显命中值。
- Repository 文本是 Prompt 中的不可信数据，不能改变 system contract、权限或工具边界。
- 严格 CSP nonce、安全 header、SameSite/Secure cookie 补偿与数据库原子 Rate Limit 已由本地测试覆盖。

完整威胁、证据与残余风险见 [公开 Beta 威胁模型](docs/security/beta-threat-model.md)。

## Secret 泄漏处置

1. 停止传播，不把值粘贴到公开渠道、AI 上下文或普通日志。
2. 在相应 Provider 撤销或轮换凭据；删除文本或 Git commit 不能使已泄漏凭据重新安全。
3. 检查 Git 历史、构建日志、部署平台、Webhook/worker 日志和第三方服务的暴露范围。
4. 更新对应环境，验证旧值失效、新值可用，并确认浏览器 bundle/响应不含 server-only secret。
5. 运行 `pnpm security:secret-scan`、相关安全测试与 production build；只保存低敏证据。

## 依赖与密钥轮换

- 依赖变更必须保持 lockfile、运行 `pnpm audit --prod --audit-level high --json` 和完整回归，不得用 ignore 或降级严重度掩盖发现。
- GitHub App private key、Webhook secret、Supabase Service Role、Inngest signing/event key 与 AI key 必须按 Provider 的先增后切换/撤销能力制定窗口；仓库只保存变量名。
- Dependabot、平台 Secret scanning、WAF、长期告警和密钥轮换日历的完整自动化状态不在本 Beta 的已确认范围内；不得据此声称外部安全控制全部完成。

## 安全事件最低记录

只记录 request/operation ID、安全 reason code、时间、状态、不可逆 fingerprint 和影响计数。禁止把凭据、cookie、SQL、stack、provider body、仓库正文或个人信息复制进事件记录。
