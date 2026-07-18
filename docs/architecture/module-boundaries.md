# EXECUTOR 模块边界

## 目标

本文件记录 `feature-registry.v1` 与 `module-boundaries.v1`。Feature Registry 固化五个核心 Feature 的身份、展示文案、路由元数据和顺序；模块边界规则保护 Domain 的纯 TypeScript 属性，并防止 Feature 绕过公开入口读取其他 Feature 的内部文件。

本阶段只建立注册表、边界规则和验证机制，不代表五个 Feature Module、页面或路由已经实现。

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

### 当前尚未自动强制

- 尚未全面验证 `src/application`、`src/infrastructure` 与 `src/app` 的所有依赖方向。
- 尚未检测模块循环依赖或所有可能的运行时反射加载方式。
- 尚未强制每个 Feature 已经存在公开根入口，也未验证公共入口导出的业务 API 设计。
- 尚未验证五个 Registry Route 对应真实页面；本阶段明确不创建这些页面。
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

本阶段不实现五个面板页面、任何新增 Next.js Route、Command Deck、Preview Mode、Feature Flag、权限判断、Supabase、GitHub 集成、Inngest、AI Provider、数据库、API Route、Server Action、后台任务、CI 或最终 HUD 视觉。
