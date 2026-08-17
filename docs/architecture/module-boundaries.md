# EXECUTOR 模块边界

## 目标

本文件记录 `feature-registry.v1`、`panel-query.v1` 与 `module-boundaries.v1`。Feature Registry 固化五个核心 Feature 的身份、展示文案、路由元数据和顺序；Panel Query 提供后续面板共用的 Preview / Connected 查询合同；模块边界规则保护纯 TypeScript 合同，并防止 Feature 绕过公开入口读取其他 Feature 的内部文件。

注册表元数据不等同于页面实现；当前只有经过对应阶段验证的 Feature 才能被视为具备公开页面。

## 模块化单体依赖方向

目标依赖方向是：应用组合层使用 Feature 的公开根入口，Feature 可以使用自身内部模块、公开的其他 Feature 根入口和纯 shared contract，Domain 只能使用自身模块及不含框架或基础设施的纯 TypeScript shared 模块。

```text
src/app
  → Feature public root
    → Feature internals
    → Domain / pure shared contracts

Domain
  → Domain internals / pure shared contracts
  ✕ React / Next.js / external service SDKs
```

这张方向图描述边界目标，不表示当前仓库已经创建 `src/features` 或 `src/domain` 下的业务模块。

## Feature Registry 职责

Registry 位于 `src/shared/features/feature-registry.ts`，只负责提供稳定、类型安全的 Feature 元数据。它不扫描目录、不动态加载模块、不读取环境变量，也不执行权限判断、网络请求或 Feature Flag。

### FeatureDefinition Contract

```ts
export type FeatureId =
  | "project-galaxy"
  | "flight-log"
  | "mission-control"
  | "decision-archive"
  | "copilot";

export interface FeatureDefinition {
  id: FeatureId;
  title: string;
  subtitle: string;
  route: string;
  order: number;
  requiresGitHubData: boolean;
}
```

### 五个固定 Feature

| ID | Title | Subtitle | Route | Order | requiresGitHubData |
| --- | --- | --- | --- | ---: | --- |
| `project-galaxy` | Project Galaxy | 项目星图 | `/project-galaxy` | 10 | `true` |
| `flight-log` | Flight Log | 航行日志 | `/flight-log` | 20 | `true` |
| `mission-control` | Mission Control | 任务中枢 | `/mission-control` | 30 | `true` |
| `decision-archive` | Decision Archive | 决策档案 | `/decision-archive` | 40 | `true` |
| `copilot` | Copilot | AI 副驾驶 | `/copilot` | 50 | `true` |

ID、Route 和 Order 是稳定契约：三者分别唯一，Registry 顺序与严格递增的 Order 一致。修改这些值属于契约变更，不能作为普通内部重构处理。Route 是元数据，不表示对应 Next.js Route 已经存在。

## Panel Query 公共合同

唯一公共入口是 `src/shared/panel-query/index.ts`，后续调用方应通过 `@/shared/panel-query` 复用。冻结合同为：

```ts
export type PanelMode = "preview" | "connected";

export interface PanelQuery<T> {
  load(): Promise<T>;
}
```

`createPreviewPanelQuery` 接收本地 Preview loader，`createConnectedPanelQuery` 接收调用方注入的 provider-neutral `ConnectedPanelPort<T>`。两者都返回同一个 `PanelQuery<T>`，不定义两套 View Model，也不在合同层读取 Supabase、GitHub、Inngest、网络或 Feature 内部文件。

`resolvePanelQuery` 必须由调用方传入明确的 `PanelMode`；`parsePanelMode` 只接受精确字面量，未知值抛出 `InvalidPanelModeError`。Connected port 的失败原样保持可观察，不捕获、不补入 Demo 数据，也不回退 Preview。

数据来源的责任边界如下：

```text
Preview fixture / loader → createPreviewPanelQuery ┐
                                                   ├→ PanelQuery<T> → caller
Injected ConnectedPanelPort<T> → createConnectedPanelQuery ┘
```

公共合同本身不包含任何面板业务 View Model。具体 Feature 后续可以声明自身唯一的 `T`，但 Preview 与 Connected 必须对同一 `T` 完成确定性映射。

## Project Galaxy 公共边界

Project Galaxy 的唯一公开入口是 `src/features/project-galaxy/index.ts`。Preview 与 Connected 都映射为同一个 `ProjectGalaxyViewModel`，UI 只消费该 View Model；Feature 内部的 query adapter 只接收注入的 loader 或 port，不直接导入 Demo fixture、基础设施、外部 Provider SDK 或 `server-only`。

数据链路为：

```text
src/app/project-galaxy/page.tsx
  → explicit PanelMode
  → injected Preview loader / Connected port
  → Project Galaxy query
  → deterministic mapper
  → ProjectGalaxyViewModel
  → ProjectGalaxyPanel
```

