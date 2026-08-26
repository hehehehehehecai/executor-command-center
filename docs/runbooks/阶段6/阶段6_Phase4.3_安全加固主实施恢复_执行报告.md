# 探索者号｜阶段 6｜Phase 4.3 安全加固主实施恢复｜执行报告

## 1. 标识、授权与结论

- 批次 ID：`explorer-stage6-phase4.3-b5896ae3de1b1466`
- 提示词实例 ID：`explorer-stage6-phase4.3-5bd133038ca2999a`
- 审核票据 ID：`review-ticket-5bd133038ca2999a`
- 授权：`workflow-authorization.v1`
- 项目/阶段：探索者号／阶段 6／Phase 4.3
- 仓库：`D:\AI workplace\探索者号`
- baseline：`43e56095e54bbecc640ebd189a68d55794287faa`
- 结论：**Phase 4 本地仓库范围完成，等待独立审核；未进入 Phase 5。**

本批只执行本地安全实现、合成测试、数据库 migration、审计、报告和一个本地 commit。未 push、PR、部署、发布、修改外部控制台或操作真实 Secret/用户/业务数据。

## 2. Baseline 与 Pre-Run Freeze

| 项目 | 冻结值 |
|---|---|
| HEAD / branch | `43e56095e54bbecc640ebd189a68d55794287faa` / `feature/stage4-bridge-five-panels` |
| origin | `ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git` |
| Git common dir | `D:\AI workplace\探索者号\.git` |
| status SHA-256 | `dd6a96a12c64c5595fd9bf43795d5aa86fbd54712df000fe5642065dc91a93be` |
| status chars / nonempty lines | `375840` / `2070` |
| `.pnpm-store/` paths | `2064`，阶段前未跟踪缓存噪声 |
| tracked manifest | `674` files；SHA-256 `1ab8b55efa5b7629487a94feaf20b995b62d1356475d43e64264f5f842603751` |
| package / lock SHA | `9acba67c...d4f2`（开始时） / `48686081...a05` |
| Phase 4.2 `0035` SHA | `4376225eddc898b974ced449c3f0b52ea48a36ea1fc50df094f0647036226edb` |
| Phase 4.2 report SHA | `4a8a8e1d5e3507ed81f993d4d67b32ff65c63cf33284389f6964a933a3573f28` |

开始时 staged 为 0。继承并纳入本批唯一提交的授权差异是 Phase 4.1 的 `package.json`/`pnpm-lock.yaml`、Phase 4.2 的 `0035`/生成类型以及 Phase 4、4.1、4.2 报告。未直接读取、写入、删除、整理 `.pnpm-store/`；仅按 Git 状态合同观察路径名，最终显式确认 staged/committed 为 0。

版本化冻结夹具：`tests/fixtures/security/stage6-phase4-3-pre-run-freeze.json`，初始 SHA-256 `b07ae871e1122f425151e94f53f1c7e6ea38731bae0a7d0c7e2297d67249a5df`。首次安全测试中将无限 `ReadableStream` 夹具修正为有限 3×512 KiB；这是测试夹具错误修正，不改变 1 MiB 合同、攻击身份或分母。最终报告保留该纠正记录，没有回写初始哈希来掩盖历史。

## 3. 开始前安全审计与矩阵

完整外部入口、GitHub permission/event、Webhook、RLS/GRANT/RPC、Secret flow、日志、Rate Limit、Prompt、header/cookie/error 矩阵见 `docs/security/beta-threat-model.md`，SHA-256 `dfaaaf75cd74c05ee882cdbf398b4d868a515ee4c913275955bf9ab446f6e506`。

关键冻结事实：

- 16 类 HTTP 入口；昂贵/变更型 authenticated route 当时无项目权威多实例限流。
- 10 个 GitHub REST operation、7 个已接收 event；代码只需 `metadata/contents/issues/pull_requests/actions/checks: read`，无 write/admin。
- Webhook 已在 JSON/DB 前做 raw-byte HMAC，但 HTTP adapter 先无界 `arrayBuffer()`，存在内存 DoS 缺口。
- public table 23 张全部启用 RLS；既有 `SECURITY DEFINER` 均固定空 `search_path`，但四张早期表存在 Service Role 非 DML direct grant。
- 10 个生产 route `console.warn` sink 分散实现，无统一 nested redaction。
- Brief 未传文档正文，但 profile/activity/decision 属 repository-derived 不可信文本；缺少总量、控制字符和指令隔离合同。
- `next.config.ts` 未形成生产安全响应头合同；SSR cookie 的 `httpOnly=false` 是 Supabase SSR/browser refresh 兼容边界，不能凭经验强改。

## 4. 合同与实现

