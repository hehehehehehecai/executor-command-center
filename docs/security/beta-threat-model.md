# 公开 Beta 安全威胁模型

## 1. 文档身份与边界

- 合同：`beta-security-boundary.v1`
- 批次：`explorer-stage6-phase4.3-b5896ae3de1b1466`
- 基线：`43e56095e54bbecc640ebd189a68d55794287faa`
- 范围：当前仓库能够落实并由本地合成证据验证的公开 Beta 安全控制。
- 非声明：本文不声称“生产绝对安全”，也不把 GitHub、Vercel 或 Supabase Cloud 控制台中的未知配置写成已缓解。

资产包括 Supabase 会话、Service Role、GitHub App private key/Webhook secret/Installation token、AI provider key、用户项目与 Evidence、能量账本、Webhook lineage、账户删除墓碑和构建供应链。主要信任边界为浏览器→Next.js、GitHub→Webhook、Next.js→Supabase、worker→GitHub/AI、repository text→AI prompt、CI→registry/lockfile。

## 2. 外部入口矩阵

| Route / method | 主体与输入上限 | 原子限流 / 幂等 | 外部调用与安全错误 | 结论 |
|---|---|---|---|---|
| `/api/auth/github` GET | 匿名；可信 return target | OAuth state；匿名权威网络身份需平台确认 | Supabase OAuth；固定 503 | external confirmation required |
| `/auth/callback` GET | provider callback + state/session | provider state/replay | Supabase OAuth；固定错误页 | mitigated |
| `/api/github/installations/start` GET | verified session | `github_repository_mutation` 20/60s | GitHub setup redirect；稳定失败码 | mitigated |
| `/api/github/installations/setup` GET | verified session + one-time state | `github_repository_mutation` 20/60s；state replay closed | GitHub App GET；稳定失败码 | mitigated |
| `/api/github/repositories` GET | verified session | `github_expensive_read` 30/60s | GitHub token/list；稳定 429/5xx | mitigated |
| `/api/github/repository-selections` GET/POST | verified session；POST strict JSON | POST 20/60s；RPC/selection idempotency | GitHub read + Supabase；固定错误 | mitigated |
| `/api/github/repository-selections/:id` DELETE | verified session；numeric ID | 20/60s；same-origin | Supabase/GitHub token lifecycle | mitigated |
| `/api/projects` GET/POST | verified session；strict calibration schema | POST `project_configuration_mutation` 30/60s | Supabase RPC；固定错误 | mitigated |
| `/api/projects/:id/first-sync` POST | verified session；strict JSON | `project_sync_mutation` 10/60s；request ID | Inngest；固定 receipt/error | mitigated |
| `/api/projects/:id/resync` POST | verified session；strict JSON | `project_sync_mutation` 10/60s；request ID | Inngest；固定 receipt/error | mitigated |
| `/api/projects/:id/repository-removal` POST | owner + strong confirmation；8 KiB | `destructive_mutation` 3/3600s；idempotency key | transactional RPC；固定错误 | mitigated |
| `/api/projects/:id/briefs/generate` POST | verified user/project；16 KiB | `project_brief_generate` 5/60s；request key | AI provider after authorization/reservation | mitigated |
| `/api/projects/:id/briefs/:id/follow-up` POST | verified user/brief；16 KiB | `project_brief_follow_up` 20/60s | schema-only AI response | mitigated |
| `/api/account-deletion` GET/POST/DELETE | verified account；strong confirmation | mutation 3/3600s；operation idempotency | local Auth Admin job boundary | mitigated |
| `/api/github/webhook` POST | HMAC-signed GitHub raw bytes；1 MiB | delivery ID + body digest；HMAC precedes parse/DB | Inngest dispatch only after claim | mitigated |
| `/api/inngest` | Inngest signing boundary | Inngest event IDs/retries | bounded worker functions | mitigated |

`src/proxy.ts` 只对已验证会话的目标 route 使用数据库权威计数；`x-forwarded-for`、任意 client header、自然语言或进程内 `Map` 均不参与身份。匿名 OAuth 起点无法在本地仓库内获得不可伪造的网络主体，需在 Phase 8–9 对可信平台 WAF/Firewall 限流做外部确认，不能计入已缓解分母。

## 3. GitHub 最小权限与 Webhook

实际 REST 使用面由 `src/shared/security/github-minimum-permissions.ts` 固定：`metadata/contents/issues/pull_requests/actions/checks` 均为 `read`，无 `write/admin`。10 个 operation 分别覆盖 Installation 查询、token 创建/撤销、仓库列表、commit/issue/PR/release/workflow/check-run 读取；7 个已接收 event 分别映射 `installation/issues/pull_request/push/release/repository/workflow_run`。`src/infrastructure/github/github-installation-token-client.ts` 直接复用该权限常量，避免文档与代码漂移。

Webhook 顺序固定为：HTTP content-type/declared size → 有界 raw byte stream → header shape → raw-byte HMAC `sha256=` constant-time compare → JSON parse → strict event projection → delivery register → dispatch claim → dispatch/complete。Delivery ID 只做幂等，不能替代 HMAC。证据：

