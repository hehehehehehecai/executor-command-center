import { describe, expect, it } from "vitest";
import { defaultAuthSuccessRedirect, safeReturnTo } from "./safe-return-to";

describe("t06-onboarding-state-regression.v1 safe navigation", () => {
  it.each([
    "/%25252f%25252fevil.example/path",
    "/%2525252f%2525252fevil.example/path",
    "/%25255cevil.example/path",
    "/%252500bad",
    "/%25250abad",
    "/%25257fbad",
    "/../%2f%2fevil.example/path",
    "/%2e%2e//evil.example/path",
    "/./%2f%2fevil.example/path",
    "//evil.example/path",
    "https://evil.example/path",
    "/\\evil.example/path",
    "/\tbad",
    "/%nothex",
  ])("[T06-N01] refuses unsafe or encoded-confused target: %s", target => {
    expect(safeReturnTo(target)).toBe(defaultAuthSuccessRedirect);
  });
  it.each([
    "/project-galaxy?mode=connected&project=62222222-2222-4222-8222-222222222222&tab=activity",
    "/onboarding?installation=configuration_failed",
    "/projects?name=%E6%8E%A2%E7%B4%A2%E8%80%85&tab=active#activity",
    "/settings#profile",
    "/projects?filter=owner%2Frepository",
  ])("[T06-N02] preserves the exact legitimate local path and query: %s", target => {
    expect(safeReturnTo(target)).toBe(target);
  });
});
