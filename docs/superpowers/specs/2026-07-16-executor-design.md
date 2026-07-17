# EXECUTOR — Command Your Projects

## MVP 产品与系统设计规格

- 日期：2026-07-16
- 状态：设计已确认，等待书面规格复核
- MVP 时间盒：6 周
- 产品形态：免费公开 Beta、桌面 Web 优先、GitHub 只读项目指挥中心
- 正式名称：EXECUTOR
- 副标题：Command Your Projects
- 中文语境名称：执行者号

---

# 1. 产品定位

## 1.1 一句话定义

EXECUTOR 是一个面向个人开发者和 AI 创作者的 GitHub 项目指挥中心。它将用户主动授权的 GitHub 仓库转化为一套科幻舰桥式项目管理体验，帮助用户看清项目状态、理解近期进展、发现候选行动、记录关键决策，并通过有证据边界的 AI 简报进行复盘。

## 1.2 核心主张

> 用户是舰长，系统负责提供仪表、证据和候选建议，最终决定始终由用户作出。

EXECUTOR 不是：

- 自动写代码的 Agent；
- 自动修改仓库的机器人；
- 自动创建或关闭 Issue 的 GitHub 管理器；
- 自动判断用户意图、人格或项目价值的系统；
- Jira、Notion、GitHub、IDE 和 AI Coding 工具的混合替代品。

## 1.3 目标用户

MVP 面向：

- 同时维护多个个人项目的开发者；
- 使用 AI Coding 快速开发，但项目容易停滞的创作者；
- 希望从 GitHub 活动中形成持续项目档案的人；
- 希望训练 Git、测试、发布与复盘纪律的个人开发者。

产品首先服务作者本人的真实工作流，但按照公开 SaaS 标准设计。

---

# 2. 产品体验

## 2.1 视觉隐喻

产品采用“星舰舰桥 / 科幻 HUD 指挥中心”的视觉隐喻。

原则：

- 首页可以有明显舰桥与 HUD 气质；
- 深度工作区必须清晰、克制、可读；
- 科幻感来自空间层级、术语、动效与信息组织；
- 不依赖小字号、过度发光和复杂装饰线制造氛围；
- 世界观不得遮盖真实错误、权限、风险和证据边界；
- 事实用系统语言表达，体验用舰船语言点缀。

Copilot 采用：

> 冷静系统为主，少量舰船人格。

例如：

- “航行记录已同步。”
- “最近一次成功同步已超过 24 小时，当前数据可能过期。”
- “过去 30 天未检测到 Commit、PR 或 Release。系统无法观察本地未提交工作或线下设计活动。”

禁止使用世界观文案掩盖错误或把推断包装成事实。

## 2.2 首页与工作区

采用“舰桥总览 + 三栏深度工作区”的组合结构。

### Command Deck｜舰桥首页

同时展示五个面板摘要，让用户在几十秒内理解全局。

### 深度工作区

点击任一面板后进入：

```text
左栏：系统导航
中栏：当前面板主要工作区
右栏：AI Copilot 与证据上下文
```

Copilot 只围绕当前项目、当前面板和本次明确提供的证据回答，不默认获取全部仓库上下文。

## 2.3 首次体验

首次进入不采用线性强制教程，而采用可自由探索的 Preview Mode：

1. 用户进入完整舰桥；
2. 五个面板全部开放；
3. 使用版本化虚构数据；
4. 每个面板说明能做什么、需要哪些 GitHub 数据、连接后会得到什么；
5. 用户决定连接 GitHub；
6. 通过 GitHub 登录；
7. 安装 GitHub App；
8. 在 GitHub 官方页面选择仓库；
9. 默认同步最近 90 天活动；
10. 为每个项目进行轻量校准；
11. 进入真实数据舰桥。

Preview Mode：

- 不需要登录；
- 不调用 GitHub、数据库或 DeepSeek；
- 不消耗 AI 能量点；
- 明确标记为演示数据；
- 不使用真实用户数据脱敏制作 Demo。

Connected Mode：

