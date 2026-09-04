// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUseCases: vi.fn(),
  listExecute: vi.fn(),
  saveExecute: vi.fn(),
}));

vi.mock("./project-calibration-route-dependencies", () => ({
  createProjectCalibrationUseCases: mocks.createUseCases,
}));

import { dynamic, GET, POST } from "./route";

const command = {
  selectedRepositoryId: "11111111-1111-4111-8111-111111111111",
  coreGoal: "Ship a trustworthy MVP",
  currentStageGoal: "Calibrate the first project",
  status: "in_planning",
  currentBlocker: null,
} as const;
const project = {
  repository: {
    id: command.selectedRepositoryId,
    repositoryId: 9_700_001,
    fullName: "synthetic-owner/synthetic-project",
    visibility: "private",
    defaultBranch: "main",
  },
  calibration: {
    id: "33333333-3333-4333-8333-333333333333",
    ...command,
    createdAt: "2026-08-01T01:00:00.000Z",
    updatedAt: "2026-08-01T01:00:00.000Z",
  },
} as const;

describe("/api/projects composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    mocks.listExecute.mockResolvedValue([project]);
    mocks.saveExecute.mockResolvedValue(project);
    mocks.createUseCases.mockResolvedValue({
      list: { execute: mocks.listExecute },
      save: { execute: mocks.saveExecute },
    });
  });

  it("is dynamic and GET uses the verified-session read use case", async () => {
    const response = await GET();
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(mocks.listExecute).toHaveBeenCalledWith();
    expect(mocks.saveExecute).not.toHaveBeenCalled();
  });

  it("POST forwards only the strict validated command", async () => {
    const response = await POST(new Request(
      "https://executor.example.test/api/projects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://executor.example.test",
        },
        body: JSON.stringify(command),
      },
    ));
    expect(response.status).toBe(200);
    expect(mocks.saveExecute).toHaveBeenCalledWith(command);
  });

  it("rejects foreign origin and unknown fields before creating dependencies", async () => {
    const foreign = await POST(new Request(
      "https://executor.example.test/api/projects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.test",
        },
        body: JSON.stringify(command),
      },
    ));
    const invalid = await POST(new Request(
      "https://executor.example.test/api/projects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://executor.example.test",
        },
        body: JSON.stringify({ ...command, userId: "forged" }),
      },
    ));
    expect(foreign.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(mocks.createUseCases).not.toHaveBeenCalled();
  });

  it("redacts raw storage details from response and logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.saveExecute.mockRejectedValue(
      new Error("service.role-token user_id=private core_goal=secret sql stack"),
    );
    const response = await POST(new Request(
      "https://executor.example.test/api/projects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://executor.example.test",
        },
        body: JSON.stringify(command),
      },
    ));
    const responseBody = await response.text();
    const logBody = warn.mock.calls.flat().join(" ");
    const forbidden = /service\.role-token|private|secret|core_goal|sql stack/i;
    expect(response.status).toBe(503);
    expect(responseBody).not.toMatch(forbidden);
    expect(logBody).not.toMatch(forbidden);
    expect(JSON.parse(logBody)).toMatchObject({
      contract_version: "project-calibration-failure.v1",
      failure_code: "project_calibration_storage_failed",
      repository_content_read: false,
      github_called: false,
      sync_started: false,
      sensitive_marker_found: false,
    });
  });
});
