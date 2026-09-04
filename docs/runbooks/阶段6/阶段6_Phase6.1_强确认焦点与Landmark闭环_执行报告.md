# 探索者号｜阶段 6｜Phase 6.1 强确认焦点与 Landmark 闭环执行报告

## 1. 编排标识与授权回读

- 启动 ID：`explorer-stage6-6f15e9ac1282cdd4`
- 批次 ID：`explorer-stage6-phase6.1-ee063d7c59d44bfa`
- 提示词实例 ID：`explorer-stage6-phase6.1-1061e437bdeb3430`
- 来源审核票据 ID：`review-ticket-1061e437bdeb3430`
- 授权策略：`workflow-authorization.v1`
- 目标仓库：`D:\AI workplace\探索者号`
- 结论范围：只修复两个强确认 modal 的焦点/背景约束，以及 Command Deck、Project Galaxy 的 Landmark containment；未进入 Phase 7。

## 2. Pre-Run Freeze 与基线审计

- baseline HEAD：`57cf35313efbc5810edd8c48861f6064f62eda29`
- baseline 提交消息：`fix: polish beta user experience`
- baseline 父提交：`9daa2e068b241f4e3b499b35b8be5f6f9132c483`
- 分支：`feature/stage4-bridge-five-panels`
- origin：`ssh://git@ssh.github.com:443/hehehehehehecai/executor-command-center.git`
- Git common directory：`D:\AI workplace\探索者号\.git`
- 基线过滤状态：tracked/staged/non-`.pnpm-store/` untracked 均为 0。
- 基线过滤状态 SHA-256：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- Phase 6 原报告 SHA-256：`d891efb2304241bbea973591547920c48edab8e94cb6df63d3d27e21e7b1b9fd`，与提示词一致。
- `.pnpm-store/`：阶段前既有目录；本批未读取文件正文，未修改、移动、删除、暂存或提交，所有状态命令均显式排除。
- 首次恢复时 `next-env.d.ts` 存在 Next.js dev 自动生成差异；按用户“继续完成”指令只恢复为 baseline 内容。后续 E2E/build 再次生成的 `root-params`/dev import 也只恢复为 baseline，未纳入业务 diff。

## 3. 开始前真实控制流审计

### 3.1 强确认 modal

- `AccountDeletionPanel` 与 `RepositoryRemovalPanel` 均在打开后直接聚焦确认输入，并监听全局 Escape。
- 两者都没有 Tab/Shift+Tab 边界循环，没有背景 `inert`/`aria-hidden`，背景可聚焦元素仍能取得焦点，指针也没有事务级 UI 抑制。
- pending 状态虽禁用按钮和输入，但原实现没有统一 cleanup 合同；关闭触发器恢复发生在背景仍可交互的旧模型中。
- 两者的确认文本、幂等键、授权、API 与删除状态机保持独立，本批未改动。

### 3.2 Landmark

- `CommandDeckPage` 的品牌 `header` 位于 `main#main-content` 内，因此不能暴露顶级 banner landmark。
- `ProjectGalaxyPanel` 自身是 `main`；Connected 组合随后渲染 `ProjectLifecycleActions` 与 `RepositoryRemovalPanel`，两者落在 main 之后。
- Preview/错误分支已有单一 H1，错误分支已有独立 `statusShell` main；最小修复只需把页面级 main 提升到组合边界。

## 4. TDD 红灯、根因与最小修复

### 4.1 冻结红灯

| 证据 | 退出码 | 分母 | 结果 |
| --- | ---: | --- | --- |
| 聚焦 Vitest：两个 modal、Command Deck、Project Galaxy page | 1 | 4 files / 37 tests | 4 个目标失败、33 通过：Shift+Tab 未循环；banner 在 main 内；Connected 操作不在 main |
| Phase 6 浏览器基线 | 1 | 8 cases | 2 失败、6 通过：`A11Y-LANDMARK-01` banner=0；`A11Y-CONFIRM-01` 取消按钮未取得反向循环焦点 |

首次命令因任务 shell 缺少 Node PATH 而在测试启动前退出 1（`'node' is not recognized` / `'vitest' is not recognized`）；加载桌面工作区 Node 运行时后才形成上述有效红灯，不把环境失败计为产品红灯。

### 4.2 最小实现

1. 新增 `useModalFocusBoundary`：
   - 打开后聚焦确认输入；无可用控件时回退聚焦 dialog；
   - Tab/Shift+Tab 在第一个/最后一个可操作元素间循环；
   - 从 dialog 到 `body` 的每层兄弟元素设置 `inert`、`aria-hidden=true` 与低影响 marker；
   - `focusin` 防止程序化焦点逃逸，原生 `inert` 与 CSS marker 阻止背景可信指针；
   - Escape 读取最新 pending 状态并失败关闭；
   - cleanup 恢复原始 `inert`、`aria-hidden`、marker、body overflow、监听器，并在背景恢复后精确聚焦触发器。
