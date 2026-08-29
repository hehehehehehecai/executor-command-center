import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectCalibrationPanel } from "./project-calibration-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const repository = {
  id: "11111111-1111-4111-8111-111111111111",
  repositoryId: 9_700_001,
  fullName: "synthetic-owner/synthetic-project",
  visibility: "private",
  defaultBranch: "main",
} as const;

describe("ProjectCalibrationPanel", () => {
  it("separates repository facts from statements and saves one strict calibration", async () => {
    const calibrationSaved = vi.fn();
    window.addEventListener("project-calibration-saved", calibrationSaved);
    let resolveSave!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ projects: [{ repository, calibration: null }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveSave = resolve; }));
    vi.stubGlobal("fetch", fetcher);

    render(<ProjectCalibrationPanel />);
    expect(await screen.findByRole("region", { name: "仓库事实" })).toHaveTextContent(
      "synthetic-owner/synthetic-project",
    );
    expect(screen.getByRole("region", { name: "项目校准" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("核心目标"), {
      target: { value: "Ship a trustworthy MVP" },
    });
    fireEvent.change(screen.getByLabelText("当前阶段目标"), {
      target: { value: "Calibrate the first project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存项目校准" }));
    expect(screen.getByRole("button", { name: "保存中" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存中" }));
    expect(fetcher).toHaveBeenCalledTimes(2);

    resolveSave(new Response(JSON.stringify({
      project: {
        repository,
        calibration: {
          id: "33333333-3333-4333-8333-333333333333",
          selectedRepositoryId: repository.id,
          coreGoal: "Ship a trustworthy MVP",
          currentStageGoal: "Calibrate the first project",
          status: "in_planning",
          currentBlocker: null,
          createdAt: "2026-07-31T08:00:00.000Z",
          updatedAt: "2026-07-31T08:00:00.000Z",
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    expect(await screen.findByRole("status")).toHaveTextContent("项目校准已保存");
    expect(calibrationSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("project-stable-id")).toHaveTextContent(
      "Project ID: 33333333-3333-4333-8333-333333333333",
    );
    await waitFor(() => expect(screen.getByLabelText("核心目标")).toHaveValue(
      "Ship a trustworthy MVP",
    ));
    window.removeEventListener("project-calibration-saved", calibrationSaved);
  });

  it("shows the empty state before any repository is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));
    render(<ProjectCalibrationPanel />);
    expect(await screen.findByText("请先选择一个 GitHub 仓库。")).toBeVisible();
  });

  it("refreshes repository facts after a selection change event", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ projects: [{ repository, calibration: null }] }),
      )
      .mockResolvedValueOnce(Response.json({ projects: [] }));
    vi.stubGlobal("fetch", fetcher);

    render(<ProjectCalibrationPanel />);
    expect(await screen.findByText(repository.fullName)).toBeVisible();

    window.dispatchEvent(new Event("selected-repositories-changed"));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText(repository.fullName)).not.toBeInTheDocument(),
    );
  });
});
