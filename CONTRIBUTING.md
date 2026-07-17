# 贡献与维护规则

## 外部用户

- 可以通过 GitHub Issue 报告普通 Bug 或产品反馈。
- MVP 阶段不接受外部 Pull Request。
- 不得通过公开 Issue、Discussion、Pull Request、Commit 或其他公开渠道提交安全问题；安全报告必须遵循 [SECURITY.md](SECURITY.md)。
- Issue 应说明问题、复现条件、期望结果和必要的非敏感证据。

## 项目维护者

维护者采用以下工作流：

```text
Issue
→ 从最新 main 创建短生命周期分支
→ 测试或验收条件先行
→ 小步提交
→ 推送远程
→ Pull Request
→ Diff 自审
→ Required Checks
→ 审阅
→ 合并
→ 删除分支
```

约束：

- 一个分支只解决一个 Issue。
- 原则上分支不超过 1～2 个工作日。
- 禁止直接向 `main` Push。
- 禁止跳过、删除或弱化测试以让检查通过。
- 禁止提交 Secret、真实 API Key、私钥或生产环境配置值。
- Commit 使用简化 Conventional Commits，例如 `feat:`、`fix:`、`docs:`、`test:`、`refactor:` 和 `chore:`。
- Pull Request 必须填写仓库模板，并明确验收、人工验证和回滚方式。
- 合并前解决所有 PR 对话；不得通过强制推送绕过审阅记录。

Required Checks 会在阶段 1 / Task 6 的 CI Workflow 建立后启用。在此之前不得宣称 CI 门禁已经生效，也不得创建虚假的检查名称或临时 Workflow 冒充门禁。

## AI 编码执行者

AI 编码执行者必须遵守与维护者相同的分支、提交、测试和安全规则，并额外遵守：

- 一次只执行一个明确 Issue，不扩展到未授权任务。
- 修改前审计工作区、当前分支、未提交修改和允许文件范围。
- 只依据已批准的设计与计划工作，不把推断写成正式需求。
- 不覆盖合理的用户文件，不删除未知文件，不重写历史，不强制推送。
- 不提交真实 Secret，不在输出中回显凭据。
- 所有完成声明必须附带本次执行产生的验证证据。
- 未满足验收条件时，如实列出未完成项和阻塞项。
