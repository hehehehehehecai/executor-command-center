import { describe, expect, it } from "vitest";

import {
  IdentityInputError,
  validateUserIdentityInput,
} from "./user-identity-input";

const validInput = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  githubUserId: 123456789,
  githubLogin: "executor-user",
  avatarUrl: "https://avatars.githubusercontent.com/u/123456789",
} as const;

function expectInputError(
  input: Parameters<typeof validateUserIdentityInput>[0],
  code: IdentityInputError["code"],
) {
  expect(() => validateUserIdentityInput(input)).toThrowError(
    expect.objectContaining({ code }),
  );
}

describe("validateUserIdentityInput", () => {
  it("rejects an invalid auth user UUID before persistence", () => {
    expectInputError(
      { ...validInput, authUserId: "not-a-uuid" },
      "invalid_auth_user_id",
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid GitHub user ID %s before persistence",
    (githubUserId) => {
      expectInputError(
        { ...validInput, githubUserId },
        "invalid_github_user_id",
      );
    },
  );

  it("rejects an empty GitHub login after trimming", () => {
    expectInputError(
      { ...validInput, githubLogin: "   " },
      "invalid_github_login",
    );
  });

  it("rejects a GitHub login longer than the database limit", () => {
    expectInputError(
      { ...validInput, githubLogin: "x".repeat(256) },
      "invalid_github_login",
    );
  });

  it.each([
    "not-a-url",
    "ftp://avatars.example.test/user.png",
    `https://example.test/${"x".repeat(2049)}`,
  ])("rejects invalid avatar URL %s", (avatarUrl) => {
    expectInputError(
      { ...validInput, avatarUrl },
      "invalid_avatar_url",
    );
  });

  it("accepts null avatar and normalizes the display login", () => {
    expect(
      validateUserIdentityInput({
        ...validInput,
        githubLogin: "  renamed-user  ",
        avatarUrl: null,
      }),
    ).toEqual({
      ...validInput,
      githubLogin: "renamed-user",
      avatarUrl: null,
    });
  });
});
