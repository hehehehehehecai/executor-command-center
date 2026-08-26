# 探索者号｜阶段 6｜Phase 6 可访问性、移动端与视觉验收矩阵

## 1. 证据边界

- 合同：`beta-phase6-accessibility-responsive.v1`
- 自动化入口：`pnpm test:e2e:phase6-accessibility`
- 浏览器：Playwright Chromium；真实本地 Next.js HTTP/UI；Preview 与本地合成 Connected fixture；外部调用分母为 0。
- 自动化视口：`320×900`、`375×900`、`768×900`、`1280×900`。
- 人工回读仅作为布局与视觉层级辅证，不替代可重复断言。回读截图位于被忽略的 `test-results/phase6-visual-*.png`，不纳入提交。
- `.pnpm-store/` 明确排除，未读取文件正文、未修改、未暂存、未提交。

## 2. 页面验收矩阵

| 页面 | 可达状态/模式 | Landmark/标题 | 键盘与 Focus | 状态语义 | 320/375/768/桌面 | 自动化证据 | 人工回读 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Preview、同步中 | 唯一 `main#main-content`；唯一 H1；跳转链接 | Skip link；移动导航触发、焦点循环、Escape、恢复触发器 | 同步状态有文字标签，不只依赖颜色 | 四档无横向溢出 | `A11Y-LANDMARK-01`、`A11Y-DRAWER-01`、`A11Y-RESPONSIVE-01` | 375 抽屉遮罩、层级与阅读顺序通过 |
| `/onboarding` | 未登录、未连接、账户删除确认 | 唯一 main/H1 | 删除确认输入自动聚焦；Escape 关闭并恢复触发器；对应单测覆盖 | 账户状态、七天窗口、失败保持文字说明 | 320 身份指标改为单列，无截断 | `A11Y-LANDMARK-01`、`A11Y-RESPONSIVE-01`、`AccountDeletionPanel.test.tsx` | 320 单列指标与动作阅读顺序通过 |
| `/mission-control` | Preview、失败；事实与建议 | 唯一 main/H1；标题层级连续 | 所有动作保留原生可聚焦控件 | 事实标记为“事实”；系统建议标记为“建议”；失败为 alert 且有原因/下一步 | 四档无横向溢出 | `A11Y-STATE-01`、`A11Y-CONTENT-KIND-01`、`A11Y-RESPONSIVE-01` | 768 卡片层级、标签与动作顺序通过 |
| `/project-galaxy` | Preview、Connected、失败、两种移除确认 | 唯一 main/H1 | 强确认输入自动聚焦；Escape 关闭并恢复对应模式触发器 | 正式状态/建议状态文字区分；失败有安全返回路径 | 四档无横向溢出，高风险区不被挤出 | `A11Y-CONFIRM-01`、`A11Y-STATE-01`、`A11Y-RESPONSIVE-01` | 1280 正式事实、建议、数据新鲜度层级通过 |
| `/copilot` | Preview、失败；Brief 状态由既有合同覆盖 | 唯一 main/H1 | 现有可交互控件保持原生 Tab 顺序 | 失败为 alert，有原因与重试边界；Brief empty/stale/failed/revoked 继续由既有文本合同区分 | 四档无横向溢出 | `A11Y-STATE-01`、`A11Y-RESPONSIVE-01`；全量/Connected/Core 回归 | 自动响应式断言；无新增视觉重构 |
| `/decision-archive` | Preview、失败、Candidate、确认记录 | 唯一 main/H1 | 现有表单与动作保持原生键盘路径 | Candidate 与“用户确认记录”均有不依赖颜色的文本标签 | 四档无横向溢出 | `A11Y-CONTENT-KIND-01`、`A11Y-STATE-01`、`A11Y-RESPONSIVE-01` | 自动响应式断言；无新增视觉重构 |
| `/flight-log` | Preview、失败、数据新鲜度 | 唯一 main/H1 | 筛选与导航保持原生键盘路径 | 失败有原因/下一步；新鲜度与部分结果继续使用既有文字状态 | 四档无横向溢出 | `A11Y-STATE-01`、`A11Y-RESPONSIVE-01`；Connected/Core 回归 | 自动响应式断言；无新增视觉重构 |
| `/auth/error` | 登录失败 | 唯一 main/H1 | Skip link 可达 main；返回动作可键盘使用 | `role=alert`，含安全原因与下一步，不输出内部错误 | 四档无横向溢出 | `A11Y-LANDMARK-01`、`A11Y-RESPONSIVE-01` | 自动响应式断言；无新增视觉重构 |