- 只读取用户主动选择的仓库；
- 显示最后同步时间和数据新鲜度；
- AI 输出附带证据与版本信息。

---

# 3. 五个核心面板

## 3.1 Project Galaxy｜项目星图

展示：

- 用户主动选择的仓库；
- 正式项目状态；
- 系统建议状态；
- 最近活动；
- 数据新鲜度；
- 项目核心目标；
- 当前阶段目标；
- 当前最大阻碍。

正式状态：

```text
in_planning     计划中
in_development  开发中
polishing       打磨中
dormant         休眠
completed       已完成
archived        已归档
```

状态分层：

```text
official_status   用户确认的正式状态
suggested_status  系统基于证据提出的建议状态
```

系统只能建议，不能自动修改正式状态。

## 3.2 Flight Log｜航行日志

按时间展示：

- Commit；
- Issue；
- Pull Request；
- Review；
- Release；
- Workflow Run / CI 状态；
- 同步与异常记录；
- 已验证周期简报入口。

## 3.3 Mission Control｜任务中枢

严格区分：

### 已记录任务

来自 GitHub 中已有的 Open Issue、待处理 PR、Review 请求、CI 失败等确定性状态。

### 系统建议

由规则或 AI 根据仓库活动与用户项目档案生成的候选行动，必须包含：

- 建议内容；
- 依据；
- 证据引用；
- 系统不知道什么；
- 规则或 Prompt 版本。

建议状态：

```text
suggested
accepted
snoozed
dismissed
completed
```

接受建议后不建立完整 Todo 系统。

系统可生成 GitHub Issue 草稿，但 MVP：

- 不申请写权限；
- 不直接创建 Issue；
- 只允许复制标题与正文，或跳转 GitHub 手动创建。

## 3.4 Decision Archive｜决策档案

支持：

- 用户手动创建；
- AI 发现疑似决策点，邀请用户确认。

AI 不能把实现变化自动包装成用户动机。

候选决策只有在用户确认并补充原因后，才能成为正式决策记录。

正式记录包含：

- 决定内容；
- 用户确认的原因；
- 替代方案；
- 关联 Commit / PR / Issue / 文档；
- 当前状态；
- 重新审视条件。

## 3.5 Copilot｜AI 副驾驶

交互形态：

> 结构化简报为主，允许围绕当前项目和当前面板追问。

上下文显式构建：

```text
当前用户
+ 当前面板
+ 当前项目
+ 本次允许使用的证据快照
+ 用户追问
```

MVP 完整实现并建立 Eval 的主 AI 能力：

> 项目简报：基于可追溯证据说明最近发生了什么。

状态建议、行动建议和疑似决策点可保留受控简化版，但不要求六周内全部达到完整 Eval 水平。

---

# 4. GitHub 接入与权限

## 4.1 身份与仓库授权双链路

### Supabase Auth + GitHub OAuth

负责确认当前用户是谁。

### 独立 GitHub App

负责 EXECUTOR 可以访问哪些仓库。

登录成功不代表拥有仓库权限。GitHub App 被撤销不删除账户，但必须立即停止对应仓库同步与新 AI 分析。

## 4.2 GitHub App 权限

MVP 支持用户主动授权的公开仓库与私有仓库。

只读权限：

- Metadata；
- Contents；
- Issues；
- Pull requests；
- Actions；
- Checks；
- Commit statuses。

不申请：

- Administration；
- Contents Write；
- Issues Write；
- Pull Requests Write；
- Workflows Write；
- Secrets；
- Deployments Write；
- Members。

## 4.3 Webhook

订阅：

- installation；
- installation_repositories；
- push；
- issues；
- pull_request；
- release；
- workflow_run；
- check_run / check_suite；
- status。

Webhook 只触发增量同步，不自动修改项目正式状态，也不自动触发全部 AI 分析。

## 4.4 仓库选择

用户在 GitHub 官方安装页选择 App 可访问仓库后，还需在 EXECUTOR 内主动选择哪些仓库成为项目。

MVP：

