import { describe, expect, it } from "vitest";

import {
  defaultAuthSuccessRedirect,
  safeReturnTo,
} from "./safe-return-to";

describe("github-sign-in.v1 returnTo validation", () => {
  it.each(["/onboarding", "/projects?tab=active", "/settings#profile"])(
    "accepts a local application path: %s",
    (value) => {
      expect(safeReturnTo(value)).toBe(value);
    },
  );

  it.each([
    undefined,
    "",
    "projects",
    "//evil.example/path",
    "https://evil.example/path",
    "javascript:alert(1)",
    "data:text/html,bad",
    "/\\evil.example/path",
    "/%5cevil.example/path",
    "/%2f%2fevil.example/path",
    "/%252f%252fevil.example/path",
    "/\u0000bad",
  ])("falls back for an unsafe target: %s", (value) => {
    expect(safeReturnTo(value)).toBe(defaultAuthSuccessRedirect);
  });
});
