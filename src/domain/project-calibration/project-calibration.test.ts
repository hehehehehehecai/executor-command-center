import { describe, expect, it } from "vitest";

import {
  parseProjectCalibrationInput,
  projectCalibrationContract,
  projectStatuses,
} from "./project-calibration";

const selectedRepositoryId = "11111111-1111-4111-8111-111111111111";

function validInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    selectedRepositoryId,
    coreGoal: "Ship a trustworthy MVP",
    currentStageGoal: "Calibrate the first project",
    status: "in_planning",
    currentBlocker: null,
    ...overrides,
  };
}

describe("project-calibration.v1", () => {
  it("accepts exactly the six formal statuses", () => {
    expect(projectCalibrationContract).toBe("project-calibration.v1");
    expect(projectStatuses).toEqual([
      "in_planning",
      "in_development",
      "polishing",
      "dormant",
      "completed",
      "archived",
    ]);

    for (const status of projectStatuses) {
      expect(parseProjectCalibrationInput(validInput({ status })).status).toBe(status);
    }
  });

  it.each([
    ["missing", {}],
    ["null", { coreGoal: null }],
    ["empty", { coreGoal: "" }],
    ["blank", { coreGoal: " \t" }],
    ["leading", { coreGoal: " leading" }],
    ["trailing", { coreGoal: "trailing " }],
    ["overlong", { coreGoal: "x".repeat(2001) }],
    ["utf16-overlong", { coreGoal: "🚀".repeat(1001) }],
  ])("rejects invalid required text: %s", (name, override) => {
    const input = validInput(override);
    if (name === "missing") delete (input as { coreGoal?: unknown }).coreGoal;
    expect(() => parseProjectCalibrationInput(input)).toThrow(
      "project_calibration_invalid_request",
    );
  });

  it.each([
    { currentBlocker: "" },
    { currentBlocker: "  " },
    { currentBlocker: " leading" },
    { currentBlocker: "trailing " },
    { currentBlocker: "x".repeat(2001) },
    { currentBlocker: "🚀".repeat(1001) },
  ])("rejects invalid provided blocker: %j", (override) => {
    expect(() => parseProjectCalibrationInput(validInput(override))).toThrow(
      "project_calibration_invalid_request",
    );
  });

  it("accepts missing and null blocker without rewriting text", () => {
    const missing = validInput();
    delete (missing as { currentBlocker?: unknown }).currentBlocker;
    expect(parseProjectCalibrationInput(missing)).toMatchObject({
      currentBlocker: null,
      coreGoal: "Ship a trustworthy MVP",
    });
    expect(parseProjectCalibrationInput(validInput()).currentBlocker).toBeNull();
  });

  it.each([
    { status: "planned" },
    { selectedRepositoryId: "not-a-uuid" },
    { currentStageGoal: null },
    { unknown: true },
  ])("rejects invalid or unknown fields before storage: %j", (override) => {
    expect(() => parseProjectCalibrationInput(validInput(override))).toThrow(
      "project_calibration_invalid_request",
    );
  });
});
