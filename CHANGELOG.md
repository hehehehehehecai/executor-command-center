# Changelog

本文件记录 EXECUTOR 的可审计仓库能力。Phase 9 完成前不声明 Production release、tag、正式版本号或发布日期。

## [Unreleased] — Public Beta candidate

### Added

- Preview/Connected Onboarding 与 Project Galaxy、Flight Log、Mission Control、Decision Archive、Copilot 五面板。
- GitHub App 安装、仓库选择、项目校准、First Sync、Webhook 增量同步、每日对账与 Manual Resync。
- 用户确认的项目状态、Action Suggestion / Issue Draft、Decision Record 与 Evidence Link。
- 结构化 Project Brief/follow-up、Evidence 校验、缓存等价、Energy/Quota 预留与 Provider failure refund。
- Repository data removal / project subtree deletion、Installation revocation、七天可撤销账户删除与 retry-exhausted recovery。
- 核心用户旅程、本地 Supabase/pgTAP、Connected fixture 与 production CSP runtime 测试。

### Security

- GitHub read-only minimum-permission contract；raw-body Webhook HMAC、payload 上限、delivery replay/乱序幂等。
- public RLS、最小 GRANT/RPC、server-only Service Role、数据库原子 Rate Limit。
- tracked Secret scan、production dependency audit、递归日志脱敏和稳定安全错误。
- Repository Prompt 不可信输入隔离、结构化输出与 Evidence allowlist。
- 请求/响应同 nonce CSP、安全响应头与 Supabase SSR cookie 回归。

### Changed

- Production dependency graph 升级到 Next.js `16.3.0`，冻结 audit high/critical 为 0（仍需每次发布重跑）。
- HTML route 为严格请求级 CSP nonce 动态渲染。
- 完成键盘、focus containment、landmark、reduced motion、移动端响应式和状态语义打磨。

### Documentation

- 补齐 README、SECURITY、Architecture Overview、环境发布、数据库恢复、Provider outage 与 Privacy/Data Lifecycle Runbook。

### Known limitations

- GitHub App、Vercel、Supabase Cloud、Inngest、AI Provider 的真实 Staging/Production 配置、WAF/匿名 OAuth 限流、监控与告警仍需 Phase 8–10 验证。
- GitHub 能力只读；Issue Draft 不自动发布，不修改源码或仓库。
- 不支持团队、支付、BYOK、多模型、完整源码/Diff 扫描或公开项目页。
- 没有已确认的正式版本、发布日期、Production SLA、隐私/安全联系人或通用数据保留期限。