2. 两个 modal 只接入共享 hook 和 dialog ref/`tabIndex=-1`，未修改危险操作语义。
3. Command Deck 以原 `.command-deck-shell` 外层包裹顶级 `header` 与 `main#main-content`，保持现有布局 class 和 selector。
4. `ProjectGalaxyPanel` 改为非 landmark 容器；Preview、Connected fixture、真实 Connected 由 page 统一包入唯一 `main#main-content`，生命周期与移除操作都在 main 内；错误/未登录分支保持既有唯一 main。
5. Phase 6 runner 复用本地 Supabase 与 Phase 5 合成 Auth 边界，为 Account Deletion 增加真实本地 HTTP/UI case；没有新建第二套框架或外部调用。

### 4.3 实施中失败与修正

- 首次实现后聚焦单测 40/42：Escape 回调在背景仍为 `inert` 时聚焦触发器，焦点落到 body。修正为 hook cleanup 先恢复背景、再恢复触发器，随后 42/42。
- Repository 浏览器首次实现后 7/8：角色定位按规范不会重新找到 `aria-hidden/inert` 背景元素。测试改为稳定 DOM 定位，仍验证真实 `inert`、程序化聚焦拒绝和可信鼠标点击无副作用，没有放宽产品合同。
- Account 浏览器 fixture 首次分别因缺少合成 `INNGEST_SIGNING_KEY` 和 session 响应未完整消费出现 8/9；补齐测试环境与读取响应体后最终 9/9。没有修改产品配置或业务实现。

## 5. 合同与最终语义

- Modal：打开 → 确认输入；正/反向 Tab 循环；背景键盘/指针不可达；非 pending Escape → 安全关闭 → 准确触发器；pending Escape → No-op；关闭/成功/失败/卸载均不残留全局状态。
- Command Deck：唯一 banner、桌面主导航与 main；banner 位于 main 外；skip link 继续聚焦 `main#main-content`。
- Project Galaxy：Preview、Connected fixture、真实 Connected、错误与未登录分支始终唯一 main/H1；Connected 的同步生命周期与仓库移除操作属于 main。
- 保持不变：确认文本、幂等、所有权、API、账户/仓库删除状态机、RLS、安全策略、Phase 5 selector、样式层级与响应式合同。

## 6. 修改文件清单

| 文件 | 作用 |
| --- | --- |
| `src/shared/accessibility/use-modal-focus-boundary.ts` | 共享焦点循环、背景 inert、Escape/pending、cleanup/恢复焦点合同 |
| `src/features/onboarding/AccountDeletionPanel.tsx` | 接入共享强确认边界 |
| `src/features/onboarding/AccountDeletionPanel.test.tsx` | Account 正反向循环、背景、cleanup、pending Escape 单测 |
| `src/features/project-galaxy/RepositoryRemovalPanel.tsx` | 接入共享强确认边界 |
| `src/features/project-galaxy/RepositoryRemovalPanel.test.tsx` | Repository 正反向循环、背景与恢复单测 |
| `src/features/command-deck/command-deck-page.tsx` | banner/main 顶级结构分离 |
| `src/features/command-deck/command-deck-page.test.tsx` | 唯一 banner/main 与 containment 断言 |
| `src/features/project-galaxy/ProjectGalaxyPanel.tsx` | 从组件级 main 收敛为页面组合内容容器 |
| `src/app/project-galaxy/page.tsx` | Preview/Connected 统一唯一页面级 main |
| `src/app/project-galaxy/page.test.tsx` | Connected 生命周期和移除操作 main containment |
| `src/app/globals.css` | modal 背景 marker 的 pointer/user-select 抑制 |
| `tests/e2e-phase6-accessibility/accessibility-responsive.spec.ts` | 两个 modal 与 Landmark 真实浏览器证据 |
| `scripts/run-phase6-accessibility-e2e.mjs` | 本地合成 Auth/Supabase fixture 环境 |
| `docs/runbooks/阶段6/阶段6_Phase6_可访问性移动端视觉验收矩阵.md` | 追加 Phase 6.1 自动化证据与分母 |
| 本报告 | 批次终态与审计证据 |

未修改依赖、lockfile、migration、数据库类型、RLS、RPC、API 或其他测试文件。

## 7. Target-specific metrics