> 一个 GitHub 仓库等于一个 EXECUTOR 项目。

多仓库项目分组不进入 MVP。

## 4.5 内容读取边界

默认读取：

- 仓库基础信息；
- Commit message；
- Branch；
- Issue；
- PR 标题与描述；
- Release；
- CI / Workflow 状态。

用户明确授权后读取：

- README；
- `docs/` 文档；
- 用户主动选择的 Markdown 文件。

暂不读取：

- 完整源码；
- Commit Diff；
- 任意未选择文件。

---

# 5. 项目校准

仓库导入后，用户填写：

- 项目核心目标；
- 当前阶段目标；
- 当前最大阻碍，可选；
- 正式项目状态。

这些内容属于“用户陈述”，必须与 GitHub 事实、规则结果和 AI 推断分开保存。

---

# 6. 同步策略

## 6.1 首次同步

默认读取最近 90 天：

- Commit；
- Issue；
- Pull Request；
- Release；
- Workflow / Check 状态。

## 6.2 日常同步

采用：

> Webhook 增量同步 + 每日轻量对账 + 用户手动重同步。

### Webhook 链路

```text
接收请求
→ 验签
→ 记录 delivery_id
→ 幂等去重
→ 最小解析
→ 转换为内部事件
→ 发送后台任务
→ 快速响应
```

### 每日对账

每个已启用仓库每天一次，检查：

- 仓库更新时间；
- Commit 游标；
- 开放 Issue / PR 更新时间；
- 最近 Workflow Run；
- Webhook 失败记录。

只有发现差异才补拉。

### 数据新鲜度

```text
fresh
stale
partial
syncing
failed
authorization_revoked
```

超过 24 小时未成功同步时明确显示“数据可能过期”。

AI 分析前检查数据新鲜度；用户可在 stale / partial 时继续生成，但结果必须写明边界。

## 6.3 后台任务

MVP 使用 Inngest，但通过内部 `JobDispatcher` 接口隔离平台。

原则：

- 数据库是业务状态 Source of Truth；
- 每个任务有幂等键；
- 首次同步拆成可恢复步骤；
- Inngest 负责执行、重试与调度；
- Application Service 负责编排；
- 核心业务规则不写入平台配置；
- 保存平台无关任务记录。

任务状态：

```text
queued
running
partial
completed
failed
cancelled
```

---

# 7. AI 系统

## 7.1 供应商与架构

MVP 默认使用 DeepSeek，通过供应商无关的 `AIProvider` 接口调用。

业务模块不得：

- 直接依赖 DeepSeek SDK；
- 在组件内调用模型；
- 在 Prompt 中硬编码模型名；
- 失败后静默切换 Provider 或 Mock。

统一返回：

```text
parsed_output
raw_output
provider
model
token_usage
latency
status
refusal
error
```

## 7.2 能力划分

共享基础设施：

- Provider Adapter；
- Prompt Registry；
- 配额与缓存；
- AI Invocation Log；
- Runtime Schema；
- Evidence Reference；
- 成本与延迟记录；
- Structured Output Parser；
- Evidence Validator。

独立能力：

- Project Brief；
- Status / Action Suggestion；
- Decision Candidate。

每项能力分别维护：

- 输入 Schema；
- 输出 Schema；
- Prompt Version；
- Evidence Contract；
- Eval Dataset；
- 缓存键；
- 失败状态。

禁止一个 `analyzeEverything()` 巨型 Prompt。

## 7.3 项目简报 Contract

默认时间范围：最近 7 天，可切换 30 天或自定义范围。

输入：

- 当前单个项目；
- 项目核心目标；
- 当前阶段目标；
- 当前最大阻碍；
- 指定时间范围 GitHub 活动；
- 用户授权文档快照；
- 已确认决策记录；
- 数据最后同步时间。

输出：

- 时间范围；
- 项目正式状态；
- 本期主要变化；
- 已完成事项；
- 进行中事项；
- 失败或异常信号；
- 尚未解决的问题；
- 系统无法确认的信息；
- 证据引用；
- 数据新鲜度；
- 边界说明。

