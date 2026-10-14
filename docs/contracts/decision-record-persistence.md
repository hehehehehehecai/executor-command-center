# 手动决策保存合同

合同 `t09-decision-persistence.v1`。存储为当前本人项目的 `public.decision_records`；保留原 DecisionRecord 字段，附加 `user_id/project_id/idempotency_key/version`。确认者、时间、记录 ID、版本、创建方式和候选来源由数据库决定，客户端不可指定。

`POST /api/projects/[projectId]/decisions` 仅在服务端 `DECISION_RECORD_WRITES_ENABLED` 精确为 `1` 时启用，默认关闭。复用现有 `auth.getUser()`、同源和禁缓存规则；读取使用本人 JWT 与 RLS，写入沿用项目背景的服务端委托方式。服务端将刚验证的主体交给仅 service_role 可执行的 SECURITY INVOKER 入口；私有实现复用现有项目/仓库/安装/账户写锁并校验归属。authenticated/anon 无表写权限或写 RPC 权限，不能绕过网站开关；服务端密钥不进入客户端。关闭写入后仍读取历史记录；未迁移时返回存储未启用，查询错误不得冒充空数据。

输入为 `idempotencyKey/decision/confirmationReason/alternatives/references/revisitCondition`，严格拒绝额外确认身份或时间字段。文字沿用现有手动决策规范化，引用沿用 HTTPS 且无 URL 凭据的净化规则，不安全 URL 降级为无链接引用。相同项目、主体、提交键及内容返回原记录；同键异内容返回 409，不更新或追加记录。

Connected 正式入口保存后刷新服务端读取。GET 不写业务数据。Preview 与旧受控演示 fixture 保持页面内预览，不能被计为真实持久化；生产仍禁止 Preview。当前没有真实候选来源，真实 Connected 的 candidates=[]，手动记录 createdVia=manual、sourceCandidateId=null，不新增 AI 调用。

新增迁移由固定 CLI migration new 生成；保留全部旧迁移、旧数据、可空项目背景。数据库 types 由实际迁移后的固定目标生成，不能用手写类型冒称已生成。没有生产发布、云数据库或真实 provider 操作。
