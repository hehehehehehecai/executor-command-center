import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectCalibrationRead, ProjectCalibrationView } from "@/domain/project-calibration/project-calibration";
import { ProjectCalibrationPanel } from "./project-calibration-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const repository = { id: "11111111-1111-4111-8111-111111111111", repositoryId: 9_700_001, fullName: "synthetic-owner/synthetic-project", visibility: "private", defaultBranch: "main" } as const;
const calibration: ProjectCalibrationRead = { id: "33333333-3333-4333-8333-333333333333", selectedRepositoryId: repository.id, coreGoal: "Original goal", currentStageGoal: "Original stage", status: "in_development", currentBlocker: "Original blocker", createdAt: "2026-07-31T08:00:00.000Z", updatedAt: "2026-07-31T08:00:00.000Z" };
const entry: ProjectCalibrationView = { repository, calibration };
const list = (projects: readonly ProjectCalibrationView[] = [entry]) => Response.json({ projects });
const saveButton = () => screen.getByRole("button", { name: "保存项目背景" });
const editCore = () => fireEvent.change(screen.getByLabelText("核心目标"), { target: { value: "Updated goal" } });
async function ready(fetcher: ReturnType<typeof vi.fn>) { vi.stubGlobal("fetch", fetcher); render(<ProjectCalibrationPanel />); await screen.findByTestId("project-stable-id"); }
function payload(fetcher: ReturnType<typeof vi.fn>) { return JSON.parse(fetcher.mock.calls[1][1].body); }

