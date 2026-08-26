# 探索者号｜阶段 6｜Phase 4 安全加固｜执行报告

## 1. 编排标识与结论

- 批次 ID：`explorer-stage6-phase4-2e4bfea2a360dbc3`
- 提示词实例 ID：`explorer-stage6-phase4-238c72616a3fa8ea`
- 审核票据 ID：`review-ticket-238c72616a3fa8ea`
- 授权策略：`workflow-authorization.v1`
- 基线提交：`43e56095e54bbecc640ebd189a68d55794287faa`
- 目标仓库：`D:\AI workplace\探索者号`
- 结论：**Phase 4 未完成（dependency audit blocker）**

授权信封已回读并严格按 A/B/C 类边界执行。本次只进行了本地只读审计、必要的本地数据库对象查询、公共 registry 的只读 dependency audit，以及本 blocker 报告写入。没有修改代码、配置、migration、测试或 lockfile，没有安装或升级依赖，没有创建 commit。

阻塞原因：冻结 lockfile 对应的 production dependency audit 发现 `10 high / 0 critical` advisory，命令退出码为 `1`。修复至少需要升级直接依赖 `next` 及/或影响其传递依赖解析的直接依赖，而本批明确禁止安装或升级依赖。Exit Criteria 明确要求 high/critical 为 0，否则以 blocker 停止；因此不得继续实现后伪装为完成。

## 2. Baseline 与状态冻结

| 项目 | 冻结值 |
|---|---|
| HEAD | `43e56095e54bbecc640ebd189a68d55794287faa` |
| 分支 | `feature/stage4-bridge-five-panels` |
| origin | `ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git` |
| repository root | `D:\AI workplace\探索者号` |
| Git common directory | `D:\AI workplace\探索者号\.git` |
| linked worktree | `false` |
| tracked manifest SHA-256 | `8835be96641cd9a0cf4a7048bf9237eca35c19ac366924bebc8673075091d381` |
| tracked files | `674` |
| baseline status SHA-256 | `990b3d3e3d3966dad5bff69ffd1bf85f67434752a14ddd0e212a96d5770f81af` |
| baseline status characters | `371742` |
| baseline status lines | `2055` |
| tracked change lines | `0` |
| `.pnpm-store/` related untracked lines | `2055`（含 Git 对超长递归路径加引号后的 27 条；全部路径仍位于 `.pnpm-store/`） |

`git status --porcelain=v1 -uall | Out-String` 的 UTF-8 字节哈希按提示词要求冻结。Git 对 `.pnpm-store/` 内递归缓存映射给出 `Filename too long` / `No such file or directory` 警告；没有删除、修改、暂存、提交或直接读取该目录的文件内容。所有业务扫描以 `git ls-files` 为分母，排除了未跟踪缓存。

## 3. 开始前只读安全审计

### 3.1 外部入口矩阵

仓库有 15 个 API route 文件、21 个 HTTP method 入口。

| 入口类 | 主体/边界 | 当前输入边界 | 幂等/副作用 | 当前本地 Rate Limit | 审计结论 |
|---|---|---|---|---|---|
| `GET /api/auth/github` | 匿名入口；Supabase OAuth state/PKCE | query/origin 由现有 adapter 校验 | 跳转 GitHub OAuth | 无 | 需限流；外部 OAuth 设置待确认 |
| Installation start/setup | 已验证 Supabase session；GitHub App | state、return target、installation ID 有稳定校验 | 注册/校验 installation | 无 | 服务端 secret 边界已存在；需限流 |
| Repository list/selection | 已验证 session、所有权、origin | selection 写入口使用 schema；部分路径直接 `request.json()`，无统一 byte cap | 选择/取消具稳定错误 | 无 | 需统一 body cap 与限流 |
| GitHub Webhook | `x-hub-signature-256` + raw bytes | use case 限制 1 MiB；HTTP adapter 先无界 `arrayBuffer()` | delivery DB 幂等、claim/complete | 无 | HMAC 顺序正确；存在 HTTP 内存 DoS 缺口 |
| Inngest GET/POST/PUT | Inngest SDK signing boundary | SDK 管理 | job retry/idempotency | 无本项目限流 | provider 配置待确认 |
| Project calibration | 已验证 session、origin | schema 有字段长度；HTTP body 无统一 byte cap | service RPC | 无 | 需 body cap 与限流 |
| First Sync / Resync | 已验证 session、项目所有权、origin | JSON/schema；HTTP body 无统一 byte cap | request identity + DB 幂等 | 无 | 需 body cap 与限流 |
| Brief generation/follow-up | 已验证 session、项目所有权、origin | 16 KiB bounded reader + schema | Energy reservation + idempotency | 无 | 输入 body 已有界；昂贵入口需原子限流 |
| Repository removal | 已验证 session、所有权、强确认、origin | 8 KiB bounded reader + schema | DB transaction + idempotency | 无 | 破坏性合同已存在；需限流 |
| Account deletion GET/POST/DELETE | 已验证 session、origin、强确认 | POST/DELETE 直接 `request.json()` | operation/idempotency/七天状态机 | 无 | 需 body cap 与限流 |