项目简报只回答“最近发生了什么”，不得偷偷加入：

- 下一步建议；
- 用户动机推断；
- 项目价值判断；
- 无证据支持的“重大突破”等结论。

## 7.4 简报生成链路

```text
用户主动生成
→ 检查权限与数据新鲜度
→ 构建 Evidence Snapshot
→ 计算 Evidence Fingerprint
→ 检查缓存
→ 原子预占能量点
→ DeepSeek 调用
→ 保存 Raw Output
→ JSON Parse
→ Runtime Schema Validation
→ Evidence Reference Validation
→ 成功保存 ProjectBrief 并扣点
→ 失败记录状态并退还额度
```

缓存键至少包含：

- user_id；
- project_id；
- 时间范围；
- evidence_fingerprint；
- prompt_version；
- schema_version；
- provider；
- model。

失败状态：

```text
failed_provider
failed_empty_output
failed_parse
failed_schema
failed_evidence_validation
quota_exceeded
completed
```

失败时：

- 不展示未经验证的自由文本；
- 不静默 fallback 到 Mock；
- 不扣最终能量点。

## 7.5 Eval

发布前至少 12～15 个固定案例，其中至少 4 个来自真实项目历史。

三层数据：

1. 人工构造 Contract Fixture；
2. 真实项目活动快照；
3. 从真实快照派生的对抗变体。

每个案例定义：

- 输入 Evidence Snapshot；
- 必须提到的事实；
- 禁止出现的断言；
- 允许但非必需的信息；
- 预期证据引用；
- 数据新鲜度。

评估维度：

- Schema 合法性；
- 事实一致性；
- 证据有效性；
- 时间范围遵守；
- 关键事件覆盖；
- 越界率；
- 信息组织；
- 可读性。

模型可协助生成对抗变体，但不能自行生成标准答案、评分并宣布通过。

---

# 8. 免费 Beta 与 AI 配额

MVP：

- 免费公开 Beta；
- 不接支付系统；
- 不做订阅、账单、退款和付费墙；
- 不支持 BYOK；
- 不支持多模型切换。

每日 AI 能量点：

```text
每日 10 点

项目简报：3 点
状态 / 行动建议：2 点
决策候选分析：2 点
基于已有简报追问：1 点
缓存命中：0 点
Provider / Parse / Schema / Evidence 失败：0 点
```

采用原子预占：

```text
检查余额
→ 预占
→ 执行
→ 校验成功后正式扣除
→ 失败释放额度
```

必须防止并发绕过、Inngest 重试重复扣点、重复请求、缓存命中扣点和校验失败扣点。

---

# 9. 核心数据模型

## 9.1 身份与授权

```text
User
GitHubIdentity
GitHubInstallation
SelectedRepository
```

内部业务表统一使用独立 `user_id`。

## 9.2 项目

```text
Project
- id
- user_id
- selected_repository_id
- official_status
- core_goal
- current_stage_goal
- current_blocker
- enabled
- last_successful_sync_at
- freshness_status
- created_at
- updated_at
```

## 9.3 GitHub 事实数据

不同对象使用独立表：

```text
RepositorySnapshot
CommitRecord
IssueRecord
PullRequestRecord
ReleaseRecord
WorkflowRunRecord
DocumentSnapshot
```

每类对象按 GitHub object ID 建立唯一约束，不把完整 GitHub API Response 当成主要业务模型。

## 9.4 同步

```text
SyncRun
WebhookDelivery
```

记录首次同步、增量同步、对账、手动同步、幂等、游标、错误和平台 Job ID。

## 9.5 建议与决策

```text
ProjectStatusSuggestion
ActionSuggestion
DecisionCandidate
DecisionRecord
```

必须区分系统建议、AI 候选和用户确认后的正式记录。

## 9.6 AI 产物与可观测性

```text
ProjectBrief
AIInvocation
```

`ProjectBrief` 是用户可见业务产物；`AIInvocation` 是模型调用、费用、版本和失败记录。

