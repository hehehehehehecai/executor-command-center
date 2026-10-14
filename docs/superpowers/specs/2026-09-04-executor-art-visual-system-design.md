> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

# EXECUTOR 美术与视觉系统升级设计规格

> 计划包：`EXPLORER-ART-20260904-01`<br>
> 状态：完整草稿，等待最终批准<br>
> 主风格：深空舰桥·证据控制台

## 1. 目标

为 `EXECUTOR — Command Your Projects / 执行者号` 建立可复用、可测试、可回退的跨面板视觉系统，使 Command Deck 与五个核心面板呈现克制的深空舰桥风格，同时保持所有业务、数据、权限和证据边界不变。

## 2. 路由上下文

- `project_lifecycle: ZERO_TO_ONE`
- `work_unit_mode: NEW_CAPABILITY_EXPLORATION`
- `planning_scope: SINGLE_WORK_UNIT`
- `planning_skill: existing-project-update-plan`

## 3. 已批准设计决策

- 美术模块是共享视觉系统，不注册为第六个 Feature。
- 用户附图是唯一主风格参考，只继承色彩、材质、层级和信息密度，不复制文字、业务内容或具体构图。
- 先完成 Command Deck 试装与人工验收，再覆盖五面板。
- 保留现有布局、View Model、Preview/Connected 合同、状态机与数据来源说明。
- 使用作用域主题并保留 `legacy` 回退。
- 不新增远程字体、重型 UI 库或动效依赖。
- 位图不得承载文字、按钮、数字、图表或业务状态；第一版使用 CSS 程序化星空与网格，不接入未完成来源核验的生成图。
- 状态语义必须同时依赖文字、结构和颜色。

## 4. 视觉合同

### 4.1 色彩 Token

| Token | 值 | 用途 |
|---|---|---|
| `--space-bg` | `#030711` | 页面背景 |
| `--space-surface` | `#081321` | 基础面板 |
| `--space-surface-raised` | `#0d1b2c` | 悬浮／重点面板 |
| `--space-foreground` | `#f3f7ff` | 主文字 |
| `--space-muted` | `#a9b8ca` | 次要文字 |
| `--space-border` | `#46688f` | 关键边框 |
| `--space-primary` | `#2f7dff` | 主操作／选中 |
| `--space-cyan` | `#3ad8ff` | 数据／同步 |
| `--space-warning` | `#f3a526` | 警告／待处理 |
| `--space-success` | `#2ed68f` | 成功／完成 |
| `--space-danger` | `#ff6b73` | 失败／撤权／危险 |
| `--space-ai` | `#9a7cff` | AI／建议／分析 |
| `--space-focus` | `#66b3ff` | 键盘焦点 |

已计算的关键对比度：主文字/背景 `18.76:1`，次要文字/背景 `9.97:1`，边框/面板 `3.23:1`，焦点/背景 `9.07:1`。

### 4.2 材质与层级

- 面板使用深蓝实色或不低于 92% 不透明度的混色；真实数据区不使用高透明玻璃。
- 边框为 1px 钢蓝，重点状态允许左侧 3–4px 语义色标。
- 发光只用于选中、焦点和关键状态，模糊半径不超过 18px。
- 星空与网格由伪元素和 CSS gradient 生成，`pointer-events: none`、`aria-hidden`，不进入可访问树。
- 圆角统一为 `6px / 10px / 14px` 三档；不使用胶囊形卡片容器。

### 4.3 排版与密度

- 继续使用 Inter、系统字体栈，不请求远程字体。
- 正文最小 `14px`，关键标签最小 `12px`；中文不使用全大写模拟。
- 桌面保持三栏工作区和高密度卡片，移动端保持 Drawer 与单列降级。
- 装饰层不得遮挡标题、控件、数据来源、Evidence、错误或撤权信息。

### 4.4 动效

- 普通过渡 `120–180ms`，只允许 `opacity`、`transform`、`box-shadow`。
- 同步中允许低频脉冲；失败、警告与危险操作不循环闪烁。
- `prefers-reduced-motion: reduce` 下动画与过渡降为 `0.01ms`，不使用平滑滚动。

## 5. 架构

新建 `src/shared/visual-system/`，其职责仅为 Token、主题解析和视觉合同，不读取 Feature 私有状态、环境 Secret、数据库或 Provider。

```text
src/shared/visual-system
  tokens.css            语义色、间距、圆角、阴影、动效 Token
  theme.css             legacy/deep-space 作用域映射与装饰层
  theme.ts              主题值解析与默认值
  theme.test.ts         主题解析和失败关闭测试
  index.ts              唯一 TypeScript 公共入口
```

`src/app/layout.tsx` 在根节点输出 `data-executor-theme="deep-space|legacy"`。`globals.css` 只消费共享 Token，并保留现有类名；五个 Feature 只修改各自 CSS Module，不修改 View Model 或组件业务分支。

## 6. 数据流与错误流

```text
NEXT_PUBLIC_EXECUTOR_THEME
  -> parseExecutorTheme()
  -> deep-space（默认）或 legacy
  -> root data attribute
  -> tokens.css/theme.css
  -> globals.css + feature CSS modules
```

- 值缺失时使用 `deep-space`。
- 值为 `legacy` 时恢复当前浅色 Token。
- 其他值失败关闭到 `legacy`，避免未知主题发布。
- 主题解析不改变页面数据加载、会话、API、缓存或 Evidence。

## 7. 范围

包含：共享 Token、根主题、Command Deck、导航、Inspector、五面板 CSS、危险操作样式、可访问性、响应式、视觉快照、CSS 程序化装饰、发布与回退文档。

不包含：新增 Feature、重排导航、修改业务文案、数据库、GitHub 权限、AI Prompt、View Model、外部生图、营销站、完整品牌 Logo 重制、第三方 UI 库。

## 8. 验收

- `feature-registry.v1`、`panel-query.v1` 与五面板公开入口哈希或行为不因视觉改造改变。
- `pnpm typecheck`、六组核心 UI 测试、核心 E2E、Connected panel E2E 和 Phase 6 accessibility E2E 通过。
- 六页面分别有 `1440x900` 与 `390x844` 的视觉基线。
- 正文对比度不低于 `4.5:1`，非文本焦点和关键边框不低于 `3:1`。
- Reduced Motion、键盘焦点、Drawer、对话框、失败/空/过期/撤权状态均可验证。
- 第一版无远程字体、无新增运行时依赖、无生产位图背景。
- 设置 `NEXT_PUBLIC_EXECUTOR_THEME=legacy` 后构建和核心旅程通过。

## 9. 发布与回退

先本地 Preview，后 Connected fixture，再 Staging。只有视觉、可访问性、业务回归和 `legacy` 回退同时通过，才允许 Production。Production 出现不可读状态、焦点丢失、核心旅程失败或视觉资源阻塞时，立即切换到 `legacy` 并重新部署；不回退数据库，因为本计划不含数据变更。

## 10. 重新批准门槛

以下变化必须重新批准：增加第六面板、修改导航信息架构、改变业务文案/状态含义、引入第三方 UI/动效库、接入生产位图或外部字体、修改 Preview/Connected 合同、增加数据库或权限变更、取消 legacy 回退。