- `src/infrastructure/webhooks/github-webhook-http.test.ts`
- `src/infrastructure/webhooks/node-github-webhook-cryptography.test.ts`
- `src/application/webhooks/ingest-github-webhook.test.ts`
- `supabase/tests/0015_github_webhook_delivery_test.sql`
- `supabase/tests/0017_github_webhook_delivery_processing_test.sql`

## 4. RLS、GRANT、RPC 与 Service Role

数据库库存测试 `supabase/tests/0044_beta_security_inventory_test.sql` 的冻结分母为 23 张 public table、23 张启用 RLS、19 条 policy、52 个 public `SECURITY DEFINER` function。所有 definer 固定空 `search_path`，PUBLIC/anon 无执行权；anon 无 direct table grant；authenticated 无 direct mutation grant。新 migration 还撤销了 `users/github_identities/github_installations/github_installation_states` 上历史遗留的 Service Role `REFERENCES/TRIGGER/TRUNCATE`，最终 Service Role direct table grant 为 0，server-side adapter 只调用受限 RPC。

Service Role 的环境变量只在 server-only module、Route Handler 或 server composition 中解析；Client Component 静态扫描禁止 `SUPABASE_SERVICE_ROLE_KEY`、GitHub private key/Webhook secret、Inngest signing key 和 AI key。证据：

- `supabase/migrations/20260826100000_add_beta_security_rate_limit.sql`
- `supabase/tests/0042_beta_security_boundary_test.sql`
- `supabase/tests/0044_beta_security_inventory_test.sql`
- `src/infrastructure/auth/service-role-boundary.test.ts`
- `src/shared/security/security-static-boundaries.test.ts`

## 5. Secret、依赖、日志与错误

`secret-scan.v1` 只从 `git ls-files` 取得 tracked manifest，预先排除 generated/vendor/cache 与 `.pnpm-store/`，规则覆盖 GitHub/AWS/Slack/Stripe/private-key/Supabase service JWT。Finding 只输出 path、rule ID、line 与 SHA-256 fingerprint，不输出命中原文。精确 allowlist 仅有 3 个相同 synthetic private-key fixture fingerprint，分别绑定确切测试路径。

`dependency-audit.v1` 绑定 `pnpm-lock.yaml` 与 production+optional scope，threshold 为 high。Phase 4.1 已把 Next 固定为 `16.3.0` 并消除冻结 10 项 high；Phase 4.3 最终仍需复跑完整 audit 后才能维持 `0 high / 0 critical` 结论。

生产 `console.*` sink 仅存在于 `src/shared/security/safe-log-redaction.ts`。所有 route 日志调用 `writeSafeSecurityWarning`，递归处理 nested object、Headers、Error、cycle、credential/provider body/SQL/stack；HTTP rate gate 使用 `safe-http-error.v1`，其余既有 route 使用固定 public allowlist/fallback，静态测试拒绝 stack、SQL、provider body 和 raw error serialization。

## 6. 多实例原子限流

`app_private.beta_rate_limit_buckets` 只保存 `auth.uid()` 的 SHA-256、枚举 scope、数据库窗口和计数，不保存 IP、email、项目正文或 token。`public.consume_beta_rate_limit(text)` 使用数据库 `statement_timestamp()`、固定 policy、唯一键 UPSERT 和 capped counter；仅 authenticated 可执行，表无 direct grant。

| Scope | 窗口 | 上限 | 目标入口 |
|---|---:|---:|---|
| `project_brief_generate` | 60s | 5 | AI Brief |
| `project_brief_follow_up` | 60s | 20 | AI follow-up |
| `project_sync_mutation` | 60s | 10 | first sync/resync |
| `destructive_mutation` | 3600s | 3 | repository/account removal |
| `project_configuration_mutation` | 60s | 30 | project calibration |
| `github_repository_mutation` | 60s | 20 | installation/selection |
| `github_expensive_read` | 60s | 30 | authorized repository list |

八个真实 dblink connection 对同一 subject/window 并发时只允许 5 个、拒绝 3 个；另一个 subject 独立允许，未出现超发、deadlock、timeout 或跨 subject 干扰。证据：`supabase/tests/0043_beta_rate_limit_concurrency_test.sql`。

## 7. Repository 文本到 AI Prompt

Project Brief 当前不把文档正文发送给 provider，只发送已授权文档的 path/kind/fingerprint；但 project profile、GitHub summary/facts 与 confirmed decision 仍属于不可信 repository-derived text。`untrusted-repository-prompt-input.v1` 在 provider 前完成：

1. canonical JSON 与 UTF-8 总量上限 262,144 bytes；
2. 拒绝 forbidden control/binary 与不良 Unicode；
3. 注入/工具/secret/提示词请求替换为固定 marker；
4. 数据放在独立 `untrustedRepositoryData` envelope；
5. fixed system contract 明确数据不能改变指令、权限、工具或 Secret 边界；
6. provider 输出仍依次经过 JSON parse、Zod schema、Evidence allowlist validation 和 atomic persistence。

证据：`src/domain/project-brief/project-brief-prompt.ts`、`src/domain/project-brief/project-brief-prompt.test.ts`、`src/application/project-brief/generate-project-brief.test.ts`。

