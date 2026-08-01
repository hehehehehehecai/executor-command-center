// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  handleProjectCalibrationList,
  handleProjectCalibrationSave,
  projectCalibrationFailureContract,
  projectCalibrationHttpContract,
} from "./project-calibration-http";

const appOrigin = "https://executor.example.test";
const selectedRepositoryId = "11111111-1111-4111-8111-111111111111";
const validBody = {
  selectedRepositoryId,
  coreGoal: "Ship a trustworthy MVP",
  currentStageGoal: "Calibrate the first project",
  status: "in_planning",
  currentBlocker: null,
} as const;
const result = {
  repository: {
    id: selectedRepositoryId,
    repositoryId: 9_700_001,
    fullName: "synthetic-owner/synthetic-project",
    visibility: "private",
    defaultBranch: "main",
  },
  calibration: {
    id: "33333333-3333-4333-8333-333333333333",
    ...validBody,
    createdAt: "2026-07-31T08:00:00.000Z",
    updatedAt: "2026-07-31T08:00:00.000Z",
  },
} as const;

function post(body: unknown, origin = appOrigin, contentType = "application/json") {
  return new Request("https://executor.example.test/api/projects", {
    method: "POST",
    headers: { origin, "content-type": contentType },
    body: JSON.stringify(body),
  });
}

describe("project-calibration-http.v1", () => {
  it("returns nested repository facts and calibration statements with private headers", async () => {
    const response = await handleProjectCalibrationList({
      execute: vi.fn().mockResolvedValue([result]),
    });
    expect(projectCalibrationHttpContract).toBe("project-calibration-http.v1");
    expect(projectCalibrationFailureContract).toBe("project-calibration-failure.v1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({ projects: [result] });
  });

  it("accepts one exact same-origin strict JSON command", async () => {
    const execute = vi.fn().mockResolvedValue(result);
    const response = await handleProjectCalibrationSave({
      request: post(validBody),
      appOrigin,
      execute,
    });
    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(validBody);
    await expect(response.json()).resolves.toEqual({ project: result });
  });

  it.each([
    [post({ ...validBody, unknown: true }), 400],
    [post({ ...validBody, coreGoal: " leading" }), 400],
    [post(validBody, "https://evil.example.test"), 403],
    [post(validBody, appOrigin, "text/plain"), 400],
  ])("rejects invalid requests before execution", async (request, status) => {
    const execute = vi.fn();
    const response = await handleProjectCalibrationSave({ request, appOrigin, execute });
    expect(response.status).toBe(status);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["project_calibration_unauthenticated", 401],
    ["project_calibration_invalid_request", 400],
    ["project_calibration_selected_repository_not_found", 404],
    ["project_calibration_conflict", 409],
    ["project_calibration_configuration_missing", 503],
    ["project_calibration_storage_failed", 503],
    ["database-secret-sentinel", 503],
  ])("maps %s to safe HTTP %i", async (code, status) => {
    const response = await handleProjectCalibrationSave({
      request: post(validBody),
      appOrigin,
      execute: async () => { throw new Error(code); },
    });
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(status);
    expect(serialized).not.toContain("database-secret-sentinel");
    expect(serialized).not.toMatch(/service_role|authorization|cookie|sql|stack/i);
  });
});
