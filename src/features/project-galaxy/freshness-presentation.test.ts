import { describe, expect, it } from "vitest";
import {
  createProjectFreshnessPresentation,
  projectDataFreshnessUiContract,
  type ProjectFreshnessPresentationInput,
} from "./freshness-presentation";

const now = "2026-08-06T12:00:00.000Z";

function input(
  overrides: Partial<ProjectFreshnessPresentationInput> = {},
): ProjectFreshnessPresentationInput {
  return {
    provenance: "demo",
    authorizationRevoked: false,
    latestRun: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      finishedAt: "2026-08-06T10:00:00.000Z",
      errorCode: null,
    },
    lastSuccessfulAt: "2026-08-06T10:00:00.000Z",
    coverageComplete: true,
    now,
    ...overrides,
  };
}

describe("project-data-freshness-ui.v1 presentation mapping", () => {
  it("publishes a versioned presentation-only contract", () => {
    expect(projectDataFreshnessUiContract).toBe(
      "project-data-freshness-ui.v1",
    );
  });

  it.each([
    ["fresh", input(), "Fresh"],
    [
      "exactly 24 hours",
      input({ lastSuccessfulAt: "2026-08-05T12:00:00.000Z" }),
      "Fresh",
    ],
    [
      "24 hours plus 1 millisecond",
      input({ lastSuccessfulAt: "2026-08-05T11:59:59.999Z" }),
      "Stale",
    ],
    ["never synced", input({ lastSuccessfulAt: null }), "Stale"],
    [
      "queued",
      input({ latestRun: { id: "queued-run", status: "queued", finishedAt: null, errorCode: null } }),
      "Syncing",
    ],
    [
      "running",
      input({ latestRun: { id: "running-run", status: "running", finishedAt: null, errorCode: null } }),
      "Syncing",
    ],
    [
      "partial",
      input({ latestRun: { id: "partial-run", status: "partial", finishedAt: now, errorCode: null } }),
      "Partial",
    ],
    [
      "failed",
      input({ latestRun: { id: "failed-run", status: "failed", finishedAt: now, errorCode: "github_activity_timeout" } }),
      "Failed",
    ],
    ["authorization revoked", input({ authorizationRevoked: true }), "Authorization revoked"],
  ])("maps %s through the existing freshness domain rule", (_case, value, label) => {
    expect(createProjectFreshnessPresentation(value).label).toBe(label);
  });

  it("shows the stale warning only beyond 24 hours", () => {
    expect(
      createProjectFreshnessPresentation(
        input({ lastSuccessfulAt: "2026-08-05T12:00:00.000Z" }),
      ).showStaleWarning,
    ).toBe(false);
    expect(
      createProjectFreshnessPresentation(
        input({ lastSuccessfulAt: "2026-08-05T11:59:59.999Z" }),
      ).showStaleWarning,
    ).toBe(true);
  });

  it("formats the last successful time as deterministic absolute UTC", () => {
    expect(createProjectFreshnessPresentation(input()).lastSuccessful).toEqual({
      dateTime: "2026-08-06T10:00:00.000Z",
      label: "2026-08-06 10:00:00 UTC",
    });
  });

  it("shows a truncated current run only while queued or running", () => {
    expect(
      createProjectFreshnessPresentation(
        input({ latestRun: { id: "12345678-1234-4234-8234-123456789abc", status: "running", finishedAt: null, errorCode: null } }),
      ).currentRun,
    ).toEqual({ status: "running", safeId: "12345678…" });
    expect(createProjectFreshnessPresentation(input()).currentRun).toBeNull();
  });

  it("allows only frozen safe error codes and degrades unknown values", () => {
    expect(
      createProjectFreshnessPresentation(
        input({ latestRun: { id: "failed-run", status: "failed", finishedAt: now, errorCode: "github_activity_timeout" } }),
      ).safeErrorCode,
    ).toBe("github_activity_timeout");
    expect(
      createProjectFreshnessPresentation(
        input({ latestRun: { id: "failed-run", status: "failed", finishedAt: now, errorCode: "provider said token=secret" } }),
      ).safeErrorCode,
    ).toBe("sync_error");
  });

  it("keeps demo and real provenance explicit", () => {
    expect(createProjectFreshnessPresentation(input()).provenanceLabel).toBe(
      "演示数据 · 完全虚构",
    );
    expect(
      createProjectFreshnessPresentation(input({ provenance: "real" }))
        .provenanceLabel,
    ).toBe("真实项目数据");
  });
});