## 8. HTTP headers 与 Cookie

`src/proxy.ts` 为每个请求生成 122-bit 以上随机 nonce，并同时写入 forwarded request `x-nonce` 与 response CSP。生产 CSP 使用 nonce + `strict-dynamic`，没有 `unsafe-eval`、wildcard source，且固定 `object-src 'none'`、`frame-ancestors 'none'`；静态 header 还包括 HSTS、DENY、nosniff、strict referrer、Permissions Policy 和 COOP。

Supabase SSR cookie 保持 `SameSite=Lax`、`Path=/`，HTTPS 时 `Secure=true`。`httpOnly=false` 是已接受风险：当前 `@supabase/ssr` 浏览器会话刷新合同需要客户端可写 token cookie；擅自强制 HttpOnly 会破坏现有 SSR/browser refresh。补偿控制为 CSP、same-origin mutation、Secure/SameSite、no-store 与 `getUser()` server verification。证据：`src/infrastructure/auth/supabase-server-client.test.ts`、`src/infrastructure/auth/update-session.test.ts`、`src/proxy.test.ts`。

## 9. STRIDE 威胁登记

| ID | STRIDE | 威胁 / 资产 | 处置 | 状态 | 验证证据 |
|---|---|---|---|---|---|
| T01 | E | 代码请求多余 GitHub write/admin | read-only 常量与 operation matrix | mitigated | minimum permission tests |
| T02 | E | 实际 GitHub App 控制台权限高于代码 | Phase 8 前人工核对 6 个 read + 7 events | external confirmation required | 本文 §3 |
| T03 | S | 伪造/畸形 Webhook 签名 | raw HMAC + constant time | mitigated | webhook crypto tests |
| T04 | D | 超大 Webhook 先分配内存 | declared + streamed 1 MiB gate | mitigated | webhook HTTP tests |
| T05 | R/T | delivery replay/乱序重复副作用 | digest conflict + DB claim/version | mitigated | 0015/0017 |
| T06 | E/I | 跨租户 direct table/RPC | RLS + owner checks + minimal EXECUTE | mitigated | 0042/0044 + prior pgTAP |
| T07 | I | Service Role 进入 client bundle | server-only/static boundary | mitigated | service-role tests |
| T08 | E | definer search_path/PUBLIC execute | empty path + explicit revoke | mitigated | 0044 |
| T09 | I | tracked Secret 提交 | no-value tracked scan + precise allowlist | mitigated | secret scan gate |
| T10 | T | vulnerable production dependency | frozen lock audit high threshold | mitigated | Phase 4.1 + final audit |
| T11 | I | nested error/header/payload 日志泄漏 | centralized recursive redaction | mitigated | safe log tests |
| T12 | I | HTTP 暴露 stack/SQL/provider body | stable reason code/fallback | mitigated | safe error/static tests |
| T13 | D | 匿名 OAuth 起点洪泛 | 需可信平台网络主体/WAF；不信任转发头 | external confirmation required | 本文 §2 |
| T14 | D | authenticated expensive mutation flood | DB time + auth.uid atomic scopes | mitigated | rate policy/0042 |
| T15 | D | concurrent overrun/cross-user blocking | unique UPSERT + dblink control | mitigated | 0043 |
| T16 | E/I | repository prompt injection 请求工具/Secret | sanitize + isolated envelope/system contract | mitigated | prompt tests |
| T17 | D | oversized/binary repository text | UTF-8/control/262 KiB gate | mitigated | prompt tests |
| T18 | T | provider 返回越权字段/伪造 Evidence | strict schema + Evidence allowlist | mitigated | brief schema/evidence tests |
| T19 | E/I | XSS/frame/content sniffing | nonce CSP + security headers | mitigated | header/proxy tests |
| T20 | I | SSR session cookie 可被 client JS 访问 | 保持 SDK 合同，CSP/Secure/SameSite 补偿 | accepted with rationale | cookie regression tests |
| T21 | S/T | 外部平台生产 header/secret/WAF 与 GitHub event 未实际配置 | Phase 8–9 checklist 实际回读 | external confirmation required | 本文 §10 |

状态分布：`mitigated 17`、`accepted with rationale 1`、`external confirmation required 3`、`blocked 0`。

## 10. 外部待确认与残余风险

1. GitHub App 控制台必须实查只有 `metadata/contents/issues/pull_requests/actions/checks: read`，且订阅 event 与代码 7 项一致；未回读前不能声称平台已配置。
2. Vercel/前置代理必须提供可信来源的匿名 OAuth rate limit/WAF 证据；不得把任意 `x-forwarded-for` 当权威主体。
3. Vercel 与 Supabase Cloud 的生产环境变量、Secret scanning、headers、cookie 与 RLS migration 实际状态须在对应发布阶段回读；本批不修改控制台。
4. CSP 允许 inline style 以保持现有 Next/Tailwind 渲染；script 不允许 inline/eval。未来若改用 CSS nonce/hash，可进一步收紧 style。
5. Dependency audit 是时间点证据，必须在 CI 与发布前针对当前 lockfile 重跑。