## 9.7 Evidence Reference

```text
EvidenceReference
- source_type
- source_id
- project_id
- occurred_at
- title
- original_url
```

允许引用：

- commit；
- issue；
- pull_request；
- release；
- workflow_run；
- project_profile；
- decision_record；
- document_snapshot。

验证至少检查：真实存在、属于当前用户与项目、在时间范围内、用户仍有权限、文档 SHA 匹配。

---

# 10. 安全与隐私

## 10.1 数据分层

必须分开保存：

```text
GitHub 事实
用户陈述
确定性统计
系统建议
AI 候选
用户确认后的正式记录
```

AI 不能覆写 GitHub 事实和用户确认记录。

## 10.2 多用户隔离

采用：

- Supabase RLS；
- 服务端 Application / Infrastructure 权限校验。

任何读取同时验证：

- `row.user_id = auth.uid()`；
- Installation 属于当前用户；
- Repository 仍在授权范围；
- Repository 被用户主动选择；
- Project 仍启用。

禁止信任浏览器传来的 `user_id`。

## 10.3 Secret

以下内容永不进入 Git、浏览器、普通业务表、日志或 AI 上下文：

- GitHub App Private Key；
- GitHub Webhook Secret；
- Installation Token；
- Supabase Service Role Key；
- DeepSeek API Key。

Staging 与 Production Secret 完全隔离。

## 10.4 私有仓库

- 私有仓库数据永不进入公共页面；
- 不生成公共分享链接；
- 不做项目广场；
- 不允许搜索其他用户；
- 不使用真实私有数据制作 Demo；
- 公开仓库在 EXECUTOR 内也按私有用户数据处理。

---

# 11. 数据生命周期

## 11.1 移除仓库

用户可选择：

### 停止同步，保留个人记录

删除 GitHub 活动快照、文档快照、AI 简报和候选分析。

保留用户确认的状态历史、Decision Record 和用户手写项目档案；旧证据链接标记不可用。

### 删除全部项目数据

删除 Project、GitHub 快照、文档快照、建议、决策候选、正式决策、AI 简报及相关调用输入输出。

## 11.2 GitHub App 撤销

```text
Installation 标记 revoked
→ 停止新同步
→ 阻止新 AI 分析
→ 项目标记授权失效
→ 等待用户决定保留或删除数据
```

旧数据可暂时显示，但必须明确不再更新。

## 11.3 账户删除

```text
用户申请删除
→ deletion_pending
→ 停止同步与 AI
→ 7 天撤销期
→ 后台彻底删除
→ 删除 Supabase Auth 身份
→ 保存不可反推用户的匿名删除结果
```

删除任务必须可重试、有幂等键、有状态、能报告部分失败，所有子资源成功删除后才标记完成。

---

# 12. 技术架构

## 12.1 总体方案

采用：

> Next.js + TypeScript 模块化单体

主要组件：

- Next.js App Router；
- Supabase / PostgreSQL；
- Supabase Auth；
- GitHub App；
- Inngest；
- DeepSeek；
- Vercel；
- Runtime Schema；
- 测试与 CI。

MVP 不采用：

- FastAPI 独立后端；
- Python AI 微服务；
- 微服务拆分；
- 完整源码扫描；
- GitHub 写权限。

## 12.2 依赖方向

```text
UI
↓
Application Use Cases
↓
Domain

Infrastructure
↑
通过接口接入 Application / Domain
```

UI 不得直接调用 GitHub API、数据库、Inngest 或 DeepSeek。

## 12.3 推荐目录

```text
src/
├── app/
├── features/
│   ├── command-deck/
│   ├── project-galaxy/
│   ├── flight-log/
│   ├── mission-control/
│   ├── decision-archive/
│   └── copilot/
├── domain/
├── application/
├── infrastructure/
│   ├── github/
│   ├── database/
│   ├── jobs/
│   ├── ai/
│   └── observability/
├── shared/
└── content/
```

职责：

