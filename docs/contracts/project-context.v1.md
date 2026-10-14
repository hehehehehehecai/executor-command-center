# project-context.v1（T03 冻结）

本合同允许项目存在而背景尚未确认。它不改变 project-calibration.v1 的完整输入和完整响应。G01 的消费者兼容由 T05 完成；本合同的 HTTP 写入口在服务器配置 `PROJECT_CONTEXT_WRITES_ENABLED` 严格等于 `1` 时才开启，缺失、空白及其他值都关闭。该变量不得公开到客户端。默认关闭时返回 404，不读取会话、不调用 RPC。

POST `/api/projects/from-repository` 只接受 `{ selectedRepositoryId: UUID }`，所有额外键均拒绝。主体来自 Supabase `getUser`，客户端不得提供 owner/user/project ID 或背景默认值。有效选择没有活动项目时创建三个背景字段均为 null 的项目；已有活动项目时原样返回，不覆盖任何字段；仅有归档历史时另建项目，保留历史。响应是 `{ project: { contractVersion, id, selectedRepositoryId, context: { coreGoal, currentStageGoal, status, currentBlocker }, completeness: { complete, missingFields }, syncPreparation: { state: "ready", requested: false } } }`。`ready` 仅表示本次事务核验了所有权、有效安装、账户与仓库可写状态；`requested:false` 表示本次请求未启动同步。不会访问 GitHub、模型或任务分发。

PATCH `/api/projects/[projectId]/context` 允许 coreGoal、currentStageGoal、status、currentBlocker 的非空子集。缺字段保持原值，显式 null 清空为未确认；显式 undefined（非 JSON 调用）、空对象、未知键和身份注入拒绝。文本必须非空、首尾无空白、最多 2000 UTF-16 码元。status 为 null 或 in_planning、in_development、polishing、dormant、completed、archived。完整度只由 coreGoal、currentStageGoal、status 三个非 null 字段决定，currentBlocker 不影响完整度；项目 ID 始终独立于完整度。

活动定义为 `status IS DISTINCT FROM 'archived'`，null 属于活动。PATCH 可以把活动项目归档；归档后同一项目的 PATCH 一律 409，不能通过 null 或正式状态恢复历史。旧完整保存仍允许归档当前活动项目；无活动项目时归档仍是冲突。旧完整保存可补齐同一 null 活动项目，不能另建第二个。取消选择必须阻止删除 null 活动项目。

PATCH 本次完成归档时，响应 `syncPreparation.state` 为 `blocked`，`requested` 仍为 false。其余成功响应为 ready；该字段不推断既有同步运行已完成，也不代表后台消费者已兼容。

| 条件 | HTTP / 公开码 |
|---|---|
| 默认关闭/非法开关 | 404 / project_context_disabled |
| 方法错误 | 405 / project_context_method_not_allowed，Allow 为该路由的唯一写方法 |
| Origin 缺失、不等于配置的公开源；Sec-Fetch-Site 非空且非 same-origin | 403 / project_context_origin_forbidden |
| 会话无效或过期 | 401 / project_context_unauthenticated |
| JSON、UUID、键、字段类型或值非法 | 400 / project_context_invalid_request |
| 选择或项目不存在、不属于 verified 用户 | 404 / project_context_not_found（不区分他人存在性） |
| 安装 suspended/revoked | 403 / project_context_authorization_unavailable |
| 账户非 active、仓库 disabled/archived/removing/removed | 409 / project_context_account_unavailable 或 project_context_repository_unavailable |
| 归档项目更新 | 409 / project_context_archived |
| 锁冲突/唯一性冲突 | 409 / project_context_conflict |
| 配置、网络、非公开 SQL/SDK 错误 | 503 / project_context_unavailable，固定安全消息 |

所有响应 private/no-store，Vary Cookie, Origin。请求不从 Host 推断公开 Origin。旧 GET/POST `/api/projects` 保持旧合同；旧 reader 对未确认项目的兼容仍归 T05，开关关闭防止新写路径提前面向用户。

SQL 新 RPC `create_project_from_repository(p_actor_user_id,p_selected_repository_id)` 与 `patch_project_context(p_actor_user_id,p_project_id,p_changes jsonb)` 仅供受限服务器 service_role 调用，内部再次检查所有关系、安装及生命周期；不授予普通身份表写权限或 RPC 执行权。固定空 search_path。锁顺序为安装行→账户门→选择行→活动项目行；等待安装/选择锁后重新读取状态。账户门用 NOWAIT，避免与既有账户门→项目/安装的移除路径形成等待环；繁忙时明确冲突且不写。新旧建项/保存共享选择锁，唯一索引作为最终并发约束。既有触发器和生命周期能力保持。

迁移只追加，放宽三个 NOT NULL，保留已有非空值约束及旧完整输入必填检查；不更新任何现有业务行，不回填。生成类型来自固定 CLI。所有新增样本为已曝光合成工程回归；同仓库并发请求是同一 lineage，不视为独立业务样本。

官方依据：[PostgreSQL null 比较语义](https://www.postgresql.org/docs/current/functions-comparison.html)、[Supabase CLI 迁移与生成类型](https://supabase.com/docs/reference/cli/supabase-migration-up)。已检查 [Supabase 更新日志](https://supabase.com/changelog)，本批保持既定本地工具和数据库版本，不采用远程升级流程。