describe("ProjectCalibrationPanel", () => {
  it("T10 未确认背景可稍后进入，首屏核心目标，状态不默认且不写", async () => {
    const nullable = { ...calibration, coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null };
    const fetcher = vi.fn().mockResolvedValue(list([{ repository, calibration: nullable }]));
    await ready(fetcher);
    expect(screen.getByRole("region", { name: "仓库事实" })).toHaveTextContent(repository.fullName);
    expect(screen.getByRole("region", { name: "项目背景" })).toHaveTextContent("用户陈述");
    expect(screen.getByText("已添加 · 背景未确认")).toBeVisible();
    expect(screen.getByLabelText("核心目标")).toHaveValue("");
    expect(screen.getByLabelText("核心目标")).not.toBeRequired();
    expect(screen.getByLabelText("正式状态")).toHaveValue("");
    expect(screen.getByText("按需补充阶段目标、状态与阻碍").parentElement).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "稍后补充并进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${calibration.id}`);
    fireEvent.click(saveButton());
    expect(fetcher).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("只改核心目标，PATCH 不包含未操作旧字段，成功依真实 GET", async () => {
    const saved = { ...entry, calibration: { ...calibration, coreGoal: "Updated goal" } };
    const fetcher = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json({ ignoredEcho: true })).mockResolvedValueOnce(list([saved]));
    await ready(fetcher); editCore(); fireEvent.click(saveButton());
    expect(await screen.findByRole("status")).toHaveTextContent("项目背景已保存");
    expect(fetcher.mock.calls[1][0]).toBe(`/api/projects/${calibration.id}/context`);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "PATCH", credentials: "same-origin", cache: "no-store" });
    expect(payload(fetcher)).toEqual({ coreGoal: "Updated goal" });
    expect(fetcher.mock.calls[2]).toEqual(["/api/projects", { credentials: "same-origin", cache: "no-store" }]);
    expect(screen.getByLabelText("当前阶段目标")).toHaveValue(calibration.currentStageGoal);
    expect(screen.getByLabelText("正式状态")).toHaveValue(calibration.status);
    expect(screen.getByLabelText("当前阻碍（可选）")).toHaveValue(calibration.currentBlocker);
  });
  it("按需编辑与明确清空仅提交操作字段的 null", async () => {
    const saved = { ...entry, calibration: { ...calibration, currentStageGoal: null, status: null, currentBlocker: null } };
    const fetcher = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(list([saved]));
    await ready(fetcher);
    fireEvent.click(screen.getByText("按需补充阶段目标、状态与阻碍"));
    fireEvent.change(screen.getByLabelText("当前阶段目标"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("正式状态"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("当前阻碍（可选）"), { target: { value: " " } });
    fireEvent.click(saveButton()); await screen.findByRole("status");
    expect(payload(fetcher)).toEqual({ currentStageGoal: null, status: null, currentBlocker: null });
    expect(screen.getByLabelText("核心目标")).toHaveValue(calibration.coreGoal);
  });
  it("切换项目不带入上个项目草稿且不提交未编辑字段", async () => {
    const second = { repository: { ...repository, id: "22222222-2222-4222-8222-222222222222", fullName: "owner/second", repositoryId: 9_700_002 }, calibration: { ...calibration, id: "44444444-4444-4444-8444-444444444444", selectedRepositoryId: "22222222-2222-4222-8222-222222222222", coreGoal: "Second goal", currentStageGoal: null, status: null, currentBlocker: null } };
    const fetcher = vi.fn().mockResolvedValue(list([entry, second]));
    await ready(fetcher); editCore();
    fireEvent.change(screen.getByLabelText("已选择仓库"), { target: { value: second.repository.id } });
    expect(screen.getByLabelText("核心目标")).toHaveValue("Second goal");
    expect(screen.getByLabelText("正式状态")).toHaveValue("");
    fireEvent.click(saveButton()); expect(fetcher).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("已选择仓库"), { target: { value: repository.id } });
    expect(screen.getByLabelText("核心目标")).toHaveValue(calibration.coreGoal);
  });
  it("编辑后恢复原值不产生 PATCH", async () => {
    const fetcher = vi.fn().mockResolvedValue(list()); await ready(fetcher); editCore();
    fireEvent.change(screen.getByLabelText("核心目标"), { target: { value: calibration.coreGoal } });
    fireEvent.click(saveButton()); expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(["patch_failure", "read_failure", "wrong_project", "unchanged_readback"])("%s 不冒成功并保留草稿", async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(failure === "patch_failure" ? new Response("", { status: 503 }) : Response.json({}));
    if (failure !== "patch_failure") fetcher.mockResolvedValueOnce(failure === "read_failure" ? new Response("", { status: 503 }) : list([{ ...entry, calibration: { ...calibration, id: failure === "wrong_project" ? "44444444-4444-4444-8444-444444444444" : calibration.id } }]));
    await ready(fetcher); editCore(); fireEvent.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("项目背景保存或回读失败");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("核心目标")).toHaveValue("Updated goal");
  });
  it("保存与回读期间防重复提交，回读完成后只通知一次", async () => {
    const listener = vi.fn(); window.addEventListener("project-calibration-saved", listener);
    let resolvePatch!: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(list()).mockReturnValueOnce(new Promise<Response>(resolve => { resolvePatch = resolve; })).mockResolvedValueOnce(list([{ ...entry, calibration: { ...calibration, coreGoal: "Updated goal" } }]));
    await ready(fetcher); editCore(); fireEvent.click(saveButton());
    expect(screen.getByRole("button", { name: "保存中" })).toBeDisabled();
    expect(screen.getByLabelText("已选择仓库")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存中" })); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled(); resolvePatch(Response.json({}));
    await screen.findByRole("status"); expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("project-calibration-saved", listener);
  });
  it("未选择仓库显示空状态", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ projects: [] }))); render(<ProjectCalibrationPanel />);
    expect(await screen.findByText("请先选择一个 GitHub 仓库。")).toBeVisible();
  });
  it("仓库选择事件刷新事实并丢弃旧草稿", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json({ projects: [] }));
    await ready(fetcher); editCore(); window.dispatchEvent(new Event("selected-repositories-changed"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(repository.fullName)).not.toBeInTheDocument());
  });
  it("项目尚未建立时不伪造项目 ID 或保存成功", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ projects: [{ repository, calibration: null }] }))); render(<ProjectCalibrationPanel />);
    await screen.findByText("请先完成仓库接入，再补充项目背景。");
    expect(saveButton()).toBeDisabled(); expect(screen.queryByRole("link", { name: "稍后补充并进入项目" })).not.toBeInTheDocument();
  });
});