`officialStatus` 是项目事实，`suggestedStatus` 是独立、可空的建议；两者不得相互 fallback。读取、刷新或渲染建议不会赋值、回写或替换 Official Status。Connected 失败保持可观察，不回退 Preview。

## Flight Log 公共边界

Flight Log 的唯一公开入口是 `src/features/flight-log/index.ts`。Preview 与 Connected 共用 `FlightLogViewModel` 和公共 `PanelQuery<T>`；Feature 只接收注入的 loader 或 port，不直接导入 Demo fixture、基础设施、外部 Provider SDK 或 `server-only`。

```text
src/app/flight-log/page.tsx
  → explicit PanelMode + validated filters
  → injected Preview loader / Connected port
  → Flight Log query
  → deterministic filter and mapper
  → FlightLogViewModel
  → FlightLogPanel
```

统一事件类型固定为 `commit | issue | pull_request | release | workflow | sync_event`。排序按 `occurredAt` 降序、固定类型顺序、稳定 ID 升序；时间窗口使用 UTC 包含边界。只有不含凭据的合法 `https` 原始 URL 可渲染为链接。Connected 失败保持可观察且不回退 Preview。

## Mission Control 公共边界

Mission Control 的唯一公开入口是 `src/features/mission-control/index.ts`。Preview 与 Connected 共用 `MissionControlViewModel` 和公共 `PanelQuery<T>`；Feature 只接收注入的 loader 或只读 port，不直接导入 Demo fixture、基础设施、外部 Provider SDK 或 `server-only`。

```text
src/app/mission-control/page.tsx
  → explicit PanelMode
  → injected Preview loader / Connected read port
  → Mission Control query
  → deterministic mapper
  → recordedTasks + suggestions
  → MissionControlViewModel
  → MissionControlPanel
```

`recordedTasks` 只表达 GitHub 已记录事实，`suggestions` 只表达本地候选行动；两者按稳定 ID 对齐，不按标题合并，也不在状态转换中互相移动。建议状态固定为 `suggested | accepted | snoozed | dismissed | completed`。`accepted` 与 `completed` 均不声明 GitHub 远端状态；纯本地 Issue 草稿只包含 `title`、`body` 与 `sourceSuggestionId`，不包含远端 Issue number 或 URL，也不触发网络写入。Connected 失败保持可观察且不回退 Preview。

## Decision Archive 公共边界

Decision Archive 的唯一公开入口是 `src/features/decision-archive/index.ts`。Preview 与 Connected 共用 `DecisionArchiveViewModel` 和公共 `PanelQuery<T>`；Feature 只接收注入的 loader 或 port，不直接导入 Demo fixture、基础设施、外部 Provider SDK、AI 模型或 `server-only`。

```text
src/app/decision-archive/page.tsx
  → explicit PanelMode
  → injected Preview loader / Connected port
  → Decision Archive query
  → deterministic mapper
  → candidates + records
  → explicit local manual / confirmation action
  → DecisionArchiveViewModel
  → DecisionArchivePanel
```

`DecisionCandidate` 与 `DecisionRecord` 是不同类型和集合，按稳定 ID 关联而不按标题合并。Candidate 只有在用户显式确认并填写非空白原因后，才能生成带独立 ID 的 Record；确认后 Candidate 仍保留，并记录 `confirmedRecordId`。手动 Record 不需要 Candidate。ID、确认者与时间由调用方注入，操作仅返回本地 View Model，不声明数据库持久化、真实模型调用或外部写入。Connected 失败保持可观察且不回退 Preview。

## Domain 纯 TypeScript 边界

`src/domain/**` 不得导入 React、Next.js、Supabase、Octokit、Inngest 或 AI SDK。Vitest AST 扫描覆盖静态 import、`export ... from`、动态 `import()`、`require()`、`ImportTypeNode` 和引用外部模块的 `ImportEqualsDeclaration`。

允许：

```ts
import { ProjectId } from "./project-id";
import type { DomainContract } from "@/shared/contracts";
import ProjectIdAlias = require("./project-id");
```

禁止：

```ts
import React from "react";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const provider = await import("@ai-sdk/openai");
const Octokit = require("octokit");
type ReactType = import("react").ReactType;
import ReactAlias = require("react");
```

## Feature public root 与 internal 边界

Feature 根目录语义是 `src/features/<feature-name>/`。跨 Feature 只能通过 `@/features/<target-feature>` 公开根入口交互。根入口以外的文件默认私有；同一 Feature 内部应使用相对路径。

允许：

```ts
import { localValue } from "./internal/local-value";
import type { SharedContract } from "@/shared/contracts";
import { publicApi } from "@/features/flight-log";
import PublicApiAlias = require("@/features/flight-log");
```

