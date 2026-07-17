# EXECUTOR

## Command Your Projects

**中文语境名称：执行者号**

EXECUTOR 是面向个人开发者和 AI 创作者的 GitHub 项目指挥中心，将用户主动授权的 GitHub 仓库转化为可追溯的项目状态、近期进展、候选行动、决策记录和有证据边界的 AI 简报。

## 当前状态

MVP 规划与工程基线建设中。

本仓库当前仅固化产品设计、阶段计划和仓库治理约定。这不表示阶段 1 已全部完成，也不表示 CI、Required Status Checks、Next.js 工具链、数据库基线、Preview Mode 或生产部署已经建立。

## MVP 主要边界

- 面向个人开发者与 AI 创作者，桌面 Web 优先。
- 只读取用户主动授权的 GitHub 仓库，不申请 GitHub 写权限。
- 一个被选择的 GitHub 仓库对应一个 EXECUTOR 项目。
- 正式项目状态和关键决策由用户确认，系统只提供证据、候选建议与有边界的 AI 简报。
- MVP 不实现团队、支付、BYOK、多模型、完整源码或 Diff 扫描、公开项目页及自动修改仓库。

## 仓库使用与版权声明

This repository is publicly visible for review purposes only.

Copyright © 2026. All rights reserved.

No license is granted to copy, modify, distribute, sublicense, or create derivative works from this source code.

本仓库源码公开仅供查看。除非版权所有者另行书面授权，否则不授予复制、修改、分发、再许可或创作衍生作品的权利。

## 贡献政策

- MVP 阶段不接受外部 Pull Request。
- 普通 Bug 和产品反馈可以通过 GitHub Issue 提交。
- 项目维护者通过短生命周期分支和 Pull Request 向 `main` 提交修改。
- 详细规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全报告入口

安全问题不得提交到公开 Issue、Discussion、Pull Request 或 Commit。请按照 [SECURITY.md](SECURITY.md) 使用 GitHub Private Vulnerability Reporting / Repository Security Advisory 私密报告。

## 设计与计划

- [MVP 产品与系统设计规格](docs/superpowers/specs/2026-07-16-executor-design.md)
- [阶段 1：工程基线实施计划](docs/superpowers/plans/2026-07-17-executor-stage-1-engineering-baseline.md)