当前外部错误大多只返回稳定 code，未发现 route 直接回显 SQL、stack 或 provider body；但没有统一的 `safe-http-error.v1` 序列化门，也没有覆盖嵌套 error/header/body 的集中测试。

### 3.2 GitHub operation/event → 最小权限

代码侧发现 10 个 GitHub REST operation，未发现 GraphQL mutation、Git 写入、repository write 或 admin operation。

| operation | resource | 最小权限 | level |
|---|---|---|---|
| `GET /app/installations/{id}` | App installation | App 身份固有读取 | read/inherent |
| `POST /app/installations/{id}/access_tokens` | installation token | App 身份固有；token 权限必须受安装授权限制 | inherent |
| `POST /installation/token` | installation token exchange | 已授权 installation | inherent |
| `GET /installation/repositories` | repository metadata | Metadata | read |
| `GET /repos/{owner}/{repo}/commits` | commits | Contents | read |
| `GET /repos/{owner}/{repo}/issues` | issues | Issues | read |
| `GET /repos/{owner}/{repo}/pulls` | pull requests | Pull requests | read |
| `GET /repos/{owner}/{repo}/releases` | releases | Contents | read |
| `GET /repos/{owner}/{repo}/actions/runs` | workflow runs | Actions | read |
| `GET /repos/{owner}/{repo}/commits/{ref}/check-runs` | checks | Checks | read |

支持的 7 个 Webhook event 为：`installation`、`push`、`issues`、`pull_request`、`release`、`workflow_run`、`repository`。代码使用面不需要 write/admin 权限；真实 GitHub App 控制台当前授权值未被访问，结论为 `external confirmation required`，不能声称外部设置已最小化。

### 3.3 Webhook HMAC、Replay 与顺序

真实控制流为：HTTP raw body → headers 传入 → use case byte cap / header shape → HMAC `sha256=` 格式与常量时间比较 → JSON parse → payload schema → register delivery → claim → dispatch → complete。

已存在控制：

- `NodeGitHubWebhookCryptography` 对原始 `Uint8Array` 计算 HMAC-SHA256，并使用 `timingSafeEqual`；
- 缺失、畸形或不匹配签名在 JSON parse、数据库和 dispatch 前失败关闭；
- delivery ID 只用于数据库幂等，不替代签名；
- 相同 delivery 的 duplicate/conflict、dispatch lease 与 complete 状态已有持久化合同；
- installation 乱序/重放由 Phase 2/2.1 的 revoked 单向状态与数据库锁收敛。

已确认缺口：`github-webhook-http.ts` 在进入 1 MiB use case 上限前执行 `request.arrayBuffer()`，无 `Content-Length` 预拒绝和 bounded stream reader。攻击者可让 HTTP adapter 先分配超大 body，再得到 413；因此 `github-webhook-verification.v1` 尚未完整成立。

### 3.4 RLS / GRANT / RPC / Service Role

本地数据库只读查询结果：

| 检查 | 结果 |
|---|---:|
| `public` tables | 23 |
| RLS enabled | 23 / 23 |
| `SECURITY DEFINER` functions | 51 / 51 |
| 固定空 `search_path` | 51 / 51（逐对象输出均为 `search_path=""`） |
| anon RPC EXECUTE | 0 / 51 |
| authenticated RPC EXECUTE | 7 / 51 |
| service_role RPC EXECUTE | 44 / 51 |
| anon direct INSERT/UPDATE/DELETE | 0 / 23 |
| authenticated direct INSERT/UPDATE/DELETE | 0 / 23 |
| service_role direct SELECT/INSERT/UPDATE/DELETE | 0 / 23 |

