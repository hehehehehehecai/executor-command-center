import { expect, test } from "vitest";

test("CI rejects deterministic assertion failures", () => {
  expect("quality-gate").toBe("expected-red-proof");
});