禁止：

```ts
import { secret } from "@/features/flight-log/internal/secret";
import { secret } from "../flight-log/internal/secret";
export { secret } from "@/features/flight-log/internal/secret";
const secret = await import("@/features/flight-log/internal/secret");
import SecretAlias = require("@/features/flight-log/internal/secret");
```

自身内部文件也不应通过 `@/features/<current-feature>/...` 导入；使用相对路径可以清楚地区分内部实现与公共 API。`ImportEqualsDeclaration` 同样必须遵守 public root 与 internal 规则，不能作为绕过方式。

## 自动化执行范围

### ESLint 已强制

- 对 `src/domain/**/*.{ts,tsx,js,jsx,mts,cts}`，`no-restricted-imports` 禁止静态导入或重导出冻结列表中的框架和外部 SDK。
- 对 `src/features/**/*.{ts,tsx,js,jsx,mts,cts}`，`no-restricted-imports` 禁止 `@/features/*/**` 内部别名，同时允许 `@/features/<feature-name>` 公开根入口。
- 继续保留 Next.js Core Web Vitals、Next.js TypeScript 和零 warning 要求。

这里仅描述现有 `no-restricted-imports` 配置的实际覆盖，不宣称 ESLint 能独立识别所有 TypeScript 特殊模块语法。`ImportTypeNode` 与 `ImportEqualsDeclaration` 的确定性覆盖由下方 Vitest AST 扫描提供。

### Vitest 架构扫描已强制

- 使用 TypeScript Compiler API 从 AST 提取 `ImportDeclaration`、`ExportDeclaration`、动态 `import()` CallExpression、`require()` CallExpression、`ImportTypeNode`，以及 `ImportEqualsDeclaration + ExternalModuleReference` 的字符串 module specifier。
- `type ReactType = import("react").ReactType` 与 `import ReactAlias = require("react")` 在 Domain 中都会被 AST 扫描拒绝；非 `ExternalModuleReference` 的 TypeScript 内部别名不会生成 module specifier。
- 递归扫描现有 `src/domain` 与 `src/features`；目录不存在时允许空扫描，但合成规则测试仍执行。
- 识别 importer 所属 Feature、Feature 别名和跨 Feature 相对路径。
- 每个违规包含文件、specifier、引用类型和原因。
- 正向与负向内存合成示例验证边界分类，当前源码树违规数必须为 0。
- 递归扫描 `src/shared/panel-query`，禁止其导入 Feature、Demo fixture、应用或基础设施内部模块，以及 React、Next.js、Supabase、Octokit、Inngest、AI SDK、`server-only` 和 Node.js 运行时模块。
- 对 `src/features/project-galaxy`、`src/features/flight-log`、`src/features/mission-control` 与 `src/features/decision-archive` 额外禁止直接导入 Demo fixture、基础设施、外部 Provider SDK 与 `server-only`，确保两种来源只能经注入边界进入。

### 当前尚未自动强制

- 尚未全面验证 `src/application`、`src/infrastructure` 与 `src/app` 的所有依赖方向。
- 尚未检测模块循环依赖或所有可能的运行时反射加载方式。
- 尚未强制每个 Feature 已经存在公开根入口，也未验证公共入口导出的业务 API 设计。
- 尚未验证 Copilot Registry Route 对应真实业务页面；Project Galaxy、Flight Log、Mission Control 与 Decision Archive 已由各自阶段测试覆盖。
- 尚未把整个模块化单体的所有架构约束编码为自动化规则。

这些项目属于未自动覆盖范围，不能因为当前测试通过就宣称已经得到保证。

## 新增 Feature 的标准步骤

1. 创建独立 Feature Module。
2. 提供公开根入口。
3. 注册 FeatureDefinition。
4. 添加 Registry Test。
5. 添加模块边界验证。
6. 不向 Command Deck 主组件加入该 Feature 的业务逻辑。

## 违规修复方式

- Domain 需要框架或外部 SDK 时，把适配逻辑移到未来的基础设施边界，并让 Domain 依赖纯 TypeScript contract。
- 跨 Feature 读取内部文件时，在目标 Feature 的公开根入口暴露稳定 API，再改用根入口导入。
- Feature 读取自身内部文件时，改用相对路径。
- 不得通过关闭规则、添加跳过、放宽路径或删除负向测试处理违规。

## 本 Phase 明确不做

Decision Archive Phase 只实现 Candidate/Record 严格分区、手动记录、带用户原因的显式本地确认、Preview/Connected query 组合与展示；不实现 Copilot 或后续 Connected 业务旅程，也不调用真实模型，不修改 Command Deck Shell、Feature Registry、数据库、认证、同步管线或任何外部 Provider。