本批绑定并测试：`beta-security-boundary.v1`、`github-minimum-permissions.v1`、`github-webhook-verification.v1`、`service-role-boundary.v1`、`secret-scan.v1`、`dependency-audit.v1`、`safe-log-redaction.v1`、`rate-limit.v1`、`untrusted-repository-prompt-input.v1`、`http-security-headers.v1`、`safe-http-error.v1`。

### 4.1 GitHub 与 Webhook

- `github-minimum-permissions.ts` 把 10 个 operation 和 7 个 event 映射为只读权限，installation token client 复用同一常量并校验返回权限。
- Webhook HTTP adapter 按 content-type、声明大小、1 MiB 有界 raw stream、实际长度顺序检查；未经 HMAC 的字节不进入 parse/DB/dispatch。
- HMAC 保持 `sha256=`、原始字节、常量时间比较；delivery ID 只做数据库幂等，重放副作用为 0。

### 4.2 数据库与 Rate Limit

新增 forward-only migration：`supabase/migrations/20260826100000_add_beta_security_rate_limit.sql`，SHA-256 `9467767c7b0745fb45adac2c93695db6dfc9549186603164e622d13fab88d1f7`。

- `app_private.beta_rate_limit_buckets` 只保存 `auth.uid()` 的 SHA-256、枚举 scope、DB 窗口和 capped counter。
- `consume_beta_rate_limit(text)` 由数据库 `statement_timestamp()`、唯一键 UPSERT 和固定 policy 原子计数；只授予 authenticated EXECUTE，表无 direct grant。
- 七类 scope 分别覆盖 Brief、follow-up、sync、破坏性操作、project configuration、GitHub mutation 与昂贵读取。
- 统一锁/唯一键在 8 个 dblink 竞争下只允许 5、拒绝 3；另一 subject 不受影响。
- migration 撤销四张早期表的历史 Service Role `REFERENCES/TRIGGER/TRUNCATE`，最终 direct table grant 为 0。

### 4.3 Secret、依赖、日志与安全错误

- `scripts/secret-scan.mjs` 只使用 `git ls-files`；generated/vendor/cache/`.pnpm-store/` 预先排除，finding 只输出 path/rule/line/不可逆 fingerprint。
- 精确 allowlist 3 项均绑定合成 private-key 测试路径和同一安全 fingerprint；不包含原文。
- `safe-log-redaction.ts` 递归处理 object、Headers、Error、cycle、敏感键值与长字符串；生产 `console.*` sink 只剩该集中出口。
- `safe-http-error.ts` 只允许稳定 public code，fallback 不序列化 SQL、stack、provider body、cookie、Authorization 或原始异常。
- CI 新增 Secret scan、production dependency audit 与安全合同测试。

### 4.4 Prompt、Headers 与 Cookie

- repository-derived text 被放入独立 `untrustedRepositoryData` envelope；固定 system contract 禁止其改变指令、权限、工具或 Secret 边界。
- UTF-8 canonical payload 上限 262144 bytes；拒绝 binary/forbidden control/bad Unicode；注入、工具或 Secret 请求替换为固定 marker。
- provider 输出仍经过 JSON、Zod schema、Evidence allowlist 与原子持久化。
- `src/proxy.ts` 每请求生成 nonce并向 request/response 绑定 CSP；production 不含 `unsafe-eval` 或 wildcard，固定 `object-src 'none'`、`frame-ancestors 'none'`，并增加 HSTS、DENY、nosniff、referrer、permissions、COOP。
- SSR cookie 保持 `SameSite=Lax`、`Path=/`、HTTPS `Secure`；`httpOnly=false` 作为 Supabase SSR/browser refresh 的已接受风险，以 CSP、同源 mutation、Secure/SameSite、no-store 和 server `getUser()` 补偿。

## 5. 红灯、修复与失败记录

| case | 红灯/失败 | 最小修复与终态 |
|---|---|---|
| `WEBHOOK-OVERSIZE-01` | 首次 TS 聚焦暴露无界读取；初始无限 stream fixture 导致 OOM | 修正为有限攻击流；adapter 在 1 MiB 后中止，413，HMAC/DB/dispatch 0 |
| `PROMPT-INJECTION-01` | 2 项失败：无 untrusted envelope/指令隔离 | byte/control/sanitize/envelope/system contract 后通过 |
| `RATE-GATE-01` | update-session 缺少 DB 原子门 | authenticated subject + RPC；429/Retry-After，DB 失败 503 fail-closed |
| `DB-SECURITY-01` | `0042` 因表/RPC 不存在在 2/14 后失败 | 新 migration；最终 0042–0044 为 38/38 |
| `DB-MIGRATION-FIXTURE` | 新 migration/test 依次暴露 `extract` 限定、`current_time` 关键字、`least` 限定、uncorrelated lateral 问题 | 只修新 migration/测试；未改旧 migration、未放宽断言 |
| `BRIEF-CONTRACT-REGRESSION` | 首次全量 unit 1 项仍期待旧 `canonicalEvidenceSnapshot` | 更新既有测试为 `untrustedRepositoryData`；聚焦 36/36、全量 1715/1715 |