| 目标 | 分母 | 结果 |
| --- | ---: | --- |
| 强确认组件 | 2 | 2/2 初始聚焦、正向循环、反向循环、背景焦点拒绝、背景可信指针无副作用、Escape 恢复 |
| pending Escape | 1 个共享行为合成 case | 1/1 No-op；完成后 cleanup 0 残留 |
| modal cleanup | 2 个组件 | `inert`/`aria-hidden`/marker/body overflow/监听器残留 0 |
| Command Deck banner/main | 1 页面 | banner 1、桌面主导航 1、main 1；banner-in-main 0 |
| Project Galaxy containment | Preview + Connected + 失败路径 | 每路径 main 1、H1 1；Connected 核心操作 main 外残留 0 |
| Phase 6 浏览器 | 9 cases | 9/9；skip 0；console/page/request/non-local error 均 0 |
| 响应式保留 | 8 routes × 4 widths | 32/32，无横向溢出 |
| 外部调用 | 真实 GitHub/AI/Inngest Cloud/Supabase Cloud/Vercel/Production | 0 |

## 8. 全部测试与质量门

| 命令 | 退出码 | 分母/结果 |
| --- | ---: | --- |
| 聚焦 Vitest（最终） | 0 | 5 files / 42 tests 全部通过 |
| `pnpm env:check` | 0 | 1 file / 1 test |
| `pnpm typecheck` | 0 | TypeScript 无错误 |
| `pnpm lint` | 0 | ESLint warning/error 0 |
| `pnpm security:test` | 0 | 12 files / 55 tests |
| `pnpm test` | 0 | 184 files / 1719 tests，skip/xfail 0 |
| `pnpm test:e2e:phase6-accessibility` | 0 | 9/9；32/32 route/viewport；浏览器非预期错误 0 |
| `pnpm test:e2e:core-journeys` | 0 | 16/16 |
| `pnpm test:e2e:connected-panels` | 0 | 8/8 |
| `pnpm test:e2e` | 0 | 14/14 |
| `SUPABASE_TELEMETRY_DISABLED=1 pnpm test:integration` 首次 | 1 | app 21 files / 67 tests 通过；DB 44 files / 1001 tests 中 0003/0006/0016 共 12 断言因 1 条合成身份残留失败 |
| 同一 integration 最终重跑 | 0 | app 21/67；DB 44 files / 1001 tests 全部通过 |
| `pnpm security:secret-scan` | 0 | 最终 staged manifest：tracked 718、扫描 717、finding 0、allowlisted 3 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | Next.js 16.3.0 production build 成功；路由均按 nonce 合同动态渲染 |
| `pnpm test:security:csp-runtime` | 0 | 4/4 路由；40/40 scripts nonce 匹配；error 0 |
| `git diff --check` | 0 | whitespace error 0 |

无依赖变化，因此未运行安装或 dependency audit；该项为 `N/A`，不是跳过安全失败。Phase 4 的 production audit 0 high / 0 critical 未被改动。

## 9. 系统审批、失败清理与安全边界

- 本地 Supabase/Docker 浏览器与 integration 命令按 B 类请求精确系统审批并获准。
- 首次 integration 发现一个早先失败浏览器尝试遗留的本地合成身份：`phase5-user-61`。平台拒绝 `pnpm db:reset`，理由是范围过宽；该命令未执行，也未通过替代方式绕过。
- 安全替代：只读定位唯一合成 user ID，并以该 UUID + `phase5-%@example.invalid` 双重条件精确删除 1 条本地 `auth.users` 合成身份；FK cascade 后 `phase5-user-*` 残留计数为 0。该删除不可恢复，但对象只属于本批合成测试，不含真实用户或业务数据。
- 未读取或输出真实 `.env*`、Secret、cookie、token、prompt、仓库正文或用户数据。
- 未调用真实 GitHub、AI Provider、Inngest Cloud、Supabase Cloud、Vercel 或 Production。

## 10. Git、提交与禁止动作

- 提交前：`git diff --check`、Secret scan、staged 范围与 `.pnpm-store/` staged=0 均需再次回读。
- 单一提交消息：`fix: close modal focus and landmark gaps`。
- 最终提交：由包含本报告的单一本地 Git commit 生成。Git commit hash 无法自包含于同一 commit 的文件内容；最终 hash 在任务终态回执中绑定，并通过提交后 `git rev-parse HEAD` 验证。
- 禁止动作均未执行：无 amend/rebase/reset/checkout/clean，无 push、merge、PR、部署、发布、tag；未进入 Phase 7。

## 11. 结论

Phase 6.1 的两个审核缺口已闭环：两个强确认 modal 形成共享、可清理、pending 失败关闭的焦点与背景边界；Command Deck 和 Project Galaxy 的 banner/main/核心操作 Landmark containment 成立。全部必需门禁最终通过，可提交独立审核；等待外层审核，未进入 Phase 7。

<!-- EXECUTION_REPORT_COMPLETE -->
