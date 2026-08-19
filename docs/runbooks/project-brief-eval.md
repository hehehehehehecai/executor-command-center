# Project Brief Eval Harness

## 目的与边界

该 Harness 以离线、确定性方式检查 Project Brief 的合同行为。它复用生产 `parseProjectBrief` 与 Phase 6 `ValidateProjectBriefEvidenceUseCase`，不会调用 AI Provider、联网、读取真实密钥或连接远端数据库。

当前数据集只有 10 个全新 `synthetic_contract` Case。仓库审计没有发现同时具备脱敏声明、确认人、确认时间、确认范围和不可变源指纹的历史资产，因此：

- `human_confirmed_historical = 0`；
- `pending_human_confirmation = 0`，因为没有足够证据可把现有 fixture 宣称为候选历史事实；
- `releaseGate = blocked`；
- 当前结果只能证明合同与检查器行为，不能称为真实模型质量、overall accuracy 或 real-world accuracy。

## 固定合同

- Case：`project-brief-eval-case.v1`
- Manifest：`project-brief-eval-manifest.v1`
- Result：`project-brief-eval-result.v1`
- Prompt：`project-brief-v1`
- Schema：`project-brief-schema-v1`

每个纳入 Case 都运行七项检查：Schema、Evidence Validity、时间范围、必需事实、禁止断言、Unknown 处理、人工可读性。人工可读性由“自动结构代理”和“人工确认”两部分组成；自动代理通过不能替代人工确认。

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

合成 Case 若要通过人工可读性门禁，也必须携带绑定同一 subject fingerprint 的 review receipt，并由同一可信 verifier 复核。当前仓库没有此类凭证，所以本批 10 个合成 Case 的人工可读性状态保持 `blocked`。

缺任一字段时不得纳入发布分母。Preview fixture、普通单元测试 fixture、Git 历史文件和模型生成内容不能自动升级为人工确认历史 Case。

## 发布门禁

- 任一 Case 的观察结果偏离冻结预期，或 Case/Dataset fingerprint 不匹配：`failed`；
- 纳入总数不在 12–15、合成数不在 8–10、人工确认历史数少于 4、或可读性未人工确认：`blocked`；
- 只有硬检查、人工确认与数量门槛全部满足才可为 `passed`。

当前稳定阻塞原因是：

1. `included_case_total_out_of_range`；
2. `human_confirmed_historical_below_minimum`；
3. `readability_human_confirmation_missing`。