所有失败均使用合成数据。未打印 Secret、未通过删除 case、提高阈值、放宽 CSP/RLS/allowlist 或吞错取得绿色。

续执行封装验证中，`pnpm exec vitest run src/proxy.test.ts` 因当前 fallback pnpm 无法解析 `vitest` 可执行文件而退出 1；这发生在测试进程启动前，不是测试断言失败。随后使用仓库标准 `pnpm test -- src/proxy.test.ts`，脚本将参数解释为全量 unit，最终 184 文件/1715 项全部通过，包含 `src/proxy.test.ts`。该命令级失败与安全替代均保留，未把退出 1 写成通过。

## 6. 修改文件分类

- Phase 4.1/4.2：`package.json`、`pnpm-lock.yaml`、`supabase/tests/0035_installation_revocation_concurrency_gate_test.sql`、生成的 `database.types.ts`。
- 安全配置/CI：`.github/workflows/ci.yml`、`next.config.ts`、`package.json`。
- 核心安全模块：`src/shared/security/*`、`src/proxy.ts`、`src/infrastructure/auth/update-session.ts`。
- Webhook/GitHub/Prompt：对应 HTTP adapter、token client、Brief prompt 与使用方测试。
- 日志接入：auth callback、GitHub installation/repository/selection、projects、first-sync、repository-removal routes。
- 数据库：一条新 migration、`0042`–`0044` 三个独立 pgTAP 文件、生成类型。
- Gate/证据：Secret scan script/test、精确 allowlist、冻结夹具、威胁模型、Phase 4/4.1/4.2/4.3 报告。

构建/E2E 自动改写的 `next-env.d.ts` 已用明确补丁恢复到本批开始前内容，不进入最终 diff。未修改任何既有 migration。

## 7. Lineage 与 Target-specific metrics

Lineage：

`case/request → trust boundary → auth.uid/tenant → control/reason → side-effect count → safe receipt`

`document fingerprint → bounded untrusted segment → untrusted-repository-prompt-input.v1 → schema/evidence validation → safe persisted fields`

| 目标 | numerator / denominator / unit | 结果 |
|---|---|---|
| GitHub operation 映射 | 10/10 operations | 均 read/inherent；write/admin 0；未映射 0 |
| Webhook event 映射 | 7/7 events | 权限/event 静态合同通过 |
| 无效/畸形/改写/超大 Webhook | 4/4 attack classes | 接受 0；pre-HMAC side effect 0 |
| replay | 1 stable delivery | 重复副作用 0 |
| public RLS | 23/23 tables | enabled |
| Service Role direct table privilege | 0/23 tables | 0 |
| public SECURITY DEFINER | 52/52 functions | 空 search_path；PUBLIC/anon execute 0 |
| Rate concurrency | 8 same-subject requests | allowed 5、denied 3、overshoot 0 |
| Rate control subject | 1 control subject | 跨 subject 干扰 0 |
| tracked Secret | 3 allowlisted synthetic markers | 未处置 finding 0；敏感原文输出 0 |
| production dependency | 244 production + 77 optional | high 0、critical 0；其他 severity 0 |
| production console sink | 1 central sink | 分散 sink 0；敏感 marker 泄漏 0 |
| Prompt attack classes | injection/secret/tool/oversize/binary | 越权工具/Secret 传播 0；不合规 provider side effect 0 |
| HTTP/CSP | nonce + 8 security headers/directives | `unsafe-eval` 0、wildcard 0、frame/object 放行 0 |
| threat registry | 21 threats | mitigated 17、accepted 1、external 3、blocked 0 |

零样本：生产外部控制台实际权限/WAF/header/env 配置在本地不可核验，记为 `N/A / external confirmation required`，未写成 100%。不计算“总体安全分数”，不声称生产绝对安全。

## 8. Secret 与 Dependency 审计

- Secret tool：仓库自带 Node script，合同 `secret-scan.v1`；规则/allowlist SHA-256 `1f975c7d61c041d742771f01f766f61b9c2e3f04af873f4ff3c2e6b2d3a126f0`。
- 最终暂存后 denominator：699 tracked files，698 scanned，3 allowlisted synthetic markers，finding 0，退出码 0；不输出命中原文。
- Dependency tool：`pnpm audit --prod --audit-level high --json`；lock SHA-256 `486860816c0dd48be09d62711cb35350703601c7c4c4a64b72fa89fe6ed5ea05`。
- 分母：244 production、77 optional、321 total；info/low/moderate/high/critical 均为 0，退出码 0。

