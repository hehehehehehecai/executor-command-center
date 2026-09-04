// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUseCases: vi.fn(),
  listExecute: vi.fn(),
  selectExecute: vi.fn(),
  deselectExecute: vi.fn(),
}));

vi.mock("./repository-selection-route-dependencies", () => ({
  createRepositorySelectionUseCases: mocks.createUseCases,
}));

import { dynamic, GET, POST } from "./route";

const selectedRepository = {
  repositoryId: 9_600_001,
  ownerLogin: "selected-owner",
  name: "selected-repository",
  fullName: "selected-owner/selected-repository",
  visibility: "private" as const,
  isPrivate: true,
  isFork: false,
  isArchived: false,
  isDisabled: false,
  defaultBranch: "main",
  selectedAt: "2026-07-29T01:00:00.000Z",
  updatedAt: "2026-07-29T01:00:01.000Z",
  calibrationStatus: "pending" as const,
};

describe("/api/github/repository-selections composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    mocks.listExecute.mockResolvedValue([selectedRepository]);
    mocks.selectExecute.mockResolvedValue(selectedRepository);
    mocks.deselectExecute.mockResolvedValue(undefined);
    mocks.createUseCases.mockResolvedValue({
      list: { execute: mocks.listExecute },
      select: { execute: mocks.selectExecute },
      deselect: { execute: mocks.deselectExecute },
    });
  });

  it("is dynamic and GET uses only the selection list use case", async () => {
    const response = await GET();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(mocks.createUseCases).toHaveBeenCalledTimes(1);
    expect(mocks.listExecute).toHaveBeenCalledWith();
    expect(mocks.selectExecute).not.toHaveBeenCalled();
    expect(mocks.deselectExecute).not.toHaveBeenCalled();
  });

  it("POST forwards only the validated numeric repository ID", async () => {
    const response = await POST(
      new Request(
        "https://executor.example.test/api/github/repository-selections",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://executor.example.test",
          },
          body: JSON.stringify({ repositoryId: 9_600_001 }),
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.selectExecute).toHaveBeenCalledWith({
      repositoryId: 9_600_001,
    });
    expect(mocks.listExecute).not.toHaveBeenCalled();
  });

  it("rejects foreign Origin and invalid body before constructing session or service-role dependencies", async () => {
    const foreign = await POST(
      new Request(
        "https://executor.example.test/api/github/repository-selections",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://evil.example.test",
          },
          body: '{"repositoryId":9600001}',
        },
      ),
    );
    const invalid = await POST(
      new Request(
        "https://executor.example.test/api/github/repository-selections",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://executor.example.test",
          },
          body: '{"repositoryId":9600001,"name":"browser-forgery"}',
        },
      ),
    );

    expect(foreign.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(mocks.createUseCases).not.toHaveBeenCalled();
    expect(mocks.selectExecute).not.toHaveBeenCalled();
  });

  it("keeps raw storage errors and sensitive sentinels out of the response and failure log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.selectExecute.mockRejectedValue(
      new Error(
        "service.role-token user_id=private-user installation_id=private-installation selected-owner/private-repository",
      ),
    );

    const response = await POST(
      new Request(
        "https://executor.example.test/api/github/repository-selections",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://executor.example.test",
          },
          body: JSON.stringify({ repositoryId: 9_600_001 }),
        },
      ),
    );
    const responseBody = await response.text();
    const logBody = warn.mock.calls.flat().join(" ");
    const forbidden =
      /service\.role-token|private-user|private-installation|selected-owner\/private-repository/i;

    expect(response.status).toBe(503);
    expect(responseBody).not.toMatch(forbidden);
    expect(logBody).not.toMatch(forbidden);
    expect(JSON.parse(logBody)).toMatchObject({
      contract_version: "github-repository-selection-failure.v1",
      failure_code: "github_repository_selection_storage_failed",
      project_created: false,
      sync_started: false,
      sensitive_marker_found: false,
    });
  });
});
