# Project Brief Eval Harness

## 目的与边界

该 Harness 以离线、确定性方式检查 Project Brief 的合同行为。它复用生产 `parseProjectBrief` 与 Phase 6 `ValidateProjectBriefEvidenceUseCase`，不会调用 AI Provider、联网、读取真实密钥或连接远端数据库。

当前发布数据集使用 v3，冻结为 14 个 Case：10 个 `synthetic_contract` 与 4 个 `human_confirmed_historical`。四个历史 Case 来自仓库内精确字节副本；每个副本都绑定只读来源 Markdown 的 SHA-256、独立静态 receipt 锚点和确定性转换 lineage。

- `human_confirmed_historical = 4`；
- `pending_human_confirmation = 0`；
- `releaseGate = passed`；
- v2 兼容数据集仍保留原 acceptance set 和 `blocked` 结果，不作为当前发布数据集；它记录了纠偏前“所有 bullet 都是事实、所有时间范围都是 instant”的旧建模。
- 当前结果只能证明合同、历史原件转换和检查器行为，不能称为真实模型质量、overall accuracy 或 real-world accuracy。

## 固定合同

- Case：`project-brief-eval-case.v1`
- Manifest：`project-brief-eval-manifest.v1`
- Result：`project-brief-eval-result.v1`
- Prompt：`project-brief-v1`
- Schema：`project-brief-schema-v1`

每个纳入 Case 都运行七项检查：Schema、Evidence Validity、时间范围、必需事实、禁止断言、Unknown 处理、人工可读性。人工可读性由“自动结构代理”和“人工确认”两部分组成；自动代理通过不能替代人工确认。

v1 acceptance set 保持不变。历史 Markdown 不能诚实伪装为 Phase 3 生产 `EvidenceSnapshot`，因此 v2 采用隔离合同：

- Dataset profile：`project-brief-eval-dataset.v2`
- Case profile：`project-brief-eval-case-profile.v2`（冻结 14 项 `caseId + contractVersion + contentFingerprint`）
- Historical Artifact：`project-brief-eval-historical-brief-artifact.v1`
- Historical Conversion：`project-brief-eval-historical-brief-conversion.v1`
- Historical Case：`project-brief-eval-case.v2`
- Manifest：`project-brief-eval-manifest.v2`
- Result：`project-brief-eval-result.v2`
- Mapping：`project-brief-historical-mapping.v1`

v3 不修改上述 v1/v2 parser 或冻结指纹，而是在 historical artifact 上新增显式语义投影：

- Dataset profile：`project-brief-eval-dataset.v3`
- Case profile：`project-brief-eval-case-profile.v3`
- Historical Case：`project-brief-eval-case.v3`
- Historical Projection：`project-brief-eval-historical-projection.v2`
- Statement Classification：`project-brief-eval-historical-statement-classification.v1`
- Time Precision：`project-brief-eval-historical-time-precision.v1`
- Historical Conversion：`project-brief-eval-historical-brief-conversion.v2`
- Mapping：`project-brief-historical-mapping.v2`
- Manifest：`project-brief-eval-manifest.v3`
- Result：`project-brief-eval-result.v3`

v2 的 `historical_brief_artifact` 只能证明：冻结原件字节未变、receipt 与静态可信锚点一致、所有 H2 区块及事实/Unknown 投影可重复、可见 Evidence ID 能在原件 Evidence 表中定位。它不能证明底层生产 Snapshot、Snapshot 生成后的实时授权、生产 Freshness、数据库记录或 Evidence 所陈述事实的现实正确性。

### Historical statement 分类

v3 将历史原文投影为带稳定 ID、规范化文本、原始区块、区块内行号与文本 SHA-256 的 statement：

- `project_fact`：项目状态、变更、风险、计划执行或决定；必须至少有一个 Evidence ID，且引用必须存在于冻结 Evidence catalog。
- `workflow_note`：以“本简报／该简报／这份简报／当前这份简报”指向简报自身，并描述候选、冻结、转换、审核或纳入流程；必须保留 source span/hash，Evidence 可以为空，不进入项目事实 Evidence 分母。
- `unknown`：只来自 `Unknowns` 区块；不得升级成 `project_fact` 或 `workflow_note`。

分类器不读取 Case ID，也不匹配探索者号整句。`workflow_note` 的 receipt/lineage 只证明原文和转换可追溯，不能充当项目 Evidence。任一项目事实无 Evidence、任一引用不在 catalog、任一分类或 provenance 被篡改都会失败关闭。

### Historical 时间精度

v3 时间边界显式区分：

- `instant`：保留原始 canonical UTC 文本，`exactInstant` 必须逐字相同；
- `date`：保留合法 ISO date，`exactInstant` 必须为 `unknown`。

原文形如“`2026-08-18（精确 UTC 时间待确认）`”时，只投影为 `precision=date`。校验仅比较日历顺序并确认精度缺口仍被保留；不会用午夜、人工确认时间、Git 时间、mtime 或当前时间补造 instant。通过 reason code `historical_time_range_date_precision_preserved` 只表示日期精度被诚实保存，不表示 canonical UTC 起点已验证。

### 必需事实语义