authenticated 的 7 个 RPC 仅为账户申请/取消、Energy 查询/预留/消费/释放和 generation outcome；其余后台、Webhook、同步、清理 RPC 只授予 `service_role`。服务端密钥通过 `parseServerEnvironment` 与 server-only adapters 传递；现有静态测试禁止 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 和 Client Component 导入 service-role factory。真实部署环境变量作用域仍需 Supabase/Vercel 控制台人工确认。

### 3.5 Secret 来源与扫描边界

服务端 secret 名称包括 `SUPABASE_SERVICE_ROLE_KEY`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_WEBHOOK_SECRET`、`INNGEST_EVENT_KEY`、`INNGEST_SIGNING_KEY`、`DEEPSEEK_API_KEY`。代码扫描未发现 `NEXT_PUBLIC_*` service-role/private/provider secret。

本次临时只读扫描只遍历 674 个 tracked files，使用 5 条高置信规则；没有读取 `.env*` 实际值或 `.pnpm-store/`。发现 3 个 `PRIVATE KEY` marker，均位于明确的合成测试 fixture：

- `src/app/api/github/repositories/route.test.ts:58`，安全指纹 `a18b8ba4c79bf869`；
- `src/app/api/inngest/inngest-route-dependencies.test.ts:4`，安全指纹 `d0742de1c841a99e`；
- `src/shared/configuration/environment-contract.test.ts:35`，安全指纹 `5510bddb28c45b89`。

未输出匹配原文。仓库目前没有可复现的 tracked Secret scanning gate、精确 allowlist artifact 或 CI step，因此 `secret-scan.v1` 仍是缺口；上述临时扫描不能替代正式 gate。

### 3.6 Dependency / lockfile

| 项目 | 冻结值 |
|---|---|
| package manager | repository declares `pnpm@11.5.0`; audit runtime `pnpm 11.19.0` |
| lockfile SHA-256 | `a087993aad1ff9993627e09050e70d61d22fcc2e9c33909074b52b00528c8eef` |
| direct production dependencies | 7 |
| unique production graph（本地 list） | 322 |
| audit metadata production + optional denominator | 319 |
| audit output fingerprint | `7b75ebe3d4c16fa5077fbfa411381c19c48dc59363d01153ca847676c00a3244` |
| high | 10 |
| critical | 0 |
| audit exit | 1 |

High advisory 安全清单（不含 advisory 正文）：

| advisory ID | module | current | audit 提供的 patched range | 依赖链 |
|---|---|---|---|---|
| `1124066` | `sharp` | `0.34.5` | `>=0.35.0` | `next@16.2.10 → sharp` |
| `1124170` | `next` | `16.2.10` | `>=16.2.11` | direct |
| `1124171` | `next` | `16.2.10` | `>=16.2.11` | direct |
| `1124184` | `next` | `16.2.10` | `>=16.2.11` | direct |
| `1124192` | `next` | `16.2.10` | `>=16.2.11` | direct |
| `1124252` | `postcss` | `8.4.31` | `>=8.5.12` | `next → postcss` |
| `1130589` | `brace-expansion` | `2.1.2` | `>=2.1.3` | `inngest → OpenTelemetry → ... → brace-expansion` |
| `1130736` | `brace-expansion` | `2.1.2` | `>=2.1.4` | 同上 |
| `1139427` | `nanoid` | `3.3.16` | `>=3.3.18` | `next → postcss → nanoid` |
| `1139510` | `postcss` | `8.4.31` | `>=8.5.18` | `next → postcss` |

最小后续决策点：另开获准升级依赖的独立批次，至少评估 `next >=16.2.11`，并通过 lockfile override 或上游依赖升级把 `sharp >=0.35.0`、`postcss >=8.5.18`、`nanoid >=3.3.18`、`brace-expansion >=2.1.4` 纳入 resolved graph。不能仅修改 manifest 范围，必须重新生成 lockfile、复跑 production audit 与全量回归。

### 3.7 Log / Error

生产 route 中识别到 10 个 `console.warn` sink。现有代码普遍通过 allow-listed failure record 记录 operation/request/failure code/status，不记录 provider body；认证日志已有 `auth-log-redaction.v1`。测试/fixture scripts 另有固定低基数 `console.error`，`scripts/run-e2e.mjs` 会直接输出 caught error，但该脚本不是生产请求路径。

缺口：没有统一 `safe-log-redaction.v1` 对嵌套 `Error`、headers、body、provider payload 和循环对象做集中处理；各 route 自建敏感字段正则，容易产生规则漂移。没有运行构建产物 secret/bundle 扫描。

### 3.8 Rate Limit

仓库只映射 GitHub/AI provider 返回的 429，没有本项目权威的 `rate-limit.v1` 控制。没有数据库原子窗口表/RPC，也没有外部共享限流器；因此 authenticated mutation、昂贵 AI、同步和匿名 OAuth 入口在多实例部署中均无本地有界速率控制。

进程内 `Map` 未被误用，但可用控制分母为 0。匿名端点可信平台派生身份、NAT 风险与清理策略也尚未形成合同。

### 3.9 README/docs/仓库文本 → AI Prompt

唯一已连接的 Project Brief provider 流程使用固定 system prompt、canonical JSON envelope、Zod structured output 与 evidence validation。当前 evidence snapshot **不包含 GitHub 文档正文**，只包含文档 path、kind 和 fingerprint；因此背景中的“文档正文直接进入 Brief Prompt”与当前实现不一致。

但是以下仓库/用户来源字符串会进入 canonical snapshot：project goal/status/blocker、commit message、issue/PR title、release name/tag、workflow metadata、document path/kind、confirmed decision。当前仅做换行/NFC normalize 和非空检查，没有统一总字节上限、字段长度上限、NUL/控制字符/无效文本拒绝，也没有把 untrusted segment 显式标为“数据而非指令”的 `untrusted-repository-prompt-input.v1` 合同。因此 Prompt injection 和超长输入防护未完整成立。

### 3.10 CSP / headers / Cookie / safe error

`next.config.ts` 仅配置 dev origin 与 logging ignore，没有生产 CSP、HSTS、frame、content-type、referrer 或 permissions policy。`src/proxy.ts` 只执行 Supabase session refresh，没有 nonce/header contract。

Supabase SSR cookie 当前为：`path=/`、`SameSite=Lax`、仅 HTTPS 时 `Secure=true`、`httpOnly=false`。`httpOnly=false` 与 `@supabase/ssr` 浏览器/服务端共享会话及 token refresh 的当前适配方式相关，不能在没有 session refresh 回归证据时强改。缺口是缺少生产环境 cookie/header 自动化合同与 CSP nonce。

## 4. 初步 STRIDE 威胁判定

由于 dependency blocker 在实现前触发，未创建 `docs/security/beta-threat-model.md`；路径、SHA-256 均为 `N/A`。以下为报告内只读初步模型，不能替代 Exit Criteria 要求的完整 threat model。

| ID | 类别 | 资产/边界 | 判定 | 证据/缺口 |
|---|---|---|---|---|
| TH-01 | Elevation | GitHub App permissions | external confirmation required | 代码只需 read/inherent；控制台未核验 |
| TH-02 | Spoofing | Webhook HMAC | mitigated | raw bytes + sha256 + timing-safe，parse/DB 前 |
| TH-03 | DoS | Webhook HTTP body | blocked | HTTP adapter 无界读取后才进入 1 MiB gate |
| TH-04 | Replay | Webhook delivery | mitigated | DB register/claim/complete + stable delivery identity |
| TH-05 | Elevation | public DB/RPC | mitigated | RLS 23/23；definer/search_path 51/51；最小 grants |
| TH-06 | Information disclosure | deployment secrets | external confirmation required | 代码 server-only 边界存在；外部 env scope 未核验 |
| TH-07 | Information disclosure | tracked secrets | blocked | 临时扫描无真实 finding，但无正式 gate/allowlist/CI |
| TH-08 | Tampering/DoS | dependency supply chain | blocked | production audit 10 high，退出码 1 |
| TH-09 | Information disclosure | logs/errors | blocked | 分散 allowlist；无集中 nested redaction |
| TH-10 | DoS/Abuse | public/expensive APIs | blocked | 0 个本地多实例原子 rate-limit control |
| TH-11 | Tampering | repository text → AI | blocked | fixed system/schema 已有；untrusted input bounds/marking 缺失 |
| TH-12 | Tampering/Disclosure | browser response | blocked | CSP/HSTS/frame/content-type/referrer/permissions 缺失 |
| TH-13 | Session theft | SSR cookies | external confirmation required | Lax/path/conditional Secure；需生产 refresh 回归与部署确认 |
| TH-14 | Information disclosure | HTTP errors | blocked | 多数稳定 code；无统一 serializer 与 nested leak test |

状态分布：`mitigated 3`、`accepted with rationale 0`、`blocked 8`、`external confirmation required 3`。

## 5. Pre-Run Freeze、合同、case 与 lineage

冻结合同版本：

- `beta-security-boundary.v1`
- `github-minimum-permissions.v1`
- `github-webhook-verification.v1`
- `service-role-boundary.v1`
- `secret-scan.v1`
- `dependency-audit.v1`
- `safe-log-redaction.v1`
- `rate-limit.v1`
- `untrusted-repository-prompt-input.v1`
- `http-security-headers.v1`
- `safe-http-error.v1`

由于 dependency gate 在首次写红灯测试之前失败，新攻击 case 文件、新 migration、新测试 SHA、Rate Limit case 身份、Prompt injection fixture 和 header/cookie fixture 均为 `N/A（未创建）`。旧测试通过记录没有被当作本批新攻击 case 的执行证据。

Dependency lineage：

`lockfile a087...8eef → production graph 319（audit metadata）/322（unique local list） → pnpm audit 11.19.0 → advisory IDs → high=10 → exit=1 → dependency upgrade required → policy forbids upgrade → Phase 4 blocked`

## 6. 本批实际修改

只新增本执行报告：

- `docs/runbooks/阶段6/阶段6_Phase4_安全加固_执行报告.md`

未创建 `docs/security/beta-threat-model.md`；未新增 migration、security module、config、script、test 或 artifact；未修改 `package.json`、`pnpm-lock.yaml`、`.github/`、`next.config.ts`、`src/` 或 `supabase/`。

## 7. Target-specific metrics

| 目标 | numerator / denominator / unit | 结果 |
|---|---|---|
| GitHub operation 最小权限映射 | 10 / 10 operations | 代码使用面全部可映射为 read/inherent；外部配置 N/A |
| 冗余 write/admin 调用 | 0 / 10 operations | 0 |
| Webhook 无效签名接受 | N/A（本批测试未运行） | 代码审计显示先验签；不冒充本批通过 |
| Replay 重复副作用 | N/A（本批测试未运行） | 现有 DB 合同存在；不冒充本批通过 |
| public RLS | 23 / 23 tables | enabled |
| definer pinned search_path | 51 / 51 functions | empty search path |
| direct client DML | 0 / 23 tables | anon/authenticated 均为 0 |
| tracked secret scan | 674 / 674 files；5 rules | 3 synthetic fixture markers；真实 finding 0；正式 gate 缺失 |
| production dependency audit | 319 dependencies | high 10、critical 0、exit 1 |
| log sinks with central redactor | 0 / 10 production console sinks | 缺口 |
| endpoint scopes with authoritative local rate limit | 0 / N/A | 分母未在 blocker 后人为冻结；明确缺口 |
| untrusted Prompt flows with v1 boundary | 0 / 1 provider flow | 缺口 |
| Prompt injection provider calls/side effects | N/A | 新攻击测试未运行 |
| route methods with global security header contract | 0 / 21 method entries | 缺口 |
| safe centralized HTTP error serializer | 0 / 1 global contract | 缺口 |
| 跨租户成功 / 控制组变化 | N/A | 本批 pgTAP 未运行，不复用旧绿灯充当证据 |

不得据此计算“总体安全分数”，也不能声称“生产绝对安全”。

## 8. 命令、退出码、审批与失败记录

| 命令/检查 | 退出码 | 结果 |
|---|---:|---|
| `git status --porcelain=v1 -uall | Out-String` + UTF-8 SHA-256 | 0 | baseline 冻结；tracked clean；仅 `.pnpm-store/` 噪声 |
| `git rev-parse` / remote / worktree | 0 | 仓库身份与基线匹配 |
| `supabase status -o json`（sandbox） | 1 | Docker pipe 权限拒绝；未据此判定数据库状态 |
| `supabase status -o json`（系统审批后） | 0 | 本地服务运行；该工具会输出本地开发凭据，报告未复制任何值，后续停止使用详细模式 |
| 本地 Postgres RLS/RPC/GRANT 只读查询 | 0 | 23 tables、51 functions 矩阵 |
| tracked 高置信 Secret 临时只读扫描 | 0 | 674 files、5 rules、3 synthetic markers、无值回显 |
| `pnpm list --prod --depth Infinity --json`（sandbox） | 1 | `ERR_SQLITE_ERROR: unable to open database file` |
| 同命令（系统审批后） | 0 | 322 unique production packages；graph fingerprint `5721cc46b68b4fd1bcc4bfaa796696ef28752d40fe22c6406314badfd36c972f` |
| `pnpm audit --prod --audit-level high --json` | 1 | **10 high / 0 critical；Exit Criteria blocker** |
| `pnpm why next sharp postcss brace-expansion nanoid --prod` | 0 | 依赖链与 current version 归因完成 |

失败记录：

- case：`DEP-AUDIT-001`
- contract：`dependency-audit.v1`
- boundary：`pnpm-lock.yaml → production dependency graph → public advisory registry`
- 预期：high=0、critical=0、exit=0
- 实际：high=10、critical=0、exit=1
- side effect：0；未修改 manifest/lockfile/node_modules
- 可重试起点：获批独立 dependency upgrade 批次完成 lockfile 更新后重新运行
- Exit Criteria 影响：核心阻塞，Phase 4 不能完成

## 9. 未运行项

在 blocker 后按“零扩张停止”未运行以下命令，均不得记为通过：

- `pnpm env:check`：未运行
- `pnpm typecheck`：未运行
- `pnpm lint`：未运行
- `pnpm test`：未运行
- `pnpm test:integration`：未运行
- `pnpm test:e2e:auth-fixture`：未运行
- `pnpm test:e2e:connected-panels`：未运行
- `pnpm db:reset`：未运行
- `pnpm db:test`：未运行
- `pnpm db:lint`：未运行
- `pnpm db:types`：未运行
- `pnpm db:types:check`：未运行
- `pnpm db:drift:check`：未运行
- `pnpm build`：未运行
- 新安全聚焦测试：未创建、未运行
- 正式 tracked Secret scan gate：未创建、未运行

没有 skip/xfail；原因不是把失败隐藏，而是 dependency Exit Criteria 已确定不可在授权范围内修复。

## 10. 外部待确认与残余风险

External confirmation required：

1. GitHub App 控制台实际 repository/account permissions 与订阅 events；目标值只能是第 3.2 节的 read/inherent 集合。
2. Vercel/Supabase 环境变量作用域、Preview/Production 隔离和 Service Role 不进入客户端构建。
3. HTTPS/HSTS、可信转发身份、cookie Secure、CSP nonce 与 Inngest signing 的真实部署行为。
4. Dependabot 是否在目标分支启用、分支保护是否强制安全 CI gate。

残余高风险包括：10 个 high dependency advisory、Webhook 无界 HTTP body、无多实例原子 Rate Limit、无正式 Secret scan gate、无统一 log/error redaction、仓库文本 Prompt boundary 不完整、生产安全响应头缺失。

## 11. Git 与禁止动作声明

- 本地 commit：`N/A（核心 Exit Criteria 未满足，不创建“完成”提交）`
- 最终 HEAD：仍为 `43e56095e54bbecc640ebd189a68d55794287faa`
- 最终 Git status：`2059` 行；其中 `2058` 行位于 `.pnpm-store/`，另 1 行为本报告；tracked status 为空
- 本报告写入后，Git 通过 `.pnpm-store/v11/projects/...` 的既有递归项目映射额外显示 3 条同名报告镜像路径；这是根仓库报告写入在阶段前缓存拓扑中的映射结果，未对这些缓存路径执行直接写入、删除、整理、暂存或提交
- 未 push、merge、创建 PR、部署或发布
- 未修改 GitHub/Vercel/Supabase Cloud/Production 或任何外部控制台
- 未使用真实 GitHub、真实 AI、真实用户或真实 Secret
- 未安装或升级依赖，未修改 lockfile
- 未修改任何既有 migration，也未新增 migration
- 未对 `.pnpm-store/` 执行直接文件读取、写入、整理、删除、暂存或提交；上述 3 条镜像状态已如实保留，未尝试清理
- 未 amend、reset、clean 或改写历史
- 未进入 Phase 5–10

## 12. 最终判定与所需输入

**Phase 4 未完成。**

需要编排者提供一个明确授权“升级依赖并更新 lockfile”的独立修复批次，至少覆盖第 3.6 节五个受影响模块和 10 个 high advisory。该批通过 `pnpm audit --prod --audit-level high` 后，才可恢复同一 Phase 4 安全加固的红灯测试、实现、完整 threat model、全量质量门与单一完成 commit。

当前批次到此停止，明确未进入 Phase 5。

## 13. Phase 4.3 恢复实施终态（2026-08-26）

恢复批次 ID：`explorer-stage6-phase4.3-b5896ae3de1b1466`；提示词实例 ID：`explorer-stage6-phase4.3-5bd133038ca2999a`；审核票据 ID：`review-ticket-5bd133038ca2999a`。

原第 1–12 节保留了 Phase 4 首次运行因 10 个 high advisory 失败关闭的原始证据。该 blocker 随后按独立授权分两步闭环：

- Phase 4.1 将 `next` 升至 `16.3.0` 并精确更新 lockfile；production + optional audit 从 `10 high / 0 critical` 收敛为 `0 high / 0 critical`。
- Phase 4.2 只修复 `0035` 随日期失效的固定完成时间并重新生成数据库类型；默认 integration、`db:reset` 后数据库 41 文件/963 项以及类型门恢复全绿。
- Phase 4.3 批次 `explorer-stage6-phase4.3-b5896ae3de1b1466` 恢复安全主实施，完整证据见 `docs/runbooks/阶段6/阶段6_Phase4.3_安全加固主实施恢复_执行报告.md` 与 `docs/security/beta-threat-model.md`。

Phase 4.3 新增或落实：GitHub 最小权限静态合同；Webhook 1 MiB 有界 raw-byte/HMAC 门；RLS/GRANT/RPC/Service Role 库存测试；无敏感值回显的 tracked Secret gate；集中递归日志脱敏与安全 HTTP 错误；数据库权威、多实例原子、按 `auth.uid()` 隔离的七类 Rate Limit；不可信 repository Prompt 数据包络；nonce CSP/HSTS/frame/nosniff/referrer/permissions/COOP；CI 安全门和完整 STRIDE 威胁模型。

最终本地证据：

- unit：184 文件/1715 项，全绿；最终安全聚焦：12 文件/54 项，全绿；
- integration：应用 21 文件/67 项，数据库 44 文件/1001 项，全绿；
- E2E：auth fixture 1/1、connected panels 8/8、完整 E2E 14/14；
- 数据库：reset、lint、types、types check、drift 均通过；public table RLS 23/23，Service Role direct table grant 0；
- dependency audit：244 production + 77 optional，所有 severity 均为 0；
- Secret scan：699 tracked、698 scanned、无未处置 finding，3 个精确 allowlist 项均为合成 private-key 测试边界且不回显原文；
- build：Next.js `16.3.0` production build 通过。

威胁模型登记 21 项：`mitigated 17`、`accepted with rationale 1`、`external confirmation required 3`、`blocked 0`。外部 GitHub App 权限/event、匿名 OAuth 平台 WAF，以及 Vercel/Supabase Cloud 的生产配置仍须在对应发布阶段实际回读，不得由本地证据冒充已配置。

**最终结论：Phase 4 本地仓库范围完成。** 首次提交封装 `873a96c018ca4f090bf47565c290c87ffe00d9f1` 的显式新文件清单曾遗漏本批新增的 `src/proxy.test.ts`（SHA-256 `55b31cf06d856df8335da2bc23e4ee6527c1a35d498a76d15cd1115bc5bdf961`）；同批续执行指令明确要求完成该批次后，仅对尚未 push 的本地 tip 进行一次最小修正 amendment，把遗漏测试与两份报告终态纳入同一个最终 commit。未创建第二个业务提交，未 push、PR、部署、Production 操作或 Phase 5 实施。

<!-- EXECUTION_REPORT_COMPLETE -->
