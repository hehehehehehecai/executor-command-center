import { describe, expect, it } from "vitest";

import {
  parseRepositoryRemovalCommand,
  repositoryRemovalConfirmationText,
} from "./repository-removal";

const projectId = "22222222-2222-4222-8222-222222222222";

describe("repository removal command", () => {
  it.each([
    ["REMOVE_REPOSITORY_DATA", `REMOVE ${projectId}`],
    ["DELETE_PROJECT_SUBTREE", `DELETE ${projectId}`],
  ] as const)("binds %s confirmation to the exact project", (mode, confirmationText) => {
    expect(repositoryRemovalConfirmationText(mode, projectId)).toBe(confirmationText);
    expect(
      parseRepositoryRemovalCommand({
        projectId,
        mode,
        idempotencyKey: "phase6-removal:request-1",
        confirmation: { projectId, text: confirmationText },
      }),
    ).toEqual({
      projectId,
      mode,
      idempotencyKey: "phase6-removal:request-1",
      confirmation: { projectId, text: confirmationText },
    });
  });

  it("rejects confirmation copied from a different project", () => {
    expect(() =>
      parseRepositoryRemovalCommand({
        projectId,
        mode: "DELETE_PROJECT_SUBTREE",
        idempotencyKey: "phase6-removal:request-2",
        confirmation: {
          projectId: "33333333-3333-4333-8333-333333333333",
          text: `DELETE ${projectId}`,
        },
      }),
    ).toThrow("repository_removal_confirmation_mismatch");
  });

  it("rejects unknown modes and malformed idempotency keys", () => {
    expect(() =>
      parseRepositoryRemovalCommand({
        projectId,
        mode: "DELETE",
        idempotencyKey: "spaces are unsafe",
        confirmation: { projectId, text: `DELETE ${projectId}` },
      }),
    ).toThrow("repository_removal_invalid_request");
  });
});