每项 `requiredFacts` 必须同时冻结：稳定 `factId`、`location`、`contentMatch` 和至少一个 `requiredEvidenceReferenceIds`。Evidence ID 精确复用 Phase 3/6 alignment key 的序列化值 `JSON.stringify([sourceKind, sourceId, projectId])`，不能只用可能碰撞的 `sourceId`。`contentMatch` 只允许 `exact_normalized` 或 `token_sequence`；两者统一执行 Unicode NFC、换行、首尾空白、连续空白及大小写规范化。

Harness 按生产 Brief 结构读取事实自身内容与自身 `evidenceRefs`：

- `summary` 使用 `summary.text` 与 `summary.evidenceRefs`；
- `officialStatus` 使用 `officialStatus.value` 与 `officialStatus.evidenceRefs`；
- 列表事实使用 `section:item.id` 定位，并读取该 item 的 `text` 与 `evidenceRefs`。

全局 `brief.evidenceRefs` 不能代替事实自身引用。检查按固定顺序失败关闭：`required_fact_missing` → `required_fact_content_mismatch` → `required_fact_evidence_missing` → `required_fact_evidence_mismatch`。只有路径、内容和必需 Evidence 子集全部满足才返回 `required_facts_present`。

## 运行

```bash
pnpm run test -- src/evaluation/project-brief
```

机器结果只保留 Case ID、类型、状态、reason code、计数与数据集 fingerprint，不返回 Brief、Snapshot、Prompt 或原始证据正文。

## 历史 Case 纳入规则

历史 Case 只有同时满足以下要求才可标记为 `human_confirmed_historical`：

1. 仓库内存在已授权且已脱敏的历史 Snapshot/Brief Artifact；
2. `sourceFingerprint` 与 receipt 逐字一致；
3. receipt 含稳定确认人 ID/角色、canonical UTC 确认时间；
4. receipt 明确覆盖 `source_and_redaction`、`readability`、`expected_outcomes`；
5. receipt 绑定 Case ID、确认 subject fingerprint 与源 fingerprint；
6. 运行方从可信边界注入 `ProjectBriefEvalReviewVerifier` 并验证确认人/凭证；Manifest 作者自填的字段不构成信任；
7. Case 内容 fingerprint 与 Manifest dataset fingerprint 重新计算一致。

v2 对纯合成 Case 只执行 `readability_proxy`。阶段计划要求检查合成 Case 的可读性代理，但没有要求为每个合成测试 fixture 建立独立人工 receipt；因此 synthetic 的 `human_readability_confirmation` 为 `not_applicable`。占位符、重复、空内容、超长或区块缺失仍会让代理检查失败，不能通过把人工项设为不适用来绕过。

历史 Case 必须具备与原 Brief subject/source fingerprint 绑定的人工 receipt，并通过静态 registry 逐字段复核。receipt 不签署转换后的 Case fingerprint；转换器只生成 `conversionAttestation`，记录输入文档 SHA、receipt fingerprint、映射版本和输出 Case fingerprint。该 attestation 只证明可重复转换，不是人工签名。

四份原件中的早期正文仍保留“待转换”“pending integration”等历史状态文本。后置人工 receipt 只覆盖 Eval 纳入、来源与脱敏、可读性和 expected outcomes，不会改写这些历史正文，也不会把其中的 Unknown 升级为事实。

缺任一字段时不得纳入发布分母。Preview fixture、普通单元测试 fixture、Git 历史文件和模型生成内容不能自动升级为人工确认历史 Case。

## 模板指导

未来历史 Brief 应在写作时区分：

1. 项目事实：写入事实区块并附 Evidence；
2. 流程说明：明确以简报自身为主语，保留转换/审核 provenance，不冒充项目事实；
3. Unknown：写入 `Unknowns`，说明缺失信息；
4. 时间边界：分别声明 `date` 或 `instant` 精度，不要求为未知 instant 猜值。

旧 Brief 由确定性 v3 投影兼容；原 Markdown 字节、receipt 和人工确认语义不变，不需要重新确认。

## 发布门禁

- v2 成员集合精确冻结为 14 个 Case ID；删除、替换或重排后即使重算计数和 fingerprint 也会被拒绝；
- 任一 Case 的观察结果偏离冻结预期，或 Case/Dataset fingerprint 不匹配：`failed`；
- 纳入总数不在 12–15、合成数不在 8–10、人工确认历史数少于 4、或可读性未人工确认：`blocked`；
- 只有硬检查、人工确认与数量门槛全部满足才可为 `passed`。

v3 当前 14/14 Case 的冻结预期与观察结果一致。探索者号 `Ongoing Work` 第 3 条作为 `workflow_note` 保留原文、行号和 hash，不再进入项目事实 Evidence 分母；日期粒度起点以 `exactInstant=unknown` 保留。四个 historical Case 的七项检查均通过，负向 synthetic Case 继续按冻结预期验证检查器失败分支，`releaseGate = passed`。

兼容 v2 仍返回 `historical_evidence_boundary_unresolved` 和 `releaseGate = blocked`。这不是 v3 发布阻塞，也不得通过改写 v2 expected checks 消除。