- `app/`：路由、页面组合、Session 检查、HTTP 适配；
- `features/`：页面、组件、交互与展示模型；
- `domain/`：纯 TypeScript 业务规则；
- `application/`：编排单个明确用例；
- `infrastructure/`：外部系统适配器与数据库实现。

## 12.4 Feature Registry

每个面板以 Feature Module 注册。主舰桥只负责渲染、排序、路由、Preview / Connected 模式和权限要求。

新增面板时：

1. 新建 Feature Module；
2. 实现统一接口；
3. 注册；
4. 添加测试；
5. 不向舰桥主组件添加业务逻辑。

## 12.5 God Component 防护

- 页面组件超过约 300 行时检查职责；
- Route Handler 不承担领域规则；
- Prompt 不写在 React Component；
- 数据库查询不散落在页面；
- Feature 不直接导入其他 Feature 内部文件；
- Domain 不导入 Infrastructure；
- Application Service 不编排多个无关用例；
- 新功能不通过继续膨胀现有大文件实现。

---

# 13. Git 与工程工作流

## 13.1 仓库策略

- 从第一天公开仓库；
- MVP 暂不添加开源许可证；
- 源码公开可查看，但不授予复制、修改、分发权；
- README 写明 All rights reserved；
- MVP 暂不接受外部 Pull Request；
- 普通 Bug 与产品反馈可通过 Issue 提交；
- 安全问题通过 `SECURITY.md` 私下报告。

## 13.2 Git Workflow

采用短生命周期 Feature Branch + PR + CI 的 Trunk-based Workflow：

```text
Issue
→ 从最新 main 创建短分支
→ 测试或验收条件先行
→ 小步提交
→ 推送远端
→ PR
→ Diff 自审
→ CI
→ 合并
→ 删除分支
```

规则：

- 禁止直接向 main Push；
- 一个分支只解决一个 Issue；
- 分支原则上不超过 1～2 个工作日；
- main 始终可构建、可测试、可部署；
- Codex 一次只执行一个明确 Issue；
- Release 使用 Tag 与 Changelog；
- Commit 使用简化 Conventional Commits。

## 13.3 PR 模板

每个 PR 回答：

- 解决什么问题；
- 对应哪个 Issue；
- 明确不做什么；
- 验收条件；
- 测试变化；
- 数据迁移；
- 是否影响权限、AI、同步或成本；
- 人工验证方式；
- 回滚方式。

---

# 14. 测试策略

## 14.1 TDD 边界

严格 TDD：

- Webhook 验签与幂等；
- 用户、Installation、仓库权限隔离；
- 首次同步、游标、去重；
- 项目状态转换；
- 建议状态转换；
- 决策确认；
- AI Runtime Schema；
- Evidence Validation；
- AI 配额、缓存与退款；
- 撤权、仓库移除、账户删除。

UI 采用验收驱动：开发前写 Given / When / Then；组件测试覆盖关键交互；Playwright 覆盖少量核心旅程；不测试纯装饰与每个像素。

## 14.2 四层测试

### Domain Unit Tests

纯 TypeScript。

### Application Integration Tests

本地 Supabase、Migration、RLS、Repository、事务、删除和同步幂等。

### Component / Contract Tests

Preview / Connected、GitHub Fixture、DeepSeek Mock、Inngest Dispatcher、Runtime Schema 与错误状态。

### E2E 与 Staging Smoke

核心旅程：

- 访客探索演示舰桥；
- 登录、安装 GitHub App、选择仓库、校准并查看同步；
- 状态建议由用户确认；
- 生成项目简报、证据可点击、能量点正确结算。

真实 GitHub、Inngest、DeepSeek 链路只在 Staging Smoke 中执行。

## 14.3 质量规则

- 每个 Bug 修复先加入回归测试；
- 不删除、跳过或弱化测试让 CI 通过；
- 不以覆盖率替代行为质量；
- 重构时行为测试保持不变；
- PR 必须通过 lint、typecheck、test 和 build。

---

# 15. 环境、数据库与发布

## 15.1 环境

### Local

