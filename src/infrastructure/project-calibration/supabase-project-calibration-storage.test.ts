// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  SupabaseProjectCalibrationReader,
  SupabaseProjectCalibrationWriter,
  projectCalibrationStorageContract,
} from "./supabase-project-calibration-storage";

const userId = "22222222-2222-4222-8222-222222222222";
const selectedRepositoryId = "11111111-1111-4111-8111-111111111111";
const projectRow = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: userId,
  selected_repository_id: selectedRepositoryId,
  core_goal: "Ship a trustworthy MVP",
  current_stage_goal: "Calibrate the first project",
  status: "in_planning",
  current_blocker: null,
  created_at: "2026-07-31T08:00:00.000Z",
  updated_at: "2026-07-31T08:00:00.000Z",
};
const repositoryRow = {
  id: selectedRepositoryId,
  github_repository_id: 9_700_001,
  full_name: "synthetic-owner/synthetic-project",
  visibility: "private",
  default_branch: "main",
  projects: [projectRow],
};

describe("project-calibration-storage.v1", () => {
  it("reads own rows through the session/RLS client and keeps facts nested", async () => {
    const select = vi.fn().mockResolvedValue({ data: [repositoryRow], error: null });
    const from = vi.fn().mockReturnValue({ select });
    const reader = new SupabaseProjectCalibrationReader({ from });

    await expect(reader.listOwn()).resolves.toEqual([{
      repository: {
        id: selectedRepositoryId,
        repositoryId: 9_700_001,
        fullName: "synthetic-owner/synthetic-project",
        visibility: "private",
        defaultBranch: "main",
      },
      calibration: {
        id: projectRow.id,
        selectedRepositoryId,
        coreGoal: projectRow.core_goal,
        currentStageGoal: projectRow.current_stage_goal,
        status: "in_planning",
        currentBlocker: null,
        createdAt: projectRow.created_at,
        updatedAt: projectRow.updated_at,
      },
    }]);
    expect(from).toHaveBeenCalledWith("selected_repositories");
    expect(projectCalibrationStorageContract).toBe("project-calibration-storage.v1");
  });

  it("writes only through the dedicated service-role RPC", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...projectRow, selected_repositories: repositoryRow }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const writer = new SupabaseProjectCalibrationWriter({
      supabaseUrl: "https://fixture-project.supabase.co",
      serviceRoleKey: "fixture-service-role-key",
      fetcher,
    });
    await writer.save({
      userId,
      command: {
        selectedRepositoryId,
        coreGoal: projectRow.core_goal,
        currentStageGoal: projectRow.current_stage_goal,
        status: "in_planning",
        currentBlocker: null,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://fixture-project.supabase.co/rest/v1/rpc/save_project_calibration",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      p_user_id: userId,
      p_selected_repository_id: selectedRepositoryId,
      p_core_goal: projectRow.core_goal,
      p_current_stage_goal: projectRow.current_stage_goal,
      p_status: "in_planning",
      p_current_blocker: null,
    });
  });

  it.each([
    "project_calibration_selected_repository_not_found",
    "project_calibration_selected_repository_wrong_user",
    "project_calibration_conflict",
  ])("preserves allow-listed RPC failure %s", async (message) => {
    const writer = new SupabaseProjectCalibrationWriter({
      supabaseUrl: "https://fixture-project.supabase.co",
      serviceRoleKey: "fixture-service-role-key",
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    });
    await expect(writer.save({
      userId,
      command: {
        selectedRepositoryId,
        coreGoal: projectRow.core_goal,
        currentStageGoal: projectRow.current_stage_goal,
        status: "in_planning",
        currentBlocker: null,
      },
    })).rejects.toThrow(message);
  });
});
