# 七项修复与换电脑交接

更新日期：2026-10-14。成果分支：`fix/seven-fixes-v2`。本次上传源码、测试、迁移、配置和必要设计文档；正式生产发布尚未执行。

## 当前成果

七项修复已完成开发、验证和用户可见结果确认：正式入口与登录返回、多项目导航、账号隔离、可跳过的项目背景与部分更新、GitHub安装与仓库管理、首页和五面板、手动决策以及可追溯简报。T13.1真实联调成功，T14固定独立审核为A，八项普通完整检查实际通过。

T14仅在既有测试入口完成一次ON→兼容OFF→原ON，现有项目、简报和技术记录可读且保留；本轮上传不重新生成简报、不重复演练或重跑整套历史测试。简报模型历史三次调用、两次失败释放、一份成功净消耗三点，是既有测试结果，不是新电脑需重复执行的步骤。

## 新电脑获取源码

```powershell
git clone --branch fix/seven-fixes-v2 --single-branch https://github.com/hehehehehehecai/executor-command-center.git
Set-Location executor-command-center
git log -1 --oneline
pnpm install --frozen-lockfile
pnpm dev
```

实际上传commit以分支提交和原机交接报告为准。克隆得到独立仓库，无须复制旧worktree指针。工具版本以README、package.json与pnpm-lock.yaml为准；不要用其他分支旧源码覆盖本分支。Connected功能需要另行恢复正确环境配置，空配置能否启动依现有环境校验判断。

## 数据库迁移与本地测试

仓库包含34份原始迁移，按顺序保留。七项修复新增三份：

| 顺序 | 本地迁移文件 | 既有测试云端登记版本 |
|---|---|---|
| 1 | 20260928050442_add_unconfirmed_project_context.sql | 20261012071335 |
| 2 | 20260930021239_support_unconfirmed_project_consumers.sql | 20261012071338 |
| 3 | 20261010025154_add_manual_decision_records.sql | 20261012071340 |

测试库已有34份，不因换电脑重新应用；本地和测试云端时间戳不同，核对迁移名称、顺序及SQL内容。新的可空背景、现有消费者兼容、手动决策权限、RLS/RPC/唯一索引和database.types.ts属于同一修复版本，不能只带三份SQL而漏掉源码。

本地数据库测试由`scripts/isolated-test-target.mjs`与`run-isolated-database.mjs`验证目标身份。config.toml保留已审隔离配置；克隆不会带回原Docker数据库卷和身份收据。如需继续数据库测试，先参考`docs/runbooks/local-database.md`核对目标、端口和原有环境恢复要求；不要重置、复用或向旧库盲目执行迁移。

## 配置与未入库资料

GitHub OAuth/App、Supabase、DeepSeek和Inngest的实际配置/私钥须通过受控方式单独恢复，仓库配置模板不是秘密值备份。两个写入开关为`PROJECT_CONTEXT_WRITES_ENABLED`和`DECISION_RECORD_WRITES_ENABLED`，区分测试和生产，不能把测试配置直接用于生产。

本次不上传.env、秘密值、数据库备份、会话与真实身份原件、node_modules/.next/pnpm缓存、全量外部阶段证据和内部盘点JSON。主仓库历史运行报告、私人知识档案、开发技能及外部制作/审核脚本也需按用途单独保管。设计规格、七份历史设计规划和12张未登录演示基线图已按公开文档整理；执行审批JSON与原始历史运行报告留在原机。

## 正式生产仍未发布

生产库的迁移历史、Schema/RLS/RPC/索引、生成类型与备份恢复条件尚需取得真实权限核验；项目级环境变量清单不能证明最终运行配置。发布准备已完成，不代表生产已放行。

后续生产操作须承接届时明确授权：核对生产实际缺少的迁移和受管配置，准备使用生产配置的当前源码兼容OFF退路，验证旧/新结构资料可读与恢复条件，再按顺序补迁移、验证并发布ON。既有测试OFF是较早兼容版本，不包含后续全部修复，不能直接推广为生产退路；不得把测试库部署直接当生产候选。普通分支push触发的仓库检查/预览不等于人工执行生产发布。