本地 Supabase、Inngest Dev、Mock GitHub、Mock DeepSeek、TDD 与 UI 开发。

### PR Preview

验证 UI、交互与构建；使用演示或隔离测试数据；禁止生产 Secret；不承担完整真实 GitHub App 集成。

### Staging

独立 Vercel、Supabase、GitHub OAuth App、GitHub App、Inngest、DeepSeek Secret 与配额。

### Production

独立生产资源。

采用两个 Vercel 项目：

```text
executor-staging
executor-production
```

## 15.2 Migration-first

数据库环境：

```text
Local Supabase
Staging Supabase
Production Supabase
```

所有表、索引、RLS、函数和触发器必须通过 Migration 创建。

禁止：

- 只在 Dashboard 手改；
- 修改已进入 Production 的旧 Migration；
- Staging 与 Production 使用不同未提交 Schema。

流程：

```text
新 Migration
→ 本地空库重建
→ 数据库测试
→ PR
→ Staging Migration
→ Smoke Test
→ Production Migration
```

## 15.3 CI

建议统一命令：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

CI 不得读取生产 Secret、调用真实 DeepSeek、使用真实 GitHub App 或访问真实用户数据。

## 15.4 发布流程

```text
Feature Branch
→ PR
→ CI
→ Preview
→ Merge main
→ Staging Deployment
→ Migration
→ Smoke Test
→ 人工批准
→ Production Deployment
→ Release Tag
→ Changelog
```

Production 不自动接收所有 main 变更。

---

# 16. 语言与品牌

品牌：

```text
EXECUTOR
Command Your Projects
```

模块名：

```text
Command Deck       舰桥首页
Project Galaxy     项目星图
Flight Log         航行日志
Mission Control    任务中枢
Decision Archive   决策档案
Copilot            AI 副驾驶
```

MVP 中文优先，保留英文品牌与模块名，后续再加入中英文切换。

为未来国际化预留：核心文案集中管理；数据库存稳定代码值；Prompt 显式指定输出语言；MVP 不实现完整 i18n 路由和翻译后台。

---

# 17. 设备范围

MVP 桌面 Web 优先。

桌面提供完整 Command Deck、五面板布局、三栏工作区、项目星图、航行时间线与证据面板。

移动端保证可登录、查看摘要和处理简单操作，使用纵向卡片和抽屉导航，不追求完整 HUD 舰桥体验。

---

# 18. 六周实施范围

## Week 1：工程基线

公开仓库、README 与版权声明、Next.js、Feature Registry 骨架、Supabase Local、Migration、测试框架、CI、Preview、第一批 Issue / Branch / PR。

## Week 2：身份与仓库接入

Supabase GitHub 登录、GitHub App、Installation、仓库选择、项目校准、RLS、Staging。

## Week 3：同步主链

90 天首次同步、Inngest、Webhook、幂等、游标、每日对账、手动同步、数据新鲜度。

## Week 4：五面板基础版

Command Deck、Project Galaxy、Flight Log、Mission Control、Decision Archive、Copilot 工作区、Preview / Connected Mode。

## Week 5：项目简报

Evidence Snapshot、DeepSeek Provider、Prompt / Schema、Evidence Validator、缓存、能量点、调用日志、12～15 个 Eval Case。

## Week 6：Editor Mode

禁止新增面板和大型功能，只做 Bug 修复、E2E、Staging Smoke、安全审查、删除验证、视觉统一、README、演示数据、Changelog、Release 与 Production。

---

# 19. MVP 明确不做

- GitHub 写权限；
- 自动创建 Issue；
- 自动修改代码或合并 PR；
- 完整源码和 Diff 扫描；
- 多仓库组成一个项目；
- 团队协作；
- 公共项目广场；
- 公开分享页；
- 支付系统；
- BYOK；
- 多模型选择；
- 多语言切换；
- 移动端完整舰桥；
- 自动改变正式项目状态；
- Agent；
- Python AI 微服务；
- 微服务拆分；
- 同时完整实现全部 AI 能力；
- 外部代码贡献。