## 3. 七类专项验收

| 目标 | 分母 | 通过标准 | 证据 |
| --- | ---: | --- | --- |
| Landmark / heading | 8 个主路由 | 每页唯一 main、唯一 H1、标题层级不跳级；skip link 首个 Tab 可见且将焦点送入 main | `A11Y-LANDMARK-01`，8/8 路由 |
| 移动导航 | 1 个独立交互 case | dialog/aria-modal/可理解名称；打开聚焦关闭按钮；Tab 循环；Escape 与遮罩关闭；焦点恢复 | `A11Y-DRAWER-01`，1/1 |
| 强确认 | 2 个独立组件、1 个浏览器 case | 打开后进入确认输入；pending 时不允许 Escape；安全关闭后恢复模式对应触发器 | 浏览器 `A11Y-CONFIRM-01`；单测 2 个新增 case |
| Contrast | 4 组 token | 普通文本 ≥4.5:1；边界/Focus ≥3:1 | foreground/background `16.1858:1`；muted/background `5.3138:1`；border/surface `4.1548:1`；focus/background `5.8377:1` |
| Reduced Motion | 1 个独立 case | reduce 下 animation/transition ≤0.01ms、一次迭代、scroll-behavior=auto | `A11Y-MOTION-01`，1/1 |
| 状态语义 | 5 个失败路由 + 既有状态回归 | failed/revoked 使用 alert；原因与下一步可感知；loading/empty/stale/partial 保持不同文字，不把撤权伪装为可重试同步 | `A11Y-STATE-01` 5/5；Phase 5 Core/Connected 与全量单测回归 |
| 内容类型 | 4 类标签 | 事实、建议、Candidate、用户确认记录均有文本标签与 DOM 稳定键，不依赖颜色 | `A11Y-CONTENT-KIND-01`，4/4 |
| 响应式 | 8 路由 × 4 宽度 = 32 组合 | `scrollWidth <= clientWidth`，main 可见，无非预期横向滚动 | `A11Y-RESPONSIVE-01`，32/32 |

## 4. 状态语义与安全动作

| 状态 | 可访问标签 | Live region | 原因与下一步 | 动作边界 |
| --- | --- | --- | --- | --- |
| Loading | 正在加载 | polite status | 指明正在读取的对象 | 不提前显示成功 |
| Empty | 暂无数据 | polite status | 说明尚无记录 | 提供创建/返回等真实可用动作 |
| Stale | 数据已过期 | polite status | 说明授权或新鲜度原因 | 仅在授权有效时允许刷新 |
| Partial | 部分数据可用 | polite status | 指明缺失范围 | 保留已验证数据，不把缺失伪装完整 |
| Failed | 操作未完成 | assertive alert | 安全低敏原因 + 下一步 | 只显示可安全重试或返回动作 |
| Revoked | 授权已失效 | assertive alert | Installation 撤权/数据过期 | 阻止新 Sync/AI，不承诺自动恢复授权 |

## 5. 自动化红灯与最终结果

- 基线首跑：8/8 失败，分别证明缺少 main 锚点、抽屉语义/焦点循环、确认输入聚焦、边界对比度、Reduced Motion、失败状态语义、内容类型文字标签及 320px 溢出。
- 实施后首轮：6/8 通过；剩余两项为验收器等价表示缺陷（Next.js 连续导航主动中止同源字体请求；浏览器将 `0.01ms` 规范化为 `1e-05s`）。测试只排除该同源字体 `ERR_ABORTED`，其他请求失败继续失败关闭；时长按毫秒数值阈值判断。
- 最终 Phase 6 专用套件：8/8 通过，skip 0，console error 0，page error 0，未处理请求 0，非本地请求 0。

## 6. 视觉回读与残余风险

- 人工回读分母：4 张代表截图（320 onboarding、375 drawer、768 Mission Control、1280 Project Galaxy），4/4 未见横向滚动、内容截断或卡片重叠。
- Next.js 开发模式圆形标记不属于生产 UI；production build/CSP runtime 由质量门独立验证。
- 自动化颜色证据覆盖核心全局 token；页面内所有可能的图片像素、操作系统强制颜色模式和真实屏幕阅读器发音未形成穷尽式自动证据，列为后续真实设备验收风险，不改写为已全面认证。
- 未新增依赖，未新增产品面板，未改变 Phase 1–5 的业务状态机。
