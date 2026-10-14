# 未确认项目背景的消费者合同

项目由本人可见的项目 ID 标识。`core_goal`、`current_stage_goal`、`status` 的显式 `null` 表示尚未获得用户确认；不表示项目缺失、未登录、授权失效、同步失败或没有活动。缺字段、空白目标和非法状态不属于允许的未确认值。

| 消费链 | 合同与结果 |
|---|---|
| 已验证会话 → 工作区读取 → 账号摘要 | 项目状态允许 `null`，项目身份和计数仍保留；本人和当前项目选择的检查保持 |
| 已选仓库 → 校准读取 → 引导页仓库列表 | 根据项目 ID 显示“已添加”；任一背景为 `null` 时另标“背景未确认” |
| 校准读取 → 原完整表单 | 未确认字段显示空输入，状态显示“未确认”；原完整保存仍要求两个目标和六状态之一 |
| Connected 读取 → 来源映射 → 项目面板 | 非归档查询包含 `null`，目标显示对应“未确认”；活动和同步记录继续展示 |
| freshness 读取 → 同步新鲜度 | 非归档查询包含 `null`；安装状态和同步状态各自判断 |
| 对账 RPC → 每日对账用例 → 原同步执行链 | 候选为 `null`、`in_planning`、`in_development`、`polishing`；应用继续跳过暂停、撤权和不完整映射；`dormant`、`completed`、`archived` 不扩入 |
| 证据读取 → 快照 → 规范化与指纹 | 三项背景保留 `null`，有证据的活动不丢失；背景确认或清空改变证据和缓存等价指纹 |
| 证据 → 提示词 → 新简报校验 | 正式状态必须与 profile 逐值一致；未确认字段必须保留对应 unknowns；引用 profile 的事实只能逐字陈述单一字段 |
| 生成 → 持久化 → 缓存 | 新旧版本精确区分；缓存命中仍需当前授权、同主体、有效期限和完整性校验 |
| 当前/历史简报 → 回执校验 → Copilot | 新状态 `null` 显示“未确认”；旧版本严格读取，不重写旧 payload；证据变化时只沿用原受限生成回执恢复机制 |

## 版本边界

| 内容 | 历史 | 当前 |
|---|---|---|
| 简报 prompt / schema | `project-brief-v1` 或 `project-brief-v2` + `project-brief-schema-v1` | `project-brief-v3` + `project-brief-schema-v2` |
| 正式状态 | 严格六状态 | 严格六状态或显式 `null` |
| 提示词生成合同 | `project-brief-generation-prompt.v2/v3/v4` | `project-brief-generation-prompt.v5` |
| 证据快照 / 指纹 | `project-brief-evidence-snapshot.v1` / `project-brief-evidence-fingerprint.v1` | `project-brief-evidence-snapshot.v2` / `project-brief-evidence-fingerprint.v2` |
| 缓存等价投影 | `project-brief-evidence-cache-equivalence.v1` | `project-brief-evidence-cache-equivalence.v2` |
| 证据校验 | `project-brief-evidence-validation.v1` | `project-brief-evidence-validation.v2` |
| 生成 / 缓存 / 持久化适配器 | `.v1` / `.v1` / `.v2` | `project-brief-generation.v2` / `project-brief-cache.v2` / `project-brief-generation-persistence.v3` |

证据引用与规范化算法仍为 `source-ref.v1` 和 `canonicalization.v1`。旧快照只允许非空背景；旧简报可验证旧快照或现行完整证据。新简报只能验证现行快照，快照与指纹跨代组合拒绝。历史评测固定原版本及原规范化字节。

旧缓存即使具有相同缓存等价指纹，也不能命中新版本的 prompt/schema 筛选。相同背景与证据可命中新缓存；背景确认、修改或清空后重新生成。失效授权不能通过缓存绕过生成或显示验证。

新增迁移仅替换对账候选集合与简报成功/失败持久化函数允许的版本组合。旧迁移、旧项目值、旧简报 payload、函数权限、锁与幂等边界保持。

`PROJECT_CONTEXT_WRITES_ENABLED` 仍默认关闭。本合同不接入自动建项、首次同步或新可选表单。合成响应验证不代表真实模型质量；浏览器夹具、实际本地 SDK/RLS 与真实外部服务需分别报告。

## T05.1 背景来源约束