---

# 20. MVP Definition of Done

## 产品

- 免费公开 Beta 可注册；
- 五个面板均有可用基础版；
- Preview Mode 可完整探索；
- Connected Mode 可读取用户选择的仓库；
- GitHub 登录、App 安装、仓库选择与项目校准成立；
- 项目状态由用户确认；
- 项目简报基于证据生成并验证。

## GitHub 与同步

- 公开与私有仓库均可主动授权；
- 首次同步最近 90 天；
- Webhook 增量同步；
- 每日轻量对账；
- 手动重同步；
- 幂等、游标与数据新鲜度成立。

## AI

- DeepSeek 通过 `AIProvider` 接入；
- Prompt、Schema、Provider、Model 有版本记录；
- Raw Output 保存；
- Parse、Schema、Evidence 失败明确区分；
- 缓存与能量点正确；
- 至少 12～15 个 Eval Case；
- 至少 4 个来自真实项目历史。

## 工程

- Git 历史可解释项目演进；
- Feature Branch + PR + CI 真实执行；
- 测试真实捕获过 Bug；
- CI 真实拒绝过不合格 PR；
- 数据库可从 Migration 在空环境重建；
- RLS 有自动化测试；
- Staging 与 Production 隔离；
- 完成正式 Release、Tag 与 Changelog；
- 可以从远端仓库和环境说明恢复项目；
- 没有承担多数系统职责的 God Component / God Store / God Service。

## 安全与生命周期

- GitHub 只读；
- Secret 不进入 Git；
- 私有仓库数据不公开；
- 撤权停止同步和 AI；
- 仓库移除真实可执行；
- 账户删除有 7 天撤销期并可后台彻底删除；
- Preview 不接触真实用户数据。

---

# 21. 设计自检

## 21.1 Placeholder Scan

未发现 TBD、TODO 或未决核心产品范围。

具体包版本、数据库字段类型细节与外部服务配置值属于实施计划，不在本设计中提前锁死。

## 21.2 Internal Consistency

已确认：

- GitHub 登录与 GitHub App 授权职责分离；
- GitHub 只读与 Issue 草稿设计一致；
- Preview Mode 与隐私边界一致；
- DeepSeek 单供应商与 `AIProvider` 抽象不冲突；
- 状态建议与用户最终确认原则一致；
- 五个面板与六周范围一致；
- 数据保留、仓库移除和账户删除规则一致；
- Inngest 托管执行与数据库 Source of Truth 一致；
- 模块化单体与未来可拆分服务不冲突。

## 21.3 Scope Check

本设计规模较大，但已通过以下方式收敛：

- 主 AI 能力缩减为项目简报；
- 五个面板仅做基础版；
- 禁止 GitHub 写权限、代码扫描、付费、多语言、团队与分享；
- 第六周进入 Editor Mode。

实施计划必须拆成可独立合并的垂直切片和 Issue，不能将“完成整个 EXECUTOR”作为单一 Codex 任务。

## 21.4 Ambiguity Check

已明确：

- 一个仓库就是一个项目；
- 用户手动选择仓库；
- 默认同步 90 天；
- 每日轻量对账；
- 超过 24 小时标记 stale；
- 所有真实用户数据私有；
- GitHub 只读；
- 项目正式状态由用户确认；
- MVP 使用 DeepSeek；
- 每日 10 个 AI 能量点；
- 公开仓库但无开源许可证；
- 不接受外部 PR；
- 桌面 Web 优先；
- 中文优先。

---

# 22. 下一阶段门槛

本设计经用户复核批准后，下一阶段是：

> 根据本规格编写详细实施计划。

实施计划必须：

- 以 Issue / PR 为实施单位；
- 拆成短生命周期垂直切片；
- 标明每个任务允许修改的模块；
- 为核心领域规则设计测试先行步骤；
- 明确 Migration、CI、Preview、Staging 与 Production 的顺序；
- 不跳过设计中明确禁止的 MVP 外功能；
- 不直接开始全项目编码。
