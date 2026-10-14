import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommandDeckPage } from "@/features/command-deck";
import { DecisionArchivePanel, createDecisionArchiveViewModel } from "@/features/decision-archive";
import { MissionControlPanel, createMissionControlViewModel } from "@/features/mission-control";
import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const workspace: WorkspaceContext = { status: "authenticated", userId, identity: { status: "ready", data: { login: "owner", avatarUrl: null } }, installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: [{ id: projectId, name: "owner/repo", status: null }, { id: "99999999-9999-4999-8999-999999999999", name: "owner/repo", status: "in_development" }] } };
const readState = { kind: "not_synced" as const, label: "尚无成功同步", description: "不能确认仓库活动完整", scopeLabel: "当前项目 · 各来源最近 100 条，非全量统计", nextStep: "查看同步状态" };

describe("T08 formal data display contract", () => {
  it("shows selected-project scoped home statistics without inventing a total project count", () => {
    const props = { workspace, projectId, overview: { kind: "ready", userId, projectId, readState, cards: { "project-galaxy": "项目背景可稍后填写", "mission-control": "最近读取 · 开放 Issue 2 · PR 1 · 失败工作流 1", "flight-log": "最近读取 · 活动 5 · 同步 1", "decision-archive": "决策记录存储尚未启用", copilot: "最近读取 · 简报 3 · 已完成 2" } } };
    const html = renderToStaticMarkup(<CommandDeckPage {...props as NonNullable<Parameters<typeof CommandDeckPage>[0]>} />);
    expect(html).toContain("开放 Issue 2");
    expect(html).toContain("简报 3");
    expect(html).toContain("非全量统计");
    expect(html).not.toContain("项目总数");
    expect(html).toContain(`project=${projectId}`);
  });
  it("does not display late data from a different account or project", () => {
    const props = { workspace, projectId, overview: { kind: "ready", userId: "foreign", projectId, readState, cards: { "mission-control": "PRIVATE-FOREIGN-STATISTIC" } } };
    const html = renderToStaticMarkup(<CommandDeckPage {...props as NonNullable<Parameters<typeof CommandDeckPage>[0]>} />);
    expect(html).not.toContain("PRIVATE-FOREIGN-STATISTIC");
    expect(html).toContain("项目统计暂时无法读取");
  });
  it("renders read failure with retry guidance and no successful zero metrics", () => {
    const props = { workspace, projectId, overview: { kind: "failed" } };
    const html = renderToStaticMarkup(<CommandDeckPage {...props as NonNullable<Parameters<typeof CommandDeckPage>[0]>} />);
    expect(html).toContain("项目统计暂时无法读取");
    expect(html).toContain("重试读取");
    expect(html).not.toContain("开放 Issue 0");
  });
  it("renders decision storage unavailable distinctly from successful no records", () => {
    const viewModel = createDecisionArchiveViewModel({ provenanceLabel: "当前项目", records: [], candidates: [], readState: { ...readState, kind: "not_enabled", label: "决策记录存储尚未启用" } }, "connected");
    const html = renderToStaticMarkup(<DecisionArchivePanel projectId={projectId} viewModel={viewModel} />);
    expect(html).toContain("决策记录存储尚未启用");
    expect(html).not.toContain("暂无正式决策记录");
  });
  it("renders mission not-synced guidance instead of a successful empty claim", () => {
    const viewModel = createMissionControlViewModel({ provenanceLabel: "当前项目", recordedTasks: [], suggestions: [], readState }, "connected");
    const html = renderToStaticMarkup(<MissionControlPanel projectId={projectId} viewModel={viewModel} />);
    expect(html).toContain("尚无成功同步");
    expect(html).not.toContain("暂无 GitHub 已记录任务");
  });
});