## 9. 全部命令与门禁

| 命令 | 退出码 | denominator / 结果 |
|---|---:|---|
| `pnpm env:check` | 0 | 1/1 |
| `pnpm typecheck` | 0 | TypeScript noEmit |
| `pnpm lint` | 0 | ESLint，warnings 0 |
| `pnpm security:test` | 0 | 12 files / 54 tests |
| `pnpm test` | 0 | 184 files / 1715 tests |
| `pnpm exec vitest run src/proxy.test.ts` | 1 | fallback pnpm 命令解析失败；测试未启动 |
| `pnpm test -- src/proxy.test.ts` | 0 | 参数触发全量 unit；184 files / 1715 tests，包含 proxy CSP case |
| `pnpm test:integration` | 0 | app 21/67 + DB 44/1001 |
| `pnpm test:e2e:auth-fixture` | 0 | 1/1 |
| `pnpm test:e2e:connected-panels` | 0 | 8/8 |
| `pnpm test:e2e` | 0 | 14/14 |
| `pnpm db:reset` | 0 | 全 migration chain，含 `20260826100000` |
| `pnpm db:test` | 0 | 44 files / 1001 tests |
| `0042`–`0044` 聚焦 | 0 | 3 files / 38 tests |
| `pnpm db:lint` | 0 | findings 0 |
| `pnpm db:types` | 0 | 标准生成完成 |
| `pnpm db:types:check` | 0 | generated current |
| `pnpm db:drift:check` | 0 | drift empty |
| `pnpm audit --prod --audit-level high --json` | 0 | all severity 0 |
| `pnpm build` | 0 | Next.js 16.3.0 production build |
| `pnpm security:secret-scan` | 0 | 699/698/3/0 |

E2E 开发服务器报告 React 调试 `eval()` 被 CSP 拒绝；生产 build 通过且 production CSP 未加入 `unsafe-eval`。无 skip/xfail。Supabase/Docker、registry 与浏览器命令按 B 类授权使用精确系统审批；没有审批拒绝，也没有用替代命令冒充默认门禁。

## 10. 外部待确认与残余风险

1. GitHub App 控制台实际权限只能是六类 read 权限，订阅 event 只能与七项代码事件匹配；当前未读取控制台。
2. 匿名 OAuth 起点必须在可信平台 WAF/Firewall 使用不可伪造的网络身份限流；本地不信任 `x-forwarded-for`。
3. Phase 8–9 必须实际回读 Vercel/Supabase Cloud 的 Secret scope、生产 migration、CSP/HSTS/Cookie 与 header；本批不能声称已配置。
4. CSP 为 Next/Tailwind 保留 inline style，script 不允许 inline/eval；这是记录的残余风险。
5. Dependency audit 是当前 lockfile 的时间点证据，CI 与发布前必须重跑。

## 11. Git、提交与禁止动作

- 首次封装 commit `873a96c018ca4f090bf47565c290c87ffe00d9f1` 的显式新文件清单遗漏了 `src/proxy.test.ts`。同批续执行指令随后明确要求继续并完成，因此只对未 push 的本地 tip 做一次最小 amendment；未创建第二个业务提交。
- 最终 commit 保持 message `feat: harden beta security boundaries`，包含 52 个文件；`src/proxy.test.ts` 已纳入，SHA-256 `55b31cf06d856df8335da2bc23e4ee6527c1a35d498a76d15cd1115bc5bdf961`；`.pnpm-store/` staged/committed 0。
- 本报告无法在自身内容中写入包含自身字节的固定 commit hash；用 `git log -1 --format=%H -- docs/runbooks/阶段6/阶段6_Phase4.3_安全加固主实施恢复_执行报告.md` 可无歧义回读，精确 final hash 同步写入执行任务终态回执。
- amendment 后 staged、unstaged tracked 和非 `.pnpm-store/` untracked 均为 0；没有 reset、clean 或其他历史改写。
- 未 push/merge/PR/deploy/release/tag；未修改 GitHub/Vercel/Supabase Cloud/Production；未使用真实账号/数据/Secret；未进入 Phase 5。

## 12. 最终判定

Phase 4 的本地安全实现已由代码、配置、数据库、测试、审计和威胁模型闭环。三项必须依赖外部平台的配置保持 `external confirmation required`，不计入已缓解分母；它们必须在总纲对应发布阶段实际回读。

遗漏测试已在同批续执行中纳入唯一最终 commit。**Phase 4 完成，等待外层独立审核。明确未进入 Phase 5。**

<!-- EXECUTION_REPORT_COMPLETE -->
