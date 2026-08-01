import { describe, expect, it, vi } from "vitest";

import {
  ListProjectCalibrations,
  SaveProjectCalibration,
} from "./project-calibration-use-cases";

const userId = "22222222-2222-4222-8222-222222222222";
const selectedRepositoryId = "11111111-1111-4111-8111-111111111111";
const command = {
  selectedRepositoryId,
  coreGoal: "Ship a trustworthy MVP",
  currentStageGoal: "Calibrate the first project",
  status: "in_planning",
  currentBlocker: null,
} as const;

describe("project calibration use cases", () => {
  it("rejects unauthenticated reads and writes", async () => {
    const sessionReader = { getVerifiedUserId: vi.fn().mockResolvedValue(null) };
    const reader = { listOwn: vi.fn() };
    const writer = { save: vi.fn() };

    await expect(
      new ListProjectCalibrations({ sessionReader, reader }).execute(),
    ).rejects.toThrow("project_calibration_unauthenticated");
    await expect(
      new SaveProjectCalibration({ sessionReader, writer }).execute(command),
    ).rejects.toThrow("project_calibration_unauthenticated");
    expect(reader.listOwn).not.toHaveBeenCalled();
    expect(writer.save).not.toHaveBeenCalled();
  });

  it("binds the verified user to validated storage input", async () => {
    const saved = {
      repository: {
        id: selectedRepositoryId,
        repositoryId: 9_700_001,
        fullName: "synthetic-owner/synthetic-project",
        visibility: "private",
        defaultBranch: "main",
      },
      calibration: {
        id: "33333333-3333-4333-8333-333333333333",
        ...command,
        createdAt: "2026-07-31T08:00:00.000Z",
        updatedAt: "2026-07-31T08:00:00.000Z",
      },
    } as const;
    const writer = { save: vi.fn().mockResolvedValue(saved) };
    const useCase = new SaveProjectCalibration({
      sessionReader: { getVerifiedUserId: vi.fn().mockResolvedValue(userId) },
      writer,
    });

    await expect(useCase.execute(command)).resolves.toEqual(saved);
    expect(writer.save).toHaveBeenCalledWith({ userId, command });
  });

  it("fails closed for a cross-user selected repository", async () => {
    const writer = {
      save: vi.fn().mockRejectedValue(
        new Error("project_calibration_selected_repository_wrong_user"),
      ),
    };
    const useCase = new SaveProjectCalibration({
      sessionReader: { getVerifiedUserId: vi.fn().mockResolvedValue(userId) },
      writer,
    });

    await expect(useCase.execute(command)).rejects.toThrow(
      "project_calibration_selected_repository_not_found",
    );
  });
});