`project-brief-background-provenance.v1` 收紧当前 `project-brief-v3/project-brief-schema-v2` 的证据接受规则，存储形状和数据库版本不变。上文的迁移属于 T05；T05.1 不新增迁移，不改变已有 33 条迁移或数据库结构。

摘要与四类事实的每一项只能引用一个来源。用户背景逐字绑定可信 profile 的单一字段；非 profile 事实必须完整复制来源记录，包含明确归属、JSON 引用的实际文本摘录和“该记录不代表用户确认项目背景”。五类 GitHub 活动支持摘要及实际字段；授权文档仅展示现有路径、类型和指纹，不虚构未提供的正文；决策与同步各自保留来源记录。JSON 转义后的摘录不超过 780 字符，截断时在引文内标记省略号，完整记录符合原 1000 字符事实项上限。

来源原文含目标、阶段或状态词仍可作为记录保留；不能移除归属、换成用户确认、改写引文、添加断言或混合引用。unknowns 必须恰好等于三个背景字段中尚未确认项的固定集合。此门禁比较确定的来源记录，不使用关键词黑名单或模型裁判，不声称解决任意自然语言幻觉。

生成、幂等结果重放、缓存命中和当前读取使用同一规则。不安全旧 v3 缓存触发重新生成；过期时间相同的缓存依完成时间、ID 降序稳定选择，避免重新生成后反复选中旧记录。原完整性摘要、授权和过期检查保持。

历史回执首先验证唯一成功生成记录、主体、项目、版本、指纹、预留与来源归属。v3 的非 profile 正文仍须逐字匹配保留的实际来源；源内容已改变、文档缺少持久化逐引用摘要或旧自由正文无法证明时，读取失败关闭。回执不豁免此检查。生成时已按旧 v3 门禁精确绑定的 profile 声明，依成功回执保留其历史值，并检查固定声明形式、未确认集合与状态一致性；不拿当前修改或清空后的 profile 覆盖历史。这里依赖原受信持久化与回执，未新增能独立恢复历史快照的存储。旧 v1/v2 保持原只读合同及原 payload 字节。

提示词可选来源记录仍放在 `untrustedRepositoryData` 中，经原输入净化，不能成为指令或授权。浏览器静态夹具仅验证显示；实际生成、缓存、回执和 RLS 由本地集成验证。

## T05.2 安全来源表示一致性

`project-brief-background-provenance.v2` 与 `project-brief-generation-prompt.v5` 使提示词候选、当前验证、生成/幂等/cache 和历史验证共用一个来源记录函数。原净化函数及错误类型提取到共享模块，触发条件、替换标记、控制字符和无效 Unicode 拒绝保持。整个提示词快照仍先净化再置于 `untrustedRepositoryData`，候选独立从原来源推导，不从模型提交的“已净化”标签推导。

顺序为：既有 NFC/换行与必要字段空白规范化 → 对实际文本/字段应用原净化规则 → 结构字段 JSON 组合 → JSON 转义摘录与 780 字符上限 → 固定出处和背景边界说明。来源 ID、kind、项目身份不作净化替换；匹配仍先验主体、项目、原始 canonical 指纹、版本和来源引用。profile 的正式背景仍精确绑定，不能用净化占位符替换正式目标。

有损净化的记录额外包含“来源指纹”，使用 Node 内置 SHA-256 对 `canonicalizeEvidenceValue({ evidenceRef, original })` 求值，其中 `original` 是净化前该记录值的 canonical JSON 字符串，`evidenceRef` 是原始四字段引用。该摘要不泄露被移除原文；不同来源身份或不同净化前内容不能仅因占位符相同而互换。所有调用使用相同函数，完整文本仍低于原事实项上限。普通未净化记录的字节保持。历史已净化记录如果没有这个来源摘要，不能证明其原文，失败关闭；后来原文改变，即使净化占位符相同也拒绝。

payload 仍为 v3/schema-v2，数据库、snapshot/fingerprint/cache-equivalence v2、source-ref/canonicalization v1 和生成/缓存/持久化版本保持。提示词版本升级明确记录新增来源摘要，未放宽旧 v1/v2，也不重写旧 payload。不安全旧 v3、混合/错引用、正文追加和任意占位符继续拒绝。旧未净化合法 v3 仍按相同记录和受信回执读取；已确认背景后续变化保留原含义。历史没有独立快照存储和逐文档摘要的限制保持。
