> 历史ART设计与实施规划归档。当前交接和生产边界见 `docs/handoff/seven-fixes-v2.md`；本文件不启动新任务或发布。

---
artifact_type: execution_roadmap
planning_status: approved
baseline_observed_at: 2026-09-04T16:35:12+08:00
simulated_customer_inputs: []
---

# EXECUTOR 美术与视觉系统升级总路线图

## 目标与非目标

目标是在不改变业务契约的前提下交付“深空舰桥·证据控制台”共享视觉系统。非目标包括第六 Feature、业务重构、数据库/权限变化、生产生成图和第三方 UI 依赖。

## 基线摘要与失效规则

- 仓库：`仓库根目录`
- 分支：`feature/stage4-bridge-five-panels`
- HEAD：`b6891bdf4d4279a5df01cb1640298ff6a9d019c8`
- `package.json`：`aaf7050f009224909f565161a6faa01d8404328f396c7cdd5ff6fe578d3b281f`
- `pnpm-lock.yaml`：`a3c6eacc929ae7dd2253aab6cc8e24379e676fd47a44863915fe4dc310aa6b18`
- `vitest.config.ts`：`4d2c2cb8adee5e42b57a40627c4639541d4d8da60f6b1f3b31849521dd514d4e`
- `playwright.phase6-accessibility.config.ts`：`d4279d2fe9ed03caf1cf4a28d51aeecea17894dfc4f40507b6d6a4f5bcc93919`
- `feature-registry.ts`：`f88e9024eb4064d0e01d721ccec954c2b970b1d4b27dc8193ac8926c85e719bf`
- `globals.css`：`e942480a575d627eeb34c8698e55e1a006ababe31f77155e1d146dcec3258dbe`
- 基线：`pnpm typecheck` 退出码 0；六个 UI 测试文件 48 项通过。
- 当前工作树含用户已有报告与 `.pnpm-store/` 未跟踪内容，所有计划 Task 禁止清理、覆盖或纳入提交。

目标文件、主题接口或测试配置变化时，受影响 Task 及下游失效；Feature Registry、Panel Query 或公共 View Model 变化时全包返回重新审核。

## 批准编号覆盖矩阵

| 批准编号 | 模块 |
|---|---|
| ART-REC-001、002、004、005、006、008 | MOD-ART-01 |
| ART-REC-003、004、005 | MOD-ART-02 |
| ART-REC-003、004、008 | MOD-ART-03 |
| ART-REC-002、006、007 | MOD-ART-04 |
| ART-REC-005、008、009 | MOD-ART-05 |
| ART-REC-005、009、010 | MOD-ART-06 |

## 模块文件索引

| 顺序 | 模块 | 计划文件 | 依赖 |
|---:|---|---|---|
| 1 | MOD-ART-01 视觉合同与 Token | `01_visual-contract-and-tokens.md` | none |
| 2 | MOD-ART-02 Command Deck 试装 | `02_command-deck-shell-pilot.md` | MOD-ART-01 |
| 3 | MOD-ART-03 五面板换装 | `03_five-panel-rollout.md` | MOD-ART-02 |
| 4 | MOD-ART-04 美术资产管线 | `04_art-asset-pipeline.md` | MOD-ART-01 |
| 5 | MOD-ART-05 可访问性与视觉回归 | `05_accessibility-responsive-visual-regression.md` | MOD-ART-02、03、04 |
| 6 | MOD-ART-06 发布与回退 | `06_release-rollback.md` | MOD-ART-05 |

## 依赖、并行与共享资源顺序

`MOD-ART-01 → MOD-ART-02 → MOD-ART-03 → MOD-ART-05 → MOD-ART-06`。MOD-ART-04 可在 MOD-ART-02/03 期间并行，但不得修改 `globals.css`。`globals.css` 的唯一 writer 是 TASK-ART-01-03；后续模块只能消费 Token 或修改各自 CSS Module。

## Gate 与跨模块状态

- `GATE-ART-001`：共享视觉基线冻结，`CONTRACT_OR_BASELINE_FREEZE`，计划期 `PENDING`。
- `GATE-ART-002`：发布与回退就绪，`RELEASE_OR_HANDOFF_READINESS`，计划期 `PENDING`。
- 信任边界不适用：本轮不修改身份、权限、租户隔离、Secret 或数据访问。

## 计划修订规则

只修订受影响模块及其下游。触发重新批准门槛时停止执行，不把扩大范围写成普通修复。

## 总体 Definition of Done

六模块全部审核通过；两项 Gate 为 PASS；六页面桌面/移动视觉基线、可访问性、Preview/Connected 回归、构建和 legacy 回退均通过；知识库与项目计划回读成功。

## 执行交接状态

`execution_readiness: NOT_READY`；`execution_authorization: NOT_GRANTED`。完整草稿已获最终批准并进入正式落档；产品代码执行仍需另行授权。
